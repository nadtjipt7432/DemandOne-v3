import { delay, nowIso } from '@/infra/clock';
import { markCleared } from '@/domain/negotiation';
import { computeFees } from '@/domain/pricing';
import { deadlineLabel } from '@/domain/terms';
import { getState, id, setState } from '@/state/store';
import { viewerOf } from './viewer';
import { applyReview, ReviewedRole, ReviewInput, ReviewIssue, simulatedReviewOf, toReview, validateReview } from '@/domain/feedback';
import type { AppState, Booking, BookingStatus, Person, Review } from '@/domain/types';

/**
 * The transaction lifecycle on one shared record:
 * agreed → paid (held, demo) → delivered → complete, then reciprocal feedback.
 * The viewer acts for their own side; the simulated counterparty's actions are
 * explicit demo controls, so nothing advances on its own behind the user's back.
 */

/** The value of agreed terms: rate × hours for hourly work, otherwise the price. */
export function agreedTotal(terms: { price: number; hours?: number }): number {
  return terms.hours ? terms.price * terms.hours : terms.price;
}

/** Create the shared transaction for an accepted negotiation. Sync — used inside state updaters. */
export function createBookingFor(s: AppState, negotiationId: string): { state: AppState; bookingId: string } {
  const n = s.negotiations[negotiationId];
  const agreed = n?.proposals.find((p) => p.id === n.agreedProposalId);
  if (!n || !agreed) return { state: s, bookingId: '' };
  if (n.bookingId) return { state: s, bookingId: n.bookingId };

  const bookingId = id('bk');
  const card = n.listing.cardId ? s.cards.find((c) => c.id === n.listing.cardId) : undefined;
  const viewerId = s.account?.personId;
  const buyerIsCounterparty = n.buyerId !== viewerId;
  const booking: Booking = {
    id: bookingId,
    negotiationId: n.id,
    title: n.listing.title,
    category: n.listing.category,
    unit: n.listing.unit,
    buyerId: n.buyerId,
    sellerId: n.sellerId,
    terms: agreed.terms,
    openingPrice: (n.proposals.find((p) => p.by === 'seller') ?? n.proposals[0]).terms.price,
    openingBid: n.proposals.find((p) => p.by === 'buyer')?.terms.price,
    total: agreedTotal(agreed.terms),
    fees: computeFees(agreedTotal(agreed.terms)),
    // A simulated buyer pays at agreement (demo); a real buyer — the viewer — authorizes it themselves.
    status: buyerIsCounterparty ? 'paid' : 'agreed',
    payment: buyerIsCounterparty ? { methodLabel: 'Counterparty card (demo)', authorizedAt: nowIso(), demo: true } : undefined,
    deliveryLabel: deadlineLabel(agreed.terms.deadline, n.listing.timingLabel),
    window: card?.window,
    feedback: {},
    createdAt: nowIso(),
  };

  // Capacity is consumed by the agreement: a slot comes off the listing; a filled need leaves the market.
  let cards = s.cards;
  if (card) {
    if (card.kind === 'need') cards = cards.filter((c) => c.id !== card.id);
    else if (card.capacity?.unit === 'slots') {
      const remaining = card.capacity.remaining - 1;
      cards = remaining <= 0 ? cards.filter((c) => c.id !== card.id) : cards.map((c) => (c.id === card.id ? { ...c, capacity: { ...card.capacity!, remaining } } : c));
    }
  }

  return {
    bookingId,
    state: {
      ...s,
      cards,
      bookings: [booking, ...s.bookings],
      negotiations: { ...s.negotiations, [n.id]: { ...n, bookingId } },
    },
  };
}

function updateBooking(s: AppState, bookingId: string, fn: (b: Booking) => Booking): AppState {
  return { ...s, bookings: s.bookings.map((b) => (b.id === bookingId ? fn(b) : b)) };
}

function requireBooking(bookingId: string): Booking {
  const b = getState().bookings.find((x) => x.id === bookingId);
  if (!b) throw new Error('Transaction not found');
  return b;
}

export function roleOf(b: Booking, viewerId: string): 'buyer' | 'seller' {
  return b.buyerId === viewerId ? 'buyer' : 'seller';
}

export function counterpartyOf(b: Booking, viewerId: string): string {
  return b.buyerId === viewerId ? b.sellerId : b.buyerId;
}

function expectStatus(b: Booking, status: BookingStatus, role: 'buyer' | 'seller', viewerId: string): void {
  if (b.status !== status) throw new Error(`Expected ${status}, transaction is ${b.status}`);
  if (roleOf(b, viewerId) !== role) throw new Error(`Only the ${role} can do this`);
}

/** Buyer: authorize the agreed total from a saved payment method. Simulated — no money moves. */
export async function authorizePayment(bookingId: string): Promise<void> {
  await delay(500);
  const s = getState();
  const viewerId = viewerOf(s).id;
  expectStatus(requireBooking(bookingId), 'agreed', 'buyer', viewerId);
  const method = s.paymentMethods.find((p) => p.id === s.defaultPaymentId);
  if (!method) throw new Error('Add a payment method first');
  setState((st) => updateBooking(st, bookingId, (b) => ({ ...b, status: 'paid', payment: { methodLabel: method.label, authorizedAt: nowIso(), demo: true } })));
}

/** Seller (viewer): the work is delivered. Payment stays held until the buyer confirms. */
export async function markDelivered(bookingId: string): Promise<void> {
  await delay(300);
  expectStatus(requireBooking(bookingId), 'paid', 'seller', viewerOf(getState()).id);
  setState((s) => updateBooking(s, bookingId, (b) => ({ ...b, status: 'delivered', deliveredAt: nowIso() })));
}

