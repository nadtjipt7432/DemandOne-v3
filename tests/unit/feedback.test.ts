import { beforeEach, describe, expect, it } from 'vitest';
import { setLatencyScale } from '@/infra/clock';
import { MIGRATIONS } from '@/infra/migrations';
import { seedPeople } from '@/infra/seed';
import { createMemoryStorage } from '@/infra/storage';
import { applyReview, strongestAspect, summarizeAspects, toReview, validateReview } from '@/domain/feedback';
import { addPaymentMethod, createAccount } from '@/services/account';
import { acceptListing } from '@/services/negotiation';
import { authorizePayment, confirmCompletion, receivedFeedback, simulateSellerDelivery, submitFeedback } from '@/services/transactions';
import { getState, hydrateStore } from '@/state/store';

setLatencyScale(0);

const me = () => getState().people[getState().account!.personId];
const full = { quality: 'exceeded', timeliness: 'met', communication: 'met', scope: 'met' } as const;

describe('rules', () => {
  it('a complete review rates every aspect of the other side’s role', () => {
    expect(validateReview({ recommends: true, ratings: { quality: 'met' } }, 'seller', true)).toBe('unrated');
    expect(validateReview({ recommends: true, ratings: full }, 'seller', true)).toBeNull();
    expect(validateReview({ recommends: true, ratings: full }, 'buyer', true)).toBe('unrated');
  });

  it('a "no" has to say why — a fell-short aspect or a note', () => {
    expect(validateReview({ recommends: false, ratings: full }, 'seller', true)).toBe('unexplained');
    expect(validateReview({ recommends: false, ratings: { ...full, timeliness: 'short' } }, 'seller', true)).toBeNull();
    expect(validateReview({ recommends: false, ratings: full, note: 'Missed the board meeting.' }, 'seller', true)).toBeNull();
    expect(validateReview({ recommends: false }, 'seller', false)).toBe('unexplained');
  });

  it('limits the note', () => {
    expect(validateReview({ recommends: true, ratings: full, note: 'x'.repeat(281) }, 'seller', true)).toBe('note-too-long');
  });

  it('folds reviews into a per-aspect record with the latest notes', () => {
    let rep = applyReview(undefined, toReview({ recommends: true, ratings: full, note: 'Great.' }, '2026-10-01'), { name: 'Kite Labs', role: 'buyer' });
    rep = applyReview(rep, toReview({ recommends: false, ratings: { ...full, quality: 'short' } }, '2026-10-02'), { name: 'Nova', role: 'buyer' });
    expect(rep.aspects.quality).toEqual({ short: 1, met: 0, exceeded: 1 });
    expect(rep.notes).toEqual([{ text: 'Great.', from: 'Kite Labs', role: 'buyer', at: '2026-10-01' }]);
    expect(summarizeAspects(rep).find((a) => a.key === 'timeliness')!.line).toBe('2 of 2 as agreed or better');
  });

  it('seeds a consistent record for established counterparties', () => {
    const alex = seedPeople.alex;
    for (const a of summarizeAspects(alex.reputation)) expect(a.total).toBe(alex.completedCount);
    const shorts = summarizeAspects(alex.reputation).reduce((n, a) => n + a.short, 0);
    expect(shorts).toBe(alex.completedCount - alex.recommendCount);
    expect(strongestAspect(alex.reputation)).toBeDefined();
    expect(seedPeople.lumen.reputation).toBeUndefined();
  });
});

describe('sealed, reciprocal feedback on a real transaction', () => {
  let bookingId = '';
  beforeEach(async () => {
    await hydrateStore(createMemoryStorage());
    await createAccount({ name: 'Jordan Lee', email: 'jordan@example.com', location: 'London' });
    await acceptListing('c2');
    bookingId = getState().bookings[0].id;
    await addPaymentMethod('Demo Visa ending 4242');
    await authorizePayment(bookingId);
    await simulateSellerDelivery(bookingId);
    await confirmCompletion(bookingId);
  });

  it('keeps their feedback sealed until ours is sent, then puts both on the records', async () => {
    const b = () => getState().bookings[0];
    const sellerId = b().sellerId;
    const before = getState().people[sellerId].reputation!.aspects.quality!;
    expect(receivedFeedback(b(), me().id)).toEqual({ sealed: true });
    expect(me().reputation).toBeUndefined();

    expect(await submitFeedback(bookingId, { recommends: true, ratings: { quality: 'met' } })).toEqual({ ok: false, issue: 'unrated' });
    expect(await submitFeedback(bookingId, { recommends: true, ratings: full, note: 'Sharp model.' })).toEqual({ ok: true });

    const seller = getState().people[sellerId];
    expect(seller.reputation!.aspects.quality).toEqual({ ...before, exceeded: before.exceeded + 1 });
    expect(seller.reputation!.notes[0]).toMatchObject({ text: 'Sharp model.', from: 'Jordan Lee', role: 'buyer' });

    const theirs = receivedFeedback(b(), me().id);
    expect(theirs.sealed).toBe(false);
    expect(theirs.review).toMatchObject({ recommends: true, simulated: true });
    expect(me().recommendCount).toBe(1);
    expect(me().reputation!.aspects.brief).toEqual({ short: 0, met: 1, exceeded: 0 });
  });
});

describe('migration v3 → v4', () => {
  it('turns yes/no feedback into reviews and gives seeded people their records', () => {
    const { reputation: _r, ...oldAlex } = seedPeople.alex;
    const v4 = MIGRATIONS[3]({
      people: { alex: oldAlex },
      bookings: [{ id: 'b', createdAt: '2026-10-01', completedAt: '2026-10-02', feedback: { byBuyer: true } }],
    }) as { people: Record<string, { reputation?: unknown }>; bookings: { feedback: Record<string, unknown> }[] };
    expect(v4.bookings[0].feedback.byBuyer).toEqual({ recommends: true, ratings: {}, at: '2026-10-02' });
    expect(v4.bookings[0].feedback.bySeller).toBeUndefined();
    expect(v4.people.alex.reputation).toEqual(seedPeople.alex.reputation);
  });
});
