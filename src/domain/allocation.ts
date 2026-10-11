/**
 * Capacity allocation — deciding how to spend scarce released hours across
 * competing bids. Pure: everything is derived from the shared negotiation and
 * transaction records.
 *
 * - Capacity is tracked per released week: committed (agreed transactions),
 *   tentative (bids the seller's agent is working under an authorized plan) and
 *   free. A combination that would exceed any week's free hours is never offered,
 *   so nothing can be double-booked.
 * - Strategies are found by evaluating every feasible combination of eligible
 *   bids (bids at or above the seller's own minimum), then picking the best for
 *   three different aims. Highest revenue is one aim, not the answer.
 */

import { formatMoney } from './money';
import { isTerminal, latestBy } from './negotiation';
import type { AppState, Complexity, Criterion, Negotiation, Offer, Person } from './types';

export interface WeekCapacity {
  released: number;
  committed: number;
  tentative: number;
  free: number;
}

export interface CapacityState {
  weeks: WeekCapacity[];
  released: number;
  committed: number;
  tentative: number;
  free: number;
}

/** Weekly split of an offer's released hours (one week unless stated). */
export function weeksOf(offer: Offer): number[] {
  if (offer.weeklyHours?.length) return offer.weeklyHours;
  return offer.capacityHours !== undefined ? [offer.capacityHours] : [];
}

