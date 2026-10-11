/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLatencyScale } from '@/infra/clock';
import { createMemoryStorage } from '@/infra/storage';
import { LISTED_TERMS } from '@/domain/terms';
import { viewFor } from '@/domain/negotiation';
import { addPaymentMethod, createAccount, resetDemoMarket, setCapabilityProfile, setStandardOfValue, updateProfile } from '@/services/account';
import { createPosition } from '@/services/market';
import { acceptCounter, acceptListing, bidsOnOffer, holdPosition, ownLimit, proposeTerms, startNegotiation, stopNegotiation } from '@/services/negotiation';
import {
  authorizePayment,
  confirmCompletion,
  markDelivered,
  simulateBuyerConfirmation,
  simulateSellerDelivery,
  submitFeedback,
} from '@/services/transactions';
import { getDecisions, getRelevantDemand } from '@/state/myMarket';
import { flushWrites, getState, hydrateStore } from '@/state/store';
import type { Terms } from '@/domain/types';

setLatencyScale(0);
let storage: ReturnType<typeof createMemoryStorage>;

const me = () => getState().people[getState().account!.personId];
const t = (price: number, patch: Partial<Terms> = {}): Terms => ({ ...LISTED_TERMS, price, ...patch });

async function onboardJordan() {
  await createAccount({ name: 'Jordan Lee', email: 'jordan@example.com', location: 'London' });
  await setCapabilityProfile({ summary: 'Financial modeling, market research, valuation', categories: ['finance', 'strategy'], workTypes: ['analyze'] });
  await setStandardOfValue(['expertise', 'trust', 'budget', 'geography']);
}

beforeEach(async () => {
  storage = createMemoryStorage();
  await hydrateStore(storage);
  await onboardJordan();
});

describe('profile', () => {
  it('reflects exactly what was entered, and edits persist across a reload', async () => {
    expect(me()).toMatchObject({ name: 'Jordan Lee', location: 'London', initials: 'JL' });
    expect(me().capability?.summary).toBe('Financial modeling, market research, valuation');
    expect(await updateProfile({ location: 'Manchester', background: 'Ex-Deloitte valuation', links: 'linkedin.com/in/jordanlee' })).toEqual({ ok: true });
    await flushWrites();
    await hydrateStore(storage);
    expect(me()).toMatchObject({ location: 'Manchester', background: 'Ex-Deloitte valuation', links: ['https://linkedin.com/in/jordanlee'] });
  });

  it('rejects invalid edits without saving anything', async () => {
    const res = await updateProfile({ name: 'J', links: 'not a link' });
    expect(res.ok).toBe(false);
    expect(me().name).toBe('Jordan Lee');
  });

  it('capabilities surface relevant demand without creating offers', () => {
    const demand = getRelevantDemand(getState(), me());
    expect(demand.length).toBeGreaterThan(0);
    expect(demand.every((c) => c.kind === 'need' && ['finance', 'strategy'].includes(c.category))).toBe(true);
    expect(me().offers).toEqual([]);
  });

  it('resetting the demo market keeps the real profile', async () => {
    await updateProfile({ location: 'Manchester' });
    await startNegotiation('c1', t(5000), 5600);
    await resetDemoMarket();
    expect(me()).toMatchObject({ name: 'Jordan Lee', location: 'Manchester' });
    expect(getState().negotiations).toEqual({});
    expect(getState().account?.email).toBe('jordan@example.com');
  });
});

