/**
 * The negotiation engine — a deterministic state machine over one shared
 * `Negotiation` record. Pure: no store, no clock, no I/O (time and ids come in
 * through `EngineCtx`).
 *
 * Rules it enforces:
 * - One active proposal at a time; a party can't propose while awaiting a response.
 * - A new proposal must change something meaningful: identical terms, or a worse
 *   price on the same terms, are refused. Clicking again never concedes anything.
 * - Concessions come only from the counterparty's policy (`respond`), which follows
 *   a bounded schedule toward a private limit it never states and never crosses.
 * - Negotiations can fail: lowball proposals are rejected, rounds are capped with a
 *   final offer, and standing counters expire.
 */

import { formatMoney } from './money';
import { describeChanges, priceStep, roundTo, sameTerms, termMultiplier, termsKey, DEADLINES, PAYMENTS, SCOPES } from './terms';
import type { ListingSnapshot, Negotiation, NegotiationEvent, Proposal, Side, Terms } from './types';

export const MAX_ROUNDS = 4;
export const RESPONSE_TTL_HOURS = 48;
/** Fraction of the distance from public anchor to private limit conceded at each response. */
const CONCESSION = [0, 0.4, 0.7, 0.88];
/** Below this fraction of the limit (buyer side: above 1/this), a proposal is rejected outright. */
const LOWBALL = 0.75;

export interface EngineCtx {
  now: string;
  newId: (prefix: string) => string;
}

export const TERMINAL: Negotiation['status'][] = ['accepted', 'rejected', 'expired', 'withdrawn', 'cleared'];

export function isTerminal(n: Negotiation): boolean {
  return TERMINAL.includes(n.status);
}

export function sideOf(n: Negotiation, partyId: string): Side {
  return n.buyerId === partyId ? 'buyer' : 'seller';
}

export function otherSide(side: Side): Side {
  return side === 'buyer' ? 'seller' : 'buyer';
}

export function partyOf(n: Negotiation, side: Side): string {
  return side === 'buyer' ? n.buyerId : n.sellerId;
}

export function latestBy(n: Negotiation, side: Side): Proposal | undefined {
  for (let i = n.proposals.length - 1; i >= 0; i--) if (n.proposals[i].by === side) return n.proposals[i];
  return undefined;
}

/** The counterparty's position the viewer is currently responding to. */
export function standingFrom(n: Negotiation, side: Side): Proposal | undefined {
  return latestBy(n, side);
}

/** Is `price` better for `side` than `than`? Buyers want lower, sellers higher. */
function better(side: Side, price: number, than: number): boolean {
  return side === 'buyer' ? price < than : price > than;
}

function event(ctx: EngineCtx, e: Omit<NegotiationEvent, 'id' | 'at'>): NegotiationEvent {
  return { id: ctx.newId('ev'), at: ctx.now, ...e };
}

function touch(n: Negotiation, ctx: EngineCtx, patch: Partial<Negotiation>, events: NegotiationEvent[] = []): Negotiation {
  return { ...n, ...patch, updatedAt: ctx.now, events: [...n.events, ...events] };
}

/* ---------------------------------------------------------------- creation */

export interface CreateInput {
  listing: ListingSnapshot;
  buyerId: string;
  sellerId: string;
  initiatorId: string;
  /** The listing's public opening position, made by the listing owner. */
  listingTerms: Terms;
  /** For a counterparty-initiated negotiation: their opening proposal on the viewer's listing. */
  openingFromInitiator?: Terms;
  compared?: number;
  rank?: number;
}

