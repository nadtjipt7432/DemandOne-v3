/**
 * "My Market" — the derivations behind Home. Pure functions of state: decisions
 * waiting on the viewer, their live positions, demand relevant to them, what the
 * agent has done, and adjacent services after a transaction.
 */

import { matchesCapability, passesHardConstraints, windowsFit } from '@/domain/matching';
import { describeEvent, isTerminal } from '@/domain/negotiation';
import type { AppState, Booking, MatchCard, Negotiation, Person } from '@/domain/types';

export type Decision =
  | { kind: 'counter'; negotiation: Negotiation }
  | { kind: 'bids'; offerId: string; title: string; negotiations: Negotiation[] }
  | { kind: 'pay' | 'deliver' | 'confirm' | 'feedback'; booking: Booking };

function involves(b: Booking, viewerId: string): boolean {
  return b.buyerId === viewerId || b.sellerId === viewerId;
}

/** Everything waiting on the viewer, most consequential first. */
export function getDecisions(s: AppState, viewerId: string): Decision[] {
  const out: Decision[] = [];
  // 'countered' always means the turn is the viewer's: a counter, a held position, or an inbound bid.
  const waiting = Object.values(s.negotiations).filter((n) => (n.buyerId === viewerId || n.sellerId === viewerId) && n.status === 'countered');
  const inbound = waiting.filter((n) => n.listing.offerId && n.initiatorId !== viewerId);
  const byOffer = new Map<string, Negotiation[]>();
  inbound.forEach((n) => byOffer.set(n.listing.offerId!, [...(byOffer.get(n.listing.offerId!) ?? []), n]));
  waiting.filter((n) => !inbound.includes(n)).forEach((negotiation) => out.push({ kind: 'counter', negotiation }));
  byOffer.forEach((negotiations, offerId) => out.push({ kind: 'bids', offerId, title: negotiations[0].listing.title, negotiations }));

  for (const b of s.bookings.filter((x) => involves(x, viewerId))) {
    const buyer = b.buyerId === viewerId;
    if (b.status === 'agreed' && buyer) out.push({ kind: 'pay', booking: b });
    else if (b.status === 'paid' && !buyer) out.push({ kind: 'deliver', booking: b });
    else if (b.status === 'delivered' && buyer) out.push({ kind: 'confirm', booking: b });
    else if (b.status === 'complete' && (buyer ? b.feedback.byBuyer : b.feedback.bySeller) === undefined) out.push({ kind: 'feedback', booking: b });
  }
  return out;
}

export interface PositionSummary {
  kind: 'need' | 'offer';
  id: string;
  title: string;
  category: string;
  price: number;
  unit: string;
  state: string;
  live: boolean;
}

/** The viewer's own Needs and Offers, each with its current market state. */
export function getPositions(s: AppState, viewer: Person): PositionSummary[] {
  const negs = Object.values(s.negotiations);
  const needs = viewer.needs.map((n): PositionSummary => {
    const active = negs.filter((x) => x.buyerId === viewer.id && x.listing.category === n.category && !isTerminal(x));
    const matches = s.cards.filter((c) => c.kind === 'offer' && c.category === n.category && windowsFit(n.window, c.window)).length;
    return {
      kind: 'need',
      id: n.id,
      title: n.title,
      category: n.category,
      price: n.budgetMax,
      unit: n.unit,
      state: active.length > 0 ? 'Negotiating' : n.howLong === 'watching' ? 'Watching the market' : `${matches} matching offer${matches === 1 ? '' : 's'}`,
      live: active.length > 0,
    };
  });
  const offers = viewer.offers.map((o): PositionSummary => {
    const bids = negs.filter((x) => x.listing.offerId === o.id && !isTerminal(x));
    return {
      kind: 'offer',
      id: o.id,
      title: o.title,
      category: o.category,
      price: o.price,
      unit: o.unit,
      state: bids.length > 0 ? `${bids.length} bid${bids.length === 1 ? '' : 's'} received` : o.capacityHours ? `${o.capacityHours} hours released` : 'Open',
      live: bids.length > 0,
    };
  });
  return [...needs, ...offers];
}

/** Open demand in the categories the viewer's capability covers — earning opportunities, never auto-posted offers. */
export function getRelevantDemand(s: AppState, viewer: Person): MatchCard[] {
  const engaged = new Set(Object.values(s.negotiations).filter((n) => !isTerminal(n)).map((n) => n.listing.cardId));
  return s.cards.filter((c) => matchesCapability(c, viewer) && !s.passedCardIds.includes(c.id) && !engaged.has(c.id)).slice(0, 3);
}

/** Offers that fit the viewer's open Needs. */
export function getSupplyForNeeds(s: AppState, viewer: Person): MatchCard[] {
  const categories = new Set(viewer.needs.map((n) => n.category));
  return s.cards.filter((c) => c.kind === 'offer' && categories.has(c.category) && passesHardConstraints(c, viewer) && !s.passedCardIds.includes(c.id)).slice(0, 3);
}

export interface ActivityLine {
  id: string;
  at: string;
  text: string;
  negotiationId: string;
}

/** What the agent has actually done: the latest real events across the viewer's negotiations. */
export function getAgentActivity(s: AppState, viewerId: string, limit = 4): ActivityLine[] {
  const nameOf = (id: string) => s.people[id]?.name ?? 'Someone';
  return Object.values(s.negotiations)
    .filter((n) => n.buyerId === viewerId || n.sellerId === viewerId)
    .flatMap((n) => n.events.map((e) => ({ id: e.id, at: e.at, text: describeEvent(e, viewerId, nameOf), negotiationId: n.id })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

/** Services that commonly follow one another — the basis for post-transaction suggestions. */
export const ADJACENT_CATEGORIES: Record<string, string[]> = {
  finance: ['ma-advisory', 'tax'],
  'ma-advisory': ['strategy', 'tax'],
  strategy: ['finance'],
  tax: ['finance'],
  advisory: ['finance', 'strategy'],
};

/** Listings adjacent to a completed or agreed transaction, on the same side of the market. */
export function getAdjacentListings(s: AppState, booking: Booking, viewerId: string): MatchCard[] {
  const kind = booking.buyerId === viewerId ? 'offer' : 'need';
  const adjacent = ADJACENT_CATEGORIES[booking.category] ?? [];
  return s.cards.filter((c) => c.kind === kind && adjacent.includes(c.category) && !s.passedCardIds.includes(c.id)).slice(0, 3);
}
