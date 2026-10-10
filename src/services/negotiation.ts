import { delay, nowIso } from '@/infra/clock';
import { computeFit, passesHardConstraints } from '@/domain/matching';
import {
  acceptStanding,
  createNegotiation,
  expireIfDue,
  hold,
  isTerminal,
  otherSide,
  respond,
  sideOf,
  submitProposal,
  validateProposal,
  withdraw,
  type EngineCtx,
  type ProposalIssue,
} from '@/domain/negotiation';
import { LISTED_TERMS, roundTo, priceStep } from '@/domain/terms';
import { getState, id, setState } from '@/state/store';
import { createBookingFor } from './transactions';
import { viewerOf } from './viewer';
import type { AppState, MatchCard, Negotiation, Offer, Person, Terms } from '@/domain/types';

/**
 * Negotiation services: the store-facing side of domain/negotiation.ts. Every
 * transition is a real state change on the shared record; the counterparty's
 * response comes from the engine's policy after a short simulated delay.
 */

const RESPONSE_DELAY_MS = 900;

function ctx(): EngineCtx {
  return { now: nowIso(), newId: id };
}

export type NegotiationResult = { ok: true; negotiationId: string; bookingId?: string } | { ok: false; issue: ProposalIssue | 'not-negotiable' | 'not-found' };

function putNegotiation(s: AppState, n: Negotiation): AppState {
  return { ...s, negotiations: { ...s.negotiations, [n.id]: n } };
}

/** Viewer's private limit on a negotiation — theirs to see, nobody else's. */
export function ownLimit(s: AppState, negotiationId: string): number | undefined {
  const viewerId = s.account?.personId;
  return viewerId ? s.privateLimits[negotiationId]?.[viewerId] : undefined;
}

export function activeNegotiationForCard(s: AppState, cardId: string): Negotiation | undefined {
  return Object.values(s.negotiations).find((n) => n.listing.cardId === cardId && !isTerminal(n));
}

/** The viewer's own starting limit for a listing: their matching Need's maximum or Offer's minimum, else the listed price. */
export function defaultOwnLimit(card: MatchCard, viewer: Person): number {
  if (card.kind === 'offer') return viewer.needs.find((n) => n.category === card.category)?.budgetMax ?? card.price;
  return viewer.offers.find((o) => o.category === card.category)?.floorPrice ?? card.price;
}

/** Suggested opening: below the ask for a buyer, above the budget for a seller, within the viewer's limit. */
export function suggestedOpening(card: MatchCard, limit: number): number {
  const step = priceStep(card.price);
  return card.kind === 'offer'
    ? Math.min(limit, roundTo(card.price * 0.85, step, 'down'))
    : Math.max(limit, roundTo(card.price * 1.12, step, 'up'));
}

/** Expire standing counters whose response window has passed. */
export function expireStale(): void {
  const c = ctx();
  setState((s) => {
    let changed = false;
    const negotiations = { ...s.negotiations };
    for (const n of Object.values(s.negotiations)) {
      const next = expireIfDue(n, c);
      if (next !== n) {
        negotiations[n.id] = next;
        changed = true;
      }
    }
    return changed ? { ...s, negotiations } : s;
  });
}

/** Wait, then let the counterparty respond to whatever is awaiting response. Creates the booking on acceptance. */
async function counterpartyResponds(negotiationId: string): Promise<string | undefined> {
  await delay(RESPONSE_DELAY_MS);
  let bookingId: string | undefined;
  setState((s) => {
    const n = s.negotiations[negotiationId];
    if (!n || n.status !== 'awaiting_response') return s;
    const viewerId = viewerOf(s).id;
    const responder = otherSide(sideOf(n, viewerId));
    const responderId = responder === 'buyer' ? n.buyerId : n.sellerId;
    const limit = s.privateLimits[n.id]?.[responderId] ?? n.proposals[0].terms.price;
    const card = n.listing.cardId ? s.cards.find((c) => c.id === n.listing.cardId) : undefined;
    const negotiable = card ? card.negotiable : true;
    const next = respond(n, responder, limit, negotiable, ctx());
    let out = putNegotiation(s, next);
    if (next.status === 'accepted') {
      const res = createBookingFor(out, next.id);
      out = res.state;
      bookingId = res.bookingId;
    }
    return out;
  });
  return bookingId;
}