export function createNegotiation(input: CreateInput, ctx: EngineCtx): Negotiation {
  const ownerSide: Side = input.listing.kind === 'offer' ? 'seller' : 'buyer';
  const listingProposal: Proposal = {
    id: ctx.newId('p'),
    by: ownerSide,
    partyId: input.listing.ownerId,
    kind: ownerSide === 'seller' ? 'ask' : 'bid',
    terms: input.listingTerms,
    at: ctx.now,
    source: 'listing',
  };
  const proposals = [listingProposal];
  const events: NegotiationEvent[] = [];
  if (input.compared !== undefined) {
    events.push(event(ctx, { type: 'evaluated', actorId: input.initiatorId, compared: input.compared, rank: input.rank }));
  }
  let status: Negotiation['status'] = 'evaluating';
  if (input.openingFromInitiator) {
    const p: Proposal = {
      id: ctx.newId('p'),
      by: otherSide(ownerSide),
      partyId: input.initiatorId,
      kind: ownerSide === 'seller' ? 'bid' : 'ask',
      terms: input.openingFromInitiator,
      at: ctx.now,
      source: 'agent',
    };
    proposals.push(p);
    events.push(event(ctx, { type: 'proposal_submitted', actorId: input.initiatorId, proposalId: p.id, price: p.terms.price, changes: describeChanges(p.terms, input.listingTerms) }));
    status = 'countered';
  }
  return {
    id: ctx.newId('neg'),
    listing: input.listing,
    buyerId: input.buyerId,
    sellerId: input.sellerId,
    initiatorId: input.initiatorId,
    status,
    proposals,
    responses: 0,
    maxRounds: MAX_ROUNDS,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    expiresAt: status === 'countered' ? addHours(ctx.now, RESPONSE_TTL_HOURS) : undefined,
    events,
  };
}

/* -------------------------------------------------------------- proposing */

export type ProposalIssue =
  | 'closed' // negotiation is over
  | 'pending' // awaiting the counterparty's response
  | 'invalid-price'
  | 'duplicate' // identical to a proposal already made
  | 'regressive' // worse for the proposer than their own last proposal on the same terms
  | 'acceptable' // meets the counterparty's standing terms — accept instead
  | 'over-limit'; // beyond the proposer's own private limit

export const ISSUE_TEXT: Record<ProposalIssue, string> = {
  closed: 'This negotiation has ended.',
  pending: "Your last proposal is still with them — wait for their response.",
  'invalid-price': 'Enter a price above zero.',
  duplicate: "You've already proposed exactly these terms. Change the price, deadline, scope or payment to try something new.",
  regressive: "That's a worse price than you already offered on the same terms.",
  acceptable: 'Those terms already meet theirs — approve their terms instead.',
  'over-limit': 'That goes past your private limit. Raise your limit first if you mean it.',
};

export function validateProposal(n: Negotiation, side: Side, terms: Terms, limit: number | undefined, opts: { allowOverLimit?: boolean } = {}): ProposalIssue | null {
  if (isTerminal(n)) return 'closed';
  if (n.status === 'awaiting_response') return 'pending';
  if (!(terms.price > 0) || !Number.isFinite(terms.price)) return 'invalid-price';
  const mine = n.proposals.filter((p) => p.by === side);
  if (mine.some((p) => termsKey(p.terms) === termsKey(terms) && p.terms.price === terms.price)) return 'duplicate';
  const lastSameTerms = [...mine].reverse().find((p) => sameTerms(p.terms, terms));
  if (lastSameTerms && better(side, terms.price, lastSameTerms.terms.price)) return 'regressive';
  const standing = standingFrom(n, otherSide(side));
  if (standing && sameTerms(standing.terms, terms) && !better(side, terms.price, standing.terms.price)) return 'acceptable';
  if (limit !== undefined && !opts.allowOverLimit) {
    if (side === 'buyer' && terms.price > limit) return 'over-limit';
    if (side === 'seller' && terms.price < limit) return 'over-limit';
  }
  return null;
}

export function submitProposal(n: Negotiation, side: Side, terms: Terms, ctx: EngineCtx): Negotiation {
  const partyId = partyOf(n, side);
  const previous = latestBy(n, side) ?? standingFrom(n, otherSide(side));
  const isFirst = !n.proposals.some((p) => p.by === side);
  const p: Proposal = {
    id: ctx.newId('p'),
    by: side,
    partyId,
    kind: isFirst ? (side === 'buyer' ? 'bid' : 'ask') : 'revised',
    terms,
    at: ctx.now,
    source: 'agent',
  };
  return touch(n, ctx, { status: 'awaiting_response', proposals: [...n.proposals, p], expiresAt: undefined }, [
    event(ctx, { type: 'proposal_submitted', actorId: partyId, proposalId: p.id, price: terms.price, changes: previous ? describeChanges(terms, previous.terms) : [] }),
  ]);
}