describe('buyer journey', () => {
  it('negotiates, agrees, pays, receives, completes and gives feedback — updating the right records', async () => {
    const opened = await startNegotiation('c1', t(5000), 5600);
    expect(opened.ok).toBe(true);
    const negId = opened.ok ? opened.negotiationId : '';
    expect(getState().negotiations[negId].status).toBe('countered');
    expect(ownLimit(getState(), negId)).toBe(5600);

    // Repeating the same proposal does nothing.
    expect(await proposeTerms(negId, t(5000))).toEqual({ ok: false, issue: 'duplicate' });

    const traded = await proposeTerms(negId, t(5200, { deadline: 'plus3' }));
    expect(traded.ok).toBe(true);
    const n = getState().negotiations[negId];
    expect(['countered', 'accepted']).toContain(n.status);

    const agreed = n.status === 'accepted' ? { ok: true as const, bookingId: n.bookingId! } : await acceptCounter(negId);
    expect(agreed.ok).toBe(true);
    const bookingId = agreed.ok ? agreed.bookingId! : '';
    const booking = () => getState().bookings.find((b) => b.id === bookingId)!;
    expect(booking()).toMatchObject({ status: 'agreed', buyerId: me().id, sellerId: 'alex', openingPrice: 6000 });
    expect(booking().fees.buyerTotal).toBe(booking().terms.price + booking().fees.buyerFee);
    expect(booking().fees.sellerNet).toBe(booking().terms.price - booking().fees.sellerFee);

    await expect(authorizePayment(bookingId)).rejects.toThrow(/payment method/);
    await addPaymentMethod('Demo Visa ending 4242');
    await authorizePayment(bookingId);
    expect(booking()).toMatchObject({ status: 'paid', payment: { methodLabel: 'Demo Visa ending 4242', demo: true } });

    const alexBefore = getState().people.alex;
    await simulateSellerDelivery(bookingId);
    await confirmCompletion(bookingId);
    expect(booking().status).toBe('complete');
    expect(getState().negotiations[negId].status).toBe('cleared');
    expect(me()).toMatchObject({ completedCount: 1, recommendCount: 1 });
    expect(getState().people.alex.completedCount).toBe(alexBefore.completedCount + 1);

    await submitFeedback(bookingId, true);
    await submitFeedback(bookingId, true);
    expect(getState().people.alex.recommendCount).toBe(alexBefore.recommendCount + 1);
    expect(booking().feedback.byBuyer).toBe(true);
  });

  it('can take the listing as it stands', async () => {
    const res = await acceptListing('c2');
    expect(res.ok).toBe(true);
    const b = getState().bookings[0];
    expect(b.terms.price).toBe(150);
    expect(getState().cards.find((c) => c.id === 'c2')).toBeDefined();
  });

  it('can stop a negotiation, and a lowball fails', async () => {
    const low = await startNegotiation('c3', t(9000), 20000);
    const lowId = low.ok ? low.negotiationId : '';
    expect(getState().negotiations[lowId].status).toBe('rejected');
    const res = await startNegotiation('c4', t(190), 210);
    const id = res.ok ? res.negotiationId : '';
    await holdPosition(id);
    expect(getState().negotiations[id].events.at(-1)!.type).toBe('held');
    await stopNegotiation(id);
    expect(getState().negotiations[id].status).toBe('withdrawn');
  });

  it('will not negotiate a fixed-price listing', async () => {
    expect(await startNegotiation('c5', t(2000), 2400)).toEqual({ ok: false, issue: 'not-negotiable' });
  });
});

describe('seller journey', () => {
  it('releasing an offer draws competing bids, and a sale completes on both records', async () => {
    const offerId = await createPosition({ mode: 'offer', title: 'Financial modeling, 10 hours next week', category: 'finance', price: 150, unit: 'hour', capacityHours: 10 });
    const bids = bidsOnOffer(getState(), offerId);
    expect(bids).toHaveLength(5);
    expect(bids.every((b) => b.request && b.proposals[1].terms.hours === b.request.hours)).toBe(true);
    expect(getDecisions(getState(), me().id).some((d) => d.kind === 'bids')).toBe(true);

    const pick = bids.find((b) => b.request!.hours <= 5)!;
    const res = await acceptCounter(pick.id);
    const bookingId = res.ok ? res.bookingId! : '';
    const b = () => getState().bookings.find((x) => x.id === bookingId)!;
    expect(b()).toMatchObject({ status: 'paid', sellerId: me().id, buyerId: pick.buyerId });

    // Both parties' views of the shared negotiation agree.
    const n = getState().negotiations[pick.id];
    expect(viewFor(n, me().id).theirs).toEqual(viewFor(n, pick.buyerId).mine);

    await markDelivered(bookingId);
    await simulateBuyerConfirmation(bookingId);
    expect(b().status).toBe('complete');
    expect(me().completedCount).toBe(1);
  });
});

describe('privacy', () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f: string) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  }

  it('no screen or component reads counterparties’ private limits', () => {
    const root = join(process.cwd(), 'src');
    const ui = [...files(join(root, 'app')), ...files(join(root, 'components'))];
    for (const f of ui) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\breservations\b|privateLimits|floorPrice|ceilingPrice/);
    }
  });
});