function compatibleRank(s: AppState, card: MatchCard): { compared: number; rank: number } {
  const viewer = viewerOf(s);
  const pool = s.cards.filter((c) => c.kind === card.kind && c.category === card.category && passesHardConstraints(c, viewer));
  const ranked = pool
    .map((c) => ({ id: c.id, score: computeFit(c, viewer, s.people[c.personId]).score }))
    .sort((a, b) => b.score - a.score);
  return { compared: Math.max(1, ranked.length), rank: Math.max(1, ranked.findIndex((r) => r.id === card.id) + 1) };
}

function negotiationFromCard(s: AppState, card: MatchCard): Negotiation {
  const viewer = viewerOf(s);
  const viewerBuys = card.kind === 'offer';
  const { compared, rank } = compatibleRank(s, card);
  return createNegotiation(
    {
      listing: { kind: card.kind, ownerId: card.personId, title: card.title, category: card.category, unit: card.unit, timingLabel: card.window.label, cardId: card.id },
      buyerId: viewerBuys ? viewer.id : card.personId,
      sellerId: viewerBuys ? card.personId : viewer.id,
      initiatorId: viewer.id,
      listingTerms: { price: card.price, ...LISTED_TERMS },
      compared,
      rank,
    },
    ctx()
  );
}

/**
 * Authorize the agent: open a negotiation on a listing with the viewer's opening
 * proposal and private limit. Nothing is stored if the opening proposal is invalid.
 */
export async function startNegotiation(cardId: string, opening: Terms, limit: number): Promise<NegotiationResult> {
  await delay(300);
  const s = getState();
  const existing = activeNegotiationForCard(s, cardId);
  if (existing) return { ok: true, negotiationId: existing.id };
  const card = s.cards.find((c) => c.id === cardId);
  if (!card) return { ok: false, issue: 'not-found' };
  if (!card.negotiable) return { ok: false, issue: 'not-negotiable' };

  const draft = negotiationFromCard(s, card);
  const side = sideOf(draft, viewerOf(s).id);
  const issue = validateProposal(draft, side, opening, limit);
  if (issue) return { ok: false, issue };

  const submitted = submitProposal(draft, side, opening, ctx());
  setState((st) => ({
    ...putNegotiation(st, submitted),
    privateLimits: {
      ...st.privateLimits,
      [submitted.id]: { [viewerOf(st).id]: limit, [card.personId]: st.reservations[card.id] ?? card.price },
    },
  }));
  const bookingId = await counterpartyResponds(submitted.id);
  return { ok: true, negotiationId: submitted.id, bookingId };
}

/** Take the listing's public terms as they stand — one record, accepted immediately. */
export async function acceptListing(cardId: string): Promise<NegotiationResult> {
  await delay(300);
  const s = getState();
  const card = s.cards.find((c) => c.id === cardId);
  if (!card) return { ok: false, issue: 'not-found' };
  const existing = activeNegotiationForCard(s, cardId);
  if (existing) return acceptCounter(existing.id);
  const draft = negotiationFromCard(s, card);
  const accepted = acceptStanding({ ...draft, status: 'countered' }, sideOf(draft, viewerOf(s).id), ctx());
  let bookingId = '';
  setState((st) => {
    const res = createBookingFor(putNegotiation(st, accepted), accepted.id);
    bookingId = res.bookingId;
    return res.state;
  });
  return { ok: true, negotiationId: accepted.id, bookingId };
}