/* ------------------------------------------------------ counterparty policy */

/**
 * The responding party's decision on the proposal awaiting response. `limit` is
 * their private reservation price for the listed terms; it scales with the terms
 * like everything else and is never written into the record.
 */
export function respond(n: Negotiation, responder: Side, limit: number, negotiable: boolean, ctx: EngineCtx): Negotiation {
  if (n.status !== 'awaiting_response') return n;
  const proposer = otherSide(responder);
  const incoming = latestBy(n, proposer)!;
  const responderId = partyOf(n, responder);
  const anchorProposal = n.proposals.find((p) => p.by === responder)!;
  const ratio = termMultiplier(incoming.terms) / termMultiplier(anchorProposal.terms);
  const anchor = anchorProposal.terms.price * ratio;
  const reserve = limit * (termMultiplier(incoming.terms) / termMultiplier(n.proposals[0].terms));
  const r = n.responses;
  const target = negotiable ? anchor + (reserve - anchor) * CONCESSION[Math.min(r, CONCESSION.length - 1)] : anchor;
  const price = incoming.terms.price;
  const step = priceStep(anchor);
  const priorFinal = n.proposals.some((p) => p.by === responder && p.final);

  const meets = responder === 'seller' ? price >= target : price <= target;
  if (meets) {
    return touch(n, ctx, { status: 'accepted', agreedProposalId: incoming.id, responses: r + 1, expiresAt: undefined }, [
      event(ctx, { type: 'accepted', actorId: responderId, proposalId: incoming.id, price }),
    ]);
  }

  const tooFar = responder === 'seller' ? price < reserve * LOWBALL : price > reserve / LOWBALL;
  if (tooFar || priorFinal || !negotiable) {
    return touch(n, ctx, { status: 'rejected', responses: r + 1, expiresAt: undefined }, [
      event(ctx, { type: 'rejected', actorId: responderId, proposalId: incoming.id, reason: tooFar ? 'too-far' : 'final-not-met' }),
    ]);
  }

  // The last response before the round cap is a final offer.
  const isFinal = r + 1 >= n.maxRounds - 1;
  let counterPrice = responder === 'seller' ? roundTo(target, step, 'up') : roundTo(target, step, 'down');
  if (isFinal) {
    // A last offer close to, but never exactly at, the private limit.
    const guarded = responder === 'seller' ? Math.max(target, reserve * 1.02) : Math.min(target, reserve * 0.98);
    counterPrice = responder === 'seller' ? roundTo(guarded, step, 'up') : roundTo(guarded, step, 'down');
  }
  if (price === counterPrice) {
    return touch(n, ctx, { status: 'accepted', agreedProposalId: incoming.id, responses: r + 1 }, [
      event(ctx, { type: 'accepted', actorId: responderId, proposalId: incoming.id, price }),
    ]);
  }

  const previousSameTerms = [...n.proposals].reverse().find((p) => p.by === responder && sameTerms(p.terms, incoming.terms));
  if (previousSameTerms && !better(proposer, counterPrice, previousSameTerms.terms.price)) {
    // Nothing better to give on these terms: hold the existing position.
    return touch(n, ctx, { status: 'countered', responses: r + 1, expiresAt: addHours(ctx.now, RESPONSE_TTL_HOURS) }, [
      event(ctx, { type: 'held', actorId: responderId, proposalId: previousSameTerms.id, price: previousSameTerms.terms.price }),
    ]);
  }

  const counter: Proposal = {
    id: ctx.newId('p'),
    by: responder,
    partyId: responderId,
    kind: 'counter',
    terms: { ...incoming.terms, price: counterPrice },
    at: ctx.now,
    source: 'agent',
    final: isFinal || undefined,
  };
  return touch(n, ctx, { status: 'countered', proposals: [...n.proposals, counter], responses: r + 1, expiresAt: addHours(ctx.now, RESPONSE_TTL_HOURS) }, [
    event(ctx, { type: 'counter_received', actorId: responderId, proposalId: counter.id, price: counterPrice, changes: describeChanges(counter.terms, anchorProposal.terms) }),
  ]);
}