/** Bids on this offer, newest first. */
export function bidsOn(s: AppState, offerId: string): Negotiation[] {
  return Object.values(s.negotiations)
    .filter((n) => n.listing.offerId === offerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function hoursOf(n: Negotiation): number {
  return n.request?.hours ?? 0;
}

function weekOf(n: Negotiation, weekCount: number): number {
  return Math.min(n.request?.week ?? 0, Math.max(0, weekCount - 1));
}

/** Committed / tentative / free hours per week, from the actual records. */
export function capacityOf(s: AppState, offer: Offer): CapacityState {
  const released = weeksOf(offer);
  const weeks: WeekCapacity[] = released.map((h) => ({ released: h, committed: 0, tentative: 0, free: h }));
  const planIds = new Set(offer.allocation && offer.allocation.status !== 'committed' ? offer.allocation.negotiationIds : []);
  for (const n of bidsOn(s, offer.id)) {
    if (!n.request || weeks.length === 0) continue;
    const w = weeks[weekOf(n, weeks.length)];
    const booked = n.bookingId && s.bookings.some((b) => b.id === n.bookingId);
    if (booked) w.committed += hoursOf(n);
    else if (planIds.has(n.id) && !['rejected', 'withdrawn', 'expired'].includes(n.status)) w.tentative += hoursOf(n);
  }
  weeks.forEach((w) => (w.free = Math.max(0, w.released - w.committed - w.tentative)));
  const sum = (k: keyof WeekCapacity) => weeks.reduce((a, w) => a + w[k], 0);
  return { weeks, released: sum('released'), committed: sum('committed'), tentative: sum('tentative'), free: sum('free') };
}

/** Would adding these bids exceed any week's free hours? */
export function fits(cap: CapacityState, bids: Negotiation[], ignoreTentativeOf: Set<string> = new Set()): boolean {
  const extra = cap.weeks.map(() => 0);
  for (const n of bids) if (!ignoreTentativeOf.has(n.id)) extra[weekOf(n, cap.weeks.length)] += hoursOf(n);
  return cap.weeks.every((w, i) => extra[i] <= w.free);
}

/* ------------------------------------------------------------- candidates */

const COMPLEXITY_WEIGHT: Record<Complexity, number> = { light: 1, standard: 2, complex: 3 };

export interface Candidate {
  negotiation: Negotiation;
  buyer: Person;
  name: string;
  hours: number;
  week: number;
  rate: number;
  total: number;
  complexity: Complexity;
  /** Chance the engagement completes as agreed, from the buyer's verified record. */
  completion: number;
  trust: number;
  firstTime: boolean;
}

/** Open bids at or above the seller's own minimum, as allocation candidates. */
export function candidatesFor(s: AppState, offer: Offer, floor: number): { eligible: Candidate[]; belowMinimum: Negotiation[] } {
  const eligible: Candidate[] = [];
  const belowMinimum: Negotiation[] = [];
  const weekCount = weeksOf(offer).length || 1;
  for (const n of bidsOn(s, offer.id)) {
    if (!n.request || isTerminal(n) || n.bookingId) continue;
    const bid = latestBy(n, 'buyer');
    if (!bid) continue;
    if (bid.terms.price < floor) {
      belowMinimum.push(n);
      continue;
    }
    const buyer = s.people[n.buyerId];
    const firstTime = !buyer || buyer.completedCount === 0;
    const trust = firstTime ? 0.5 : buyer.recommendCount / buyer.completedCount;
    eligible.push({
      negotiation: n,
      buyer,
      name: buyer?.name ?? 'Buyer',
      hours: n.request.hours,
      week: weekOf(n, weekCount),
      rate: bid.terms.price,
      total: bid.terms.price * n.request.hours,
      complexity: n.request.complexity,
      completion: firstTime ? 0.85 : 0.9 + 0.08 * trust,
      trust,
      firstTime,
    });
  }
  return { eligible, belowMinimum };
}

/* -------------------------------------------------------------- strategies */

export type StrategyKey = 'earnings' | 'simple' | 'flexible';

export interface Strategy {
  key: StrategyKey;
  title: string;
  aim: string;
  picks: Candidate[];
  hours: number;
  free: number;
  perWeek: number[];
  earnings: number;
  expected: number;
  effectiveRate: number;
  risk: number;
  /** How well this mix matches the seller's Standard of Value, 0–1. */
  fit: number;
  tradeoffs: string[];
}

function evaluate(picks: Candidate[], cap: CapacityState): Omit<Strategy, 'key' | 'title' | 'aim' | 'fit' | 'tradeoffs'> {
  const perWeek = cap.weeks.map(() => 0);
  picks.forEach((c) => (perWeek[c.week] += c.hours));
  const hours = picks.reduce((a, c) => a + c.hours, 0);
  const earnings = picks.reduce((a, c) => a + c.total, 0);
  const expected = picks.reduce((a, c) => a + c.total * c.completion, 0);
  const risk = picks.reduce((a, c) => a + COMPLEXITY_WEIGHT[c.complexity] + (c.firstTime ? 1 : 0), 0) + Math.max(0, picks.length - 1) * 0.5;
  return { picks, hours, free: cap.free - hours, perWeek, earnings, expected, effectiveRate: hours ? earnings / hours : 0, risk };
}

function feasibleSets(candidates: Candidate[], cap: CapacityState): Candidate[][] {
  const out: Candidate[][] = [];
  const n = Math.min(candidates.length, 10);
  for (let mask = 1; mask < 1 << n; mask++) {
    const picks = candidates.filter((_, i) => mask & (1 << i));
    const perWeek = cap.weeks.map(() => 0);
    picks.forEach((c) => (perWeek[c.week] += c.hours));
    if (perWeek.every((h, i) => h <= cap.weeks[i].free)) out.push(picks);
  }
  return out;
}

const key = (picks: Candidate[]) => picks.map((c) => c.negotiation.id).sort().join('|');

function fitScore(e: ReturnType<typeof evaluate>, maxExpected: number, order: Criterion[]): number {
  const n = e.picks.length || 1;
  const score: Record<Criterion, number> = {
    budget: maxExpected ? e.expected / maxExpected : 0,
    trust: e.picks.reduce((a, c) => a + c.trust, 0) / n,
    expertise: e.picks.reduce((a, c) => a + COMPLEXITY_WEIGHT[c.complexity], 0) / n / 3,
    geography: 0.5,
  };
  const weights = [0.4, 0.28, 0.2, 0.12];
  return order.reduce((a, c, i) => a + (weights[i] ?? 0) * score[c], 0);
}

function names(picks: Candidate[]): string {
  const first = picks.map((c) => c.name.split(' ')[0]);
  return first.length <= 1 ? first.join('') : `${first.slice(0, -1).join(', ')} and ${first[first.length - 1]}`;
}

/**
 * Up to three distinct strategies. When two aims land on the same combination,
 * it's shown once — fewer, honest options beat padded ones.
 */
export function strategiesFor(candidates: Candidate[], cap: CapacityState, order: Criterion[]): Strategy[] {
  const sets = feasibleSets(candidates, cap).map((p) => evaluate(p, cap));
  if (sets.length === 0) return [];
  const maxExpected = Math.max(...sets.map((x) => x.expected));
  const byEarnings = [...sets].sort((a, b) => b.expected - a.expected)[0];
  const simplePool = sets.filter((x) => x.expected >= maxExpected * 0.4);
  const bySimple = [...simplePool].sort((a, b) => a.picks.length - b.picks.length || a.risk - b.risk || b.expected - a.expected)[0];
  const flexPool = sets.filter((x) => x.free >= cap.free * 0.5);
  const byFlex = [...flexPool].sort((a, b) => b.expected - a.expected || b.effectiveRate - a.effectiveRate)[0];

  const chosen: Strategy[] = [];
  const seen = new Set<string>();
  const add = (e: ReturnType<typeof evaluate> | undefined, k: StrategyKey, title: string, aim: string) => {
    if (!e || seen.has(key(e.picks))) return;
    seen.add(key(e.picks));
    chosen.push({ ...e, key: k, title, aim, fit: fitScore(e, maxExpected, order), tradeoffs: [] });
  };
  add(byEarnings, 'earnings', 'Maximize expected earnings', 'Fill the most valuable hours');
  add(bySimple, 'simple', 'Simplest engagement', 'Fewest counterparties to coordinate');
  add(byFlex, 'flexible', 'Preserve flexibility', 'Keep half your time open');

  const top = chosen.find((x) => x.key === 'earnings') ?? chosen[0];
  for (const st of chosen) {
    const t: string[] = [];
    t.push(`${names(st.picks)}: ${st.hours} of ${cap.free} free hours, ${formatMoney(st.earnings)} at ${formatMoney(st.effectiveRate)}/hr.`);
    if (st !== top) {
      const diff = top.earnings - st.earnings;
      if (diff > 0) t.push(`${formatMoney(diff)} less than the highest-earning mix${st.free > top.free ? `, but ${st.free} hours stay free instead of ${top.free}` : ''}.`);
      if (st.effectiveRate > top.effectiveRate + 0.5) t.push(`Higher rate: ${formatMoney(st.effectiveRate)}/hr against ${formatMoney(top.effectiveRate)}/hr.`);
      if (st.picks.length < top.picks.length) t.push(`${st.picks.length === 1 ? 'One counterparty' : `${st.picks.length} counterparties`} instead of ${top.picks.length}.`);
    } else {
      if (st.picks.length > 1) t.push(`${st.picks.length} buyers to coordinate${st.picks.some((c) => c.firstTime) ? ', including a first-time buyer' : ''}.`);
      if (st.free <= 3) t.push(`Leaves only ${st.free} hour${st.free === 1 ? '' : 's'} free.`);
    }
    const full = st.perWeek.findIndex((h, i) => h > 0 && h === cap.weeks[i].free);
    if (full >= 0) t.push(`Fills week ${full + 1} completely.`);
    if (st.picks.some((c) => c.complexity === 'complex')) t.push('Includes complex scope — more revision risk.');
    st.tradeoffs = t;
  }
  return chosen;
}

/** The strategy that best matches the seller's own Standard of Value. */
export function recommended(strategies: Strategy[]): Strategy | undefined {
  return [...strategies].sort((a, b) => b.fit - a.fit)[0];
}

/** What accepting one bid does to the rest — the "what happens if" answer. */
export function consequencesOf(candidate: Candidate, candidates: Candidate[], cap: CapacityState): { fitsNow: boolean; weekFreeAfter: number; blocked: Candidate[]; stillFit: Candidate[] } {
  const weekFree = cap.weeks[candidate.week]?.free ?? 0;
  const fitsNow = candidate.hours <= weekFree;
  const after: CapacityState = { ...cap, weeks: cap.weeks.map((w, i) => (i === candidate.week ? { ...w, free: w.free - candidate.hours } : w)) };
  const others = candidates.filter((c) => c !== candidate);
  const blocked = others.filter((c) => c.hours > (after.weeks[c.week]?.free ?? 0));
  return { fitsNow, weekFreeAfter: weekFree - candidate.hours, blocked, stillFit: others.filter((c) => !blocked.includes(c)) };
}

/** Feasible pairs, best first — the "can I take on two" answer. */
export function feasiblePairs(candidates: Candidate[], cap: CapacityState): { pairs: [Candidate, Candidate][]; conflicts: [Candidate, Candidate][] } {
  const pairs: [Candidate, Candidate][] = [];
  const conflicts: [Candidate, Candidate][] = [];
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      const ok = a.week === b.week ? a.hours + b.hours <= cap.weeks[a.week].free : a.hours <= cap.weeks[a.week].free && b.hours <= cap.weeks[b.week].free;
      (ok ? pairs : conflicts).push([a, b]);
    }
  pairs.sort((x, y) => y[0].total + y[1].total - (x[0].total + x[1].total));
  return { pairs, conflicts };
}
