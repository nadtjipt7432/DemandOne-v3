import { beforeEach, describe, expect, it } from 'vitest';
import { setLatencyScale } from '@/infra/clock';
import { createMemoryStorage } from '@/infra/storage';
import { capacityOf, consequencesOf, feasiblePairs } from '@/domain/allocation';
import { viewFor } from '@/domain/negotiation';
import { createAccount, setCapabilityProfile, setStandardOfValue } from '@/services/account';
import { allocationView, approveAllocation, authorizeAllocation } from '@/services/allocation';
import { createPosition } from '@/services/market';
import { acceptCounter } from '@/services/negotiation';
import { getState, hydrateStore } from '@/state/store';

setLatencyScale(0);

const me = () => getState().people[getState().account!.personId];
const offer = () => me().offers[0];
const view = () => allocationView(getState(), offer());
const nameOf = (id: string) => getState().people[id].name.split(' ')[0];

beforeEach(async () => {
  await hydrateStore(createMemoryStorage());
  await createAccount({ name: 'Jordan Lee', email: 'jordan@example.com', location: 'London' });
  await setCapabilityProfile({ summary: 'Financial modeling, valuation', categories: ['finance'], workTypes: ['analyze'] });
  await setStandardOfValue(['expertise', 'trust', 'budget', 'geography']);
  await createPosition({
    mode: 'offer',
    title: 'Financial modeling, 20 hours over two weeks',
    category: 'finance',
    price: 150,
    unit: 'hour',
    capacityHours: 20,
    weeks: 2,
    timing: { type: 'window', window: { startHour: 0, endHour: 336, label: 'Next two weeks' } },
  });
});

describe('released capacity and proposals', () => {
  it('splits 20 hours across two weeks and receives five proposals with real requests', () => {
    expect(offer().weeklyHours).toEqual([10, 10]);
    const v = view();
    expect(v.proposals).toHaveLength(5);
    expect(v.proposals.every((n) => n.request && n.request.hours > 0)).toBe(true);
    expect(v.capacity).toMatchObject({ released: 20, committed: 0, tentative: 0, free: 20 });
  });

  it('keeps bids below the seller’s minimum out of strategies', () => {
    const v = view();
    expect(v.belowMinimum.map((n) => nameOf(n.buyerId))).toEqual(['Nova']);
    expect(v.candidates).toHaveLength(4);
  });
});

describe('strategies', () => {
  it('offers three distinct strategies, none exceeding any week', () => {
    const v = view();
    expect(v.strategies.map((s) => s.key)).toEqual(['earnings', 'simple', 'flexible']);
    expect(new Set(v.strategies.map((s) => s.picks.map((c) => c.negotiation.id).sort().join()))).toHaveProperty('size', 3);
    for (const s of v.strategies) s.perWeek.forEach((h, i) => expect(h).toBeLessThanOrEqual(v.capacity.weeks[i].free));
  });

  it('maximizes earnings with three buyers, but recommends by the seller’s standard of value', () => {
    const v = view();
    const earnings = v.strategies.find((s) => s.key === 'earnings')!;
    expect(earnings.picks.map((c) => c.name.split(' ')[0]).sort()).toEqual(['Kite', 'Lumen', 'Northbridge']);
    expect(earnings.earnings).toBe(2395);
    expect(v.strategies.find((s) => s.key === 'simple')!.picks.map((c) => c.name)).toEqual(['Northbridge Partners']);
    const flexible = v.strategies.find((s) => s.key === 'flexible')!;
    expect(flexible.picks.map((c) => c.name.split(' ')[0]).sort()).toEqual(['Halden', 'Kite']);
    expect(flexible.free).toBe(10);
    expect(v.recommended?.key).not.toBe('earnings');
  });

  it('explains trade-offs in numbers', () => {
    const flexible = view().strategies.find((s) => s.key === 'flexible')!;
    expect(flexible.tradeoffs.join(' ')).toMatch(/less than the highest-earning mix, but 10 hours stay free/);
  });

  it('answers what-if and pairing questions from the real state', () => {
    const v = view();
    const nb = v.candidates.find((c) => c.name.startsWith('Northbridge'))!;
    const after = consequencesOf(nb, v.candidates, v.capacity);
    expect(after.blocked.map((c) => c.name.split(' ')[0])).toEqual(['Halden']);
    const { pairs, conflicts } = feasiblePairs(v.candidates, v.capacity);
    expect(conflicts.some(([a, b]) => [a.name, b.name].sort().join() === 'Halden Capital,Northbridge Partners')).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
  });
});

describe('authorize → approve → allocate', () => {
  it('reserves tentatively, negotiates, then commits on approval and declines what no longer fits', async () => {
    expect((await authorizeAllocation(offer().id, 'flexible')).ok).toBe(true);
    const plan = offer().allocation!;
    expect(plan.status).toBe('ready');
    expect(capacityOf(getState(), offer())).toMatchObject({ tentative: 10, committed: 0, free: 10 });
    for (const id of plan.negotiationIds) expect(getState().negotiations[id].status).toBe('accepted');
    expect(getState().bookings).toHaveLength(0);

    const { bookingIds } = await approveAllocation(offer().id);
    expect(bookingIds).toHaveLength(2);
    expect(capacityOf(getState(), offer())).toMatchObject({ committed: 10, tentative: 0, free: 10 });
    const status = (who: string) => Object.values(getState().negotiations).find((n) => nameOf(n.buyerId) === who)!.status;
    expect(status('Northbridge')).toBe('withdrawn');
    expect(status('Nova')).toBe('withdrawn');
    expect(status('Lumen')).toBe('countered');
    const b = getState().bookings[0];
    expect(b.total).toBe(b.terms.price * b.terms.hours!);
  });

  it('negotiates below-ask bids up, never under the seller’s minimum', async () => {
    await authorizeAllocation(offer().id, 'earnings');
    const agreed = offer().allocation!.negotiationIds.map((id) => getState().negotiations[id]);
    const price = (who: string) => agreed.find((n) => nameOf(n.buyerId) === who)!.proposals.find((p) => p.id === agreed.find((n) => nameOf(n.buyerId) === who)!.agreedProposalId)!.terms.price;
    expect(price('Northbridge')).toBeGreaterThan(140);
    expect(price('Lumen')).toBeGreaterThan(135);
    expect(price('Kite')).toBe(150);
    for (const n of agreed) expect(viewFor(n, me().id).theirs).toEqual(viewFor(n, n.buyerId).mine);
  });

  it('refuses to double-book', async () => {
    const v = view();
    const nb = v.candidates.find((c) => c.name.startsWith('Northbridge'))!.negotiation;
    const halden = v.candidates.find((c) => c.name.startsWith('Halden'))!.negotiation;
    expect((await acceptCounter(nb.id)).ok).toBe(true);
    expect(await acceptCounter(halden.id)).toEqual({ ok: false, issue: 'over-capacity' });
  });
});