/* ------------------------------------------------------- party decisions */

/** The viewer approves the counterparty's standing terms. */
export function acceptStanding(n: Negotiation, side: Side, ctx: EngineCtx): Negotiation {
  const standing = standingFrom(n, otherSide(side));
  if (!standing || isTerminal(n) || n.status === 'awaiting_response') return n;
  return touch(n, ctx, { status: 'accepted', agreedProposalId: standing.id, expiresAt: undefined }, [
    event(ctx, { type: 'accepted', actorId: partyOf(n, side), proposalId: standing.id, price: standing.terms.price }),
  ]);
}

/** Hold current terms: recorded, but changes nothing and concedes nothing. */
export function hold(n: Negotiation, side: Side, ctx: EngineCtx): Negotiation {
  if (isTerminal(n)) return n;
  const mine = latestBy(n, side);
  return touch(n, ctx, {}, [event(ctx, { type: 'held', actorId: partyOf(n, side), proposalId: mine?.id, price: mine?.terms.price })]);
}

export function withdraw(n: Negotiation, side: Side, ctx: EngineCtx): Negotiation {
  if (isTerminal(n)) return n;
  return touch(n, ctx, { status: 'withdrawn', expiresAt: undefined }, [event(ctx, { type: 'withdrawn', actorId: partyOf(n, side) })]);
}

export function expireIfDue(n: Negotiation, ctx: EngineCtx): Negotiation {
  if (n.status !== 'countered' || !n.expiresAt || ctx.now <= n.expiresAt) return n;
  return touch(n, ctx, { status: 'expired', expiresAt: undefined }, [event(ctx, { type: 'expired', reason: 'expired' })]);
}

export function markCleared(n: Negotiation, ctx: EngineCtx): Negotiation {
  if (n.status !== 'accepted') return n;
  return touch(n, ctx, { status: 'cleared' }, [event(ctx, { type: 'cleared' })]);
}

/* -------------------------------------------------------------- trade-offs */

export interface TradeOption {
  id: string;
  /** Seller- or buyer-confirmed terms (the counterparty's standing proposal) vs. an unconfirmed agent proposal. */
  confirmed: boolean;
  terms: Terms;
  changes: string[];
  /** Within the viewer's own private limit. */
  withinLimit: boolean;
}

/**
 * What could clear it, from public information only: the counterparty's standing
 * terms (confirmed), plus up to three agent proposals that trade a term for price
 * using the conventional `TERM_VALUE` steps, or meet in the middle. Options the
 * viewer has already proposed, or that wouldn't improve on the standing terms, are
 * left out.
 */