/** Demo control: the simulated seller delivers. */
export async function simulateSellerDelivery(bookingId: string): Promise<void> {
  await delay(500);
  expectStatus(requireBooking(bookingId), 'paid', 'buyer', viewerOf(getState()).id);
  setState((s) => updateBooking(s, bookingId, (b) => ({ ...b, status: 'delivered', deliveredAt: nowIso() })));
}

/** Buyer (viewer): confirm the work is done. Releases payment and completes the transaction. */
export async function confirmCompletion(bookingId: string): Promise<void> {
  await delay(400);
  expectStatus(requireBooking(bookingId), 'delivered', 'buyer', viewerOf(getState()).id);
  setState((s) => complete(s, bookingId));
}

/** Demo control: the simulated buyer confirms the viewer's delivery. */
export async function simulateBuyerConfirmation(bookingId: string): Promise<void> {
  await delay(500);
  expectStatus(requireBooking(bookingId), 'delivered', 'seller', viewerOf(getState()).id);
  setState((s) => complete(s, bookingId));
}

function bump(p: Person, completed: number, recommended: number): Person {
  return { ...p, completedCount: p.completedCount + completed, recommendCount: p.recommendCount + recommended };
}

/** Record a received review on a person: their recommendation count and per-aspect record. */
function receive(p: Person, review: Review, from: { name: string; role: ReviewedRole }): Person {
  return { ...bump(p, 0, review.recommends ? 1 : 0), reputation: applyReview(p.reputation, review, from) };
}

/**
 * Completion: both parties gain a verified completed transaction and the
 * negotiation clears. The simulated counterparty leaves its review of the viewer
 * (demo); it stays sealed, and off the viewer's record, until the viewer leaves theirs.
 */
function complete(s: AppState, bookingId: string): AppState {
  const b = s.bookings.find((x) => x.id === bookingId)!;
  const viewerId = viewerOf(s).id;
  const otherId = counterpartyOf(b, viewerId);
  const viewerRole = roleOf(b, viewerId);
  const at = nowIso();
  const theirs = simulatedReviewOf(viewerRole, at);
  const feedback = viewerRole === 'buyer' ? { ...b.feedback, bySeller: theirs } : { ...b.feedback, byBuyer: theirs };
  const n = s.negotiations[b.negotiationId];
  const other = s.people[otherId];
  return {
    ...updateBooking(s, bookingId, (x) => ({ ...x, status: 'complete', completedAt: at, feedback })),
    people: {
      ...s.people,
      [viewerId]: bump(s.people[viewerId], 1, 0),
      ...(other ? { [otherId]: bump(other, 1, 0) } : {}),
    },
    negotiations: n ? { ...s.negotiations, [n.id]: markCleared(n, { now: at, newId: id }) } : s.negotiations,
  };
}

export type FeedbackResult = { ok: true } | { ok: false; issue: ReviewIssue | 'not-complete' | 'already-given' };

/**
 * The viewer's review of the counterparty, once per transaction. The form sends a
 * complete review; voice can send a quick one (recommendation only). Sending it
 * unseals the counterparty's review of the viewer, and both land on the records.
 */
export async function submitFeedback(bookingId: string, input: ReviewInput | boolean, opts: { quick?: boolean } = {}): Promise<FeedbackResult> {
  const review: ReviewInput = typeof input === 'boolean' ? { recommends: input } : input;
  const quick = opts.quick ?? typeof input === 'boolean';
  const b = getState().bookings.find((x) => x.id === bookingId);
  if (!b || b.status !== 'complete') return { ok: false, issue: 'not-complete' };
  const viewerId = viewerOf(getState()).id;
  const role = roleOf(b, viewerId);
  if (viewerFeedback(b, viewerId) !== undefined) return { ok: false, issue: 'already-given' };
  const otherRole: ReviewedRole = role === 'buyer' ? 'seller' : 'buyer';
  const issue = validateReview(review, otherRole, !quick);
  if (issue) return { ok: false, issue };
  await delay(250);
  setState((s) => {
    const cur = s.bookings.find((x) => x.id === bookingId)!;
    if (viewerFeedback(cur, viewerId) !== undefined) return s;
    const mine = toReview(review, nowIso());
    const theirs = role === 'buyer' ? cur.feedback.bySeller : cur.feedback.byBuyer;
    const otherId = counterpartyOf(cur, viewerId);
    const other = s.people[otherId];
    const viewer = s.people[viewerId];
    return {
      ...updateBooking(s, bookingId, (x) => ({ ...x, feedback: role === 'buyer' ? { ...x.feedback, byBuyer: mine } : { ...x.feedback, bySeller: mine } })),
      people: {
        ...s.people,
        ...(other ? { [otherId]: receive(other, mine, { name: viewer.name, role }) } : {}),
        ...(theirs && other ? { [viewerId]: receive(viewer, theirs, { name: other.name, role: otherRole }) } : {}),
      },
    };
  });
  return { ok: true };
}

/** The viewer's own review on this transaction, if given. */
export function viewerFeedback(b: Booking, viewerId: string): Review | undefined {
  return roleOf(b, viewerId) === 'buyer' ? b.feedback.byBuyer : b.feedback.bySeller;
}

/** The counterparty's review of the viewer: sealed until the viewer has left theirs. */
export function receivedFeedback(b: Booking, viewerId: string): { review?: Review; sealed: boolean } {
  const review = roleOf(b, viewerId) === 'buyer' ? b.feedback.bySeller : b.feedback.byBuyer;
  if (!review) return { sealed: false };
  return viewerFeedback(b, viewerId) ? { review, sealed: false } : { sealed: true };
}
