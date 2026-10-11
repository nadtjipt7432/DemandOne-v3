import { delay, nowIso } from '@/infra/clock';
import { candidatesFor, capacityOf, fits, recommended, strategiesFor, type Candidate, type CapacityState, type Strategy, type StrategyKey } from '@/domain/allocation';
import { acceptStanding, isTerminal, latestBy, respond, submitProposal, validateProposal, withdraw, type EngineCtx } from '@/domain/negotiation';
import { priceStep, roundTo } from '@/domain/terms';
import { getState, id, setState } from '@/state/store';
import { createBookingFor } from './transactions';
import { updateViewer, viewerOf } from './viewer';
import type { AppState, Negotiation, Offer } from '@/domain/types';

/**
 * Agent-assisted capacity allocation on top of the shared negotiation records:
 * review strategies → authorize one (its bids become tentative reservations and
 * the agent negotiates each within the seller's minimum) → approve the outcomes
 * (transactions are created, hours become committed).
 */

const ctx = (): EngineCtx => ({ now: nowIso(), newId: id });

export interface AllocationView {
  offer: Offer;
  capacity: CapacityState;
  floor: number;
  proposals: Negotiation[];
  candidates: Candidate[];
  belowMinimum: Negotiation[];
  strategies: Strategy[];
  recommended?: Strategy;
  /** Open needs in the same category that haven't bid yet — demand the seller could still pursue. */
  compatibleOpportunities: number;
}

function floorOf(offer: Offer): number {
  return offer.floorPrice ?? roundTo(offer.price * 0.85, priceStep(offer.price), 'up');
}

export function allocationView(s: AppState, offer: Offer): AllocationView {
  const viewer = s.people[offer.personId];
  const floor = floorOf(offer);
  const capacity = capacityOf(s, offer);
  const proposals = Object.values(s.negotiations).filter((n) => n.listing.offerId === offer.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const { eligible, belowMinimum } = candidatesFor(s, offer, floor);
  const strategies = offer.allocation ? [] : strategiesFor(eligible, capacity, viewer?.standardOfValue.order ?? ['budget', 'trust', 'expertise', 'geography']);
  const bidders = new Set(proposals.map((n) => n.buyerId));
  const compatibleOpportunities = s.cards.filter((c) => c.kind === 'need' && c.category === offer.category && !bidders.has(c.personId) && !s.passedCardIds.includes(c.id)).length;
  return { offer, capacity, floor, proposals, candidates: eligible, belowMinimum, strategies, recommended: recommended(strategies), compatibleOpportunities };
}

function findOffer(s: AppState, offerId: string): Offer {
  const offer = viewerOf(s).offers.find((o) => o.id === offerId);
  if (!offer) throw new Error('Offer not found');
  return offer;
}

function setPlan(s: AppState, offerId: string, plan: Offer['allocation']): AppState {
  return updateViewer(s, (v) => ({ ...v, offers: v.offers.map((o) => (o.id === offerId ? { ...o, allocation: plan } : o)) }));
}

/** Seller's agent works one bid: most of the way to the ask, then halfway, then takes their best if it clears the seller's minimum. */
function negotiateOne(s: AppState, n: Negotiation, offer: Offer): Negotiation {
  const floor = floorOf(offer);
  const buyerLimit = s.privateLimits[n.id]?.[n.buyerId] ?? n.proposals[1]?.terms.price ?? offer.price;
  const bid = latestBy(n, 'buyer')!;
  if (bid.terms.price >= offer.price) return acceptStanding(n, 'seller', ctx());
  const step = priceStep(offer.price);
  const tries = [0.75, 0.5].map((f) => roundTo(bid.terms.price + (offer.price - bid.terms.price) * f, step, 'up'));
  let cur = n;
  for (const price of tries) {
    if (cur.status !== 'countered') break;
    const terms = { ...latestBy(cur, 'buyer')!.terms, price };
    if (validateProposal(cur, 'seller', terms, floor)) continue;
    cur = respond(submitProposal(cur, 'seller', terms, ctx()), 'buyer', buyerLimit, true, ctx());
  }
  if (cur.status === 'countered' && latestBy(cur, 'buyer')!.terms.price >= floor) cur = acceptStanding(cur, 'seller', ctx());
  return cur;
}

/**
 * Authorize a strategy: its bids are reserved (tentative — not committed), and
 * the agent negotiates each one. Refused if the strategy no longer fits.
 */
export async function authorizeAllocation(offerId: string, key: StrategyKey): Promise<{ ok: boolean; reason?: string }> {
  const s = getState();
  const offer = findOffer(s, offerId);
  if (offer.allocation) return { ok: false, reason: 'An allocation is already in progress.' };
  const view = allocationView(s, offer);
  const strategy = view.strategies.find((x) => x.key === key);
  if (!strategy) return { ok: false, reason: 'That strategy is no longer available.' };
  const picks = strategy.picks.map((c) => c.negotiation);
  if (!fits(view.capacity, picks)) return { ok: false, reason: 'Those bids no longer fit your free hours.' };

  setState((st) => setPlan(st, offerId, { strategy: key, negotiationIds: picks.map((n) => n.id), status: 'negotiating', authorizedAt: nowIso() }));
  for (const n of picks) {
    await delay(700);
    setState((st) => {
      const current = st.negotiations[n.id];
      if (!current || isTerminal(current)) return st;
      return { ...st, negotiations: { ...st.negotiations, [n.id]: negotiateOne(st, current, offer) } };
    });
  }
  setState((st) => setPlan(st, offerId, { ...findOffer(st, offerId).allocation!, status: 'ready' }));
  return { ok: true };
}

export type PlanOutcome = 'agreed' | 'committed' | 'working' | 'fell-through';

export function planOutcome(n: Negotiation): PlanOutcome {
  if (n.bookingId) return 'committed';
  if (n.status === 'accepted') return 'agreed';
  if (n.status === 'awaiting_response' || n.status === 'evaluating') return 'working';
  return 'fell-through';
}

/**
 * Approve the agreed outcomes: each becomes a transaction and its hours are
 * committed. Open bids that no longer fit any free hours are declined so they
 * can't be double-booked.
 */
export async function approveAllocation(offerId: string): Promise<{ bookingIds: string[] }> {
  await delay(400);
  const bookingIds: string[] = [];
  setState((st) => {
    const offer = findOffer(st, offerId);
    const plan = offer.allocation;
    if (!plan || plan.status !== 'ready') return st;
    let out = st;
    for (const nid of plan.negotiationIds) {
      const n = out.negotiations[nid];
      if (n?.status === 'accepted' && !n.bookingId) {
        const res = createBookingFor(out, nid);
        out = res.state;
        if (res.bookingId) bookingIds.push(res.bookingId);
      } else if (n && n.status === 'countered') {
        out = { ...out, negotiations: { ...out.negotiations, [nid]: withdraw(n, 'seller', ctx()) } };
      }
    }
    out = setPlan(out, offerId, { ...plan, status: 'committed' });
    const after = capacityOf(out, findOffer(out, offerId));
    for (const n of Object.values(out.negotiations)) {
      if (n.listing.offerId !== offerId || isTerminal(n) || n.bookingId) continue;
      if (!fits(after, [n])) out = { ...out, negotiations: { ...out.negotiations, [n.id]: withdraw(n, 'seller', ctx()) } };
    }
    return out;
  });
  return { bookingIds };
}