export function suggestOptions(n: Negotiation, side: Side, limit: number | undefined): TradeOption[] {
  if (isTerminal(n) || n.status === 'awaiting_response' || n.status === 'evaluating') return [];
  const standing = standingFrom(n, otherSide(side));
  if (!standing) return [];
  const mine = latestBy(n, side);
  const within = (price: number) => limit === undefined || (side === 'buyer' ? price <= limit : price >= limit);
  const options: TradeOption[] = [{ id: `accept:${standing.id}`, confirmed: true, terms: standing.terms, changes: [], withinLimit: within(standing.terms.price) }];

  const base = side === 'buyer' ? standing : mine ?? standing;
  const step = priceStep(base.terms.price);
  const seen = new Set(n.proposals.filter((p) => p.by === side).map((p) => `${termsKey(p.terms)}@${p.terms.price}`));
  const candidates: Terms[] = [];
  const nextOf = <T,>(list: T[], current: T) => list[list.indexOf(current) + 1];

  const nextDeadline = nextOf(DEADLINES, base.terms.deadline);
  if (nextDeadline) candidates.push({ ...base.terms, deadline: nextDeadline });
  const nextScope = nextOf(SCOPES, base.terms.scope);
  if (nextScope) candidates.push({ ...base.terms, scope: nextScope });
  if (base.terms.payment === 'on-completion') candidates.push({ ...base.terms, payment: PAYMENTS[1] });

  for (const t of candidates) {
    const raw = base.terms.price * (termMultiplier(t) / termMultiplier(base.terms));
    let price = roundTo(raw, step, side === 'buyer' ? 'down' : 'up');
    if (limit !== undefined) price = side === 'buyer' ? Math.min(price, limit) : Math.max(price, limit);
    t.price = price;
  }
  if (mine && sameTerms(mine.terms, standing.terms) && Math.abs(standing.terms.price - mine.terms.price) > step) {
    const mid = roundTo((standing.terms.price + mine.terms.price) / 2, step, side === 'buyer' ? 'down' : 'up');
    candidates.push({ ...standing.terms, price: limit !== undefined ? (side === 'buyer' ? Math.min(mid, limit) : Math.max(mid, limit)) : mid });
  }

  for (const t of candidates) {
    if (options.length >= 4) break;
    if (seen.has(`${termsKey(t)}@${t.price}`)) continue;
    // Must improve on what's on the table for the proposer, without simply matching the standing price.
    if (side === 'buyer' ? t.price >= standing.terms.price : t.price <= standing.terms.price) continue;
    options.push({ id: `${termsKey(t)}@${t.price}`, confirmed: false, terms: t, changes: describeChanges(t, standing.terms), withinLimit: within(t.price) });
  }
  return options;
}

/* ------------------------------------------------------------ projections */

export interface NegotiationView {
  side: Side;
  counterpartyId: string;
  mine?: Proposal;
  theirs?: Proposal;
  spread?: number;
  opening: Proposal;
  myHistory: number[];
  theirHistory: number[];
  isFinal: boolean;
  round: number;
}

/** A party's view of the shared record. Contains nothing the record doesn't — no private limits. */
export function viewFor(n: Negotiation, partyId: string): NegotiationView {
  const side = sideOf(n, partyId);
  const mine = latestBy(n, side);
  const theirs = latestBy(n, otherSide(side));
  return {
    side,
    counterpartyId: partyOf(n, otherSide(side)),
    mine,
    theirs,
    spread: mine && theirs ? Math.abs(theirs.terms.price - mine.terms.price) : undefined,
    opening: n.proposals[0],
    myHistory: n.proposals.filter((p) => p.by === side).map((p) => p.terms.price),
    theirHistory: n.proposals.filter((p) => p.by !== side).map((p) => p.terms.price),
    isFinal: !!theirs?.final,
    round: n.responses,
  };
}

/** Phrase an event for one party. */
export function describeEvent(e: NegotiationEvent, viewerId: string, nameOf: (id: string) => string): string {
  const who = e.actorId === viewerId ? 'You' : e.actorId ? nameOf(e.actorId) : 'DemandOne';
  const money = e.price !== undefined ? formatMoney(e.price) : '';
  const changes = e.changes && e.changes.length > 0 ? ` with ${e.changes.join(', ')}` : '';
  switch (e.type) {
    case 'evaluated':
      return `${who === 'You' ? 'Your agent' : who} compared ${e.compared} compatible position${e.compared === 1 ? '' : 's'}${e.rank ? `; this one ranked ${ordinal(e.rank)} on your standard of value` : ''}`;
    case 'proposal_submitted':
      return `${who} proposed ${money}${changes}`;
    case 'counter_received':
      return `${who} countered at ${money}${changes}`;
    case 'held':
      return `${who} held at ${money}`;
    case 'tradeoff_identified':
      return `Your agent identified a possible trade-off${changes}`;
    case 'accepted':
      return `${who} accepted ${money}`;
    case 'rejected':
      return e.reason === 'too-far' ? `${who} declined: the terms were too far apart` : `${who} declined after their final offer`;
    case 'expired':
      return 'The standing offer expired';
    case 'withdrawn':
      return `${who} stopped the negotiation`;
    case 'cleared':
      return 'Cleared: the work was completed and confirmed';
  }
}

function ordinal(n: number): string {
  return n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : `#${n}`;
}

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}