/** A revised proposal. `raiseLimit` records the user's explicit approval to go past their own private limit. */
export async function proposeTerms(negotiationId: string, terms: Terms, opts: { raiseLimit?: boolean } = {}): Promise<NegotiationResult> {
  expireStale();
  const s = getState();
  const n = s.negotiations[negotiationId];
  if (!n) return { ok: false, issue: 'not-found' };
  const viewerId = viewerOf(s).id;
  const side = sideOf(n, viewerId);
  const limit = ownLimit(s, negotiationId);
  const issue = validateProposal(n, side, terms, limit, { allowOverLimit: opts.raiseLimit });
  if (issue) return { ok: false, issue };
  await delay(250);
  setState((st) => {
    const current = st.negotiations[negotiationId];
    let out = putNegotiation(st, submitProposal(current, side, terms, ctx()));
    if (opts.raiseLimit) out = { ...out, privateLimits: { ...out.privateLimits, [negotiationId]: { ...out.privateLimits[negotiationId], [viewerId]: terms.price } } };
    return out;
  });
  const bookingId = await counterpartyResponds(negotiationId);
  return { ok: true, negotiationId, bookingId };
}

/** Approve the counterparty's standing terms. Approving past your own limit is your explicit choice and updates it. */
export async function acceptCounter(negotiationId: string): Promise<NegotiationResult> {
  expireStale();
  await delay(300);
  const s = getState();
  const n = s.negotiations[negotiationId];
  if (!n) return { ok: false, issue: 'not-found' };
  if (isTerminal(n)) return { ok: false, issue: 'closed' };
  if (n.status === 'awaiting_response') return { ok: false, issue: 'pending' };
  let bookingId = '';
  setState((st) => {
    const viewerId = viewerOf(st).id;
    const accepted = acceptStanding(st.negotiations[negotiationId], sideOf(n, viewerId), ctx());
    const res = createBookingFor(putNegotiation(st, accepted), accepted.id);
    bookingId = res.bookingId;
    return res.state;
  });
  return { ok: true, negotiationId, bookingId };
}

export async function holdPosition(negotiationId: string): Promise<void> {
  await delay(150);
  setState((s) => {
    const n = s.negotiations[negotiationId];
    return n ? putNegotiation(s, hold(n, sideOf(n, viewerOf(s).id), ctx())) : s;
  });
}

export async function stopNegotiation(negotiationId: string): Promise<void> {
  await delay(200);
  setState((s) => {
    const n = s.negotiations[negotiationId];
    return n ? putNegotiation(s, withdraw(n, sideOf(n, viewerOf(s).id), ctx())) : s;
  });
}

/* ------------------------------------------------------------ inbound bids */

/**
 * Counterparties respond to a newly released Offer: buyers with matching open
 * needs bid on it. Two bids are shaped differently on purpose — one recurring
 * (more total, less flexibility), one single engagement at a higher rate — so the
 * comparison is a real choice.
 */
export function inboundBidsFor(s: AppState, offer: Offer): AppState {
  const viewer = viewerOf(s);
  const buyers = s.cards.filter((c) => c.kind === 'need' && c.category === offer.category && !s.passedCardIds.includes(c.id)).slice(0, 2);
  let out = s;
  buyers.forEach((buyerCard, i) => {
    const step = priceStep(offer.price);
    const opening: Terms =
      i === 0
        ? { ...LISTED_TERMS, volume: 'recurring', price: roundTo(offer.price * 0.88, step, 'down') }
        : { ...LISTED_TERMS, price: roundTo(offer.price * 0.95, step, 'down') };
    const n = createNegotiation(
      {
        listing: { kind: 'offer', ownerId: viewer.id, title: offer.title, category: offer.category, unit: offer.unit, timingLabel: offer.window.label, offerId: offer.id },
        buyerId: buyerCard.personId,
        sellerId: viewer.id,
        initiatorId: buyerCard.personId,
        listingTerms: { price: offer.price, ...LISTED_TERMS },
        openingFromInitiator: opening,
      },
      ctx()
    );
    out = {
      ...putNegotiation(out, n),
      privateLimits: {
        ...out.privateLimits,
        [n.id]: { [buyerCard.personId]: roundTo(offer.price * 1.04, step, 'down'), [viewer.id]: offer.floorPrice ?? roundTo(offer.price * 0.85, step, 'up') },
      },
    };
  });
  return out;
}

/** Bids on one of the viewer's own offers, newest first. */
export function bidsOnOffer(s: AppState, offerId: string): Negotiation[] {
  return Object.values(s.negotiations)
    .filter((n) => n.listing.offerId === offerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
