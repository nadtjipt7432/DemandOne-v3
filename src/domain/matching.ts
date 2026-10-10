/**
 * The Standard of Value engine — DemandOne v2's internal "stock market" layer.
 *
 * Per the PRD, the agent's mandate progresses hard constraints → soft boundaries →
 * preferences. Timing is a hard constraint (`passesHardConstraints`): either a card
 * overlaps the window you actually need it in, or it's not a candidate at all — it is
 * never weighted or traded off against anything else. `computeFit` is the preferences
 * tier: a pure function that turns a card + the viewer's own profile into a score, a
 * per-dimension breakdown, and a couple of plain-language sentences, once hard
 * constraints have already been satisfied. No screen ever touches raw weights,
 * `liquiditySignal`, or any of the intermediate math — only `Fit`.
 */

import type { Booking, Category, Criterion, Fit, FitBreakdown, MarketValue, MatchCard, Person, TimeWindow } from './types';

/** Rank position → weight. Position 0 (most important) gets the biggest share. */
const RANK_WEIGHTS = [0.4, 0.28, 0.2, 0.12] as const;

const CRITERION_LABEL: Record<Criterion, string> = {
  budget: 'Budget',
  expertise: 'Expertise',
  geography: 'Distance',
  trust: 'Trust',
};

/**
 * The editorial "01 — Expertise" framing shared by onboarding.tsx and you.tsx's
 * Standard of Value display. Trust and expertise deliberately say nothing about
 * ratings or review counts — see the trust-model work: public trust comes from
 * verified work, recommendations, and people you know, not star ratings.
 */
export const CRITERION_META: Record<Criterion, { title: string; sub: string }> = {
  expertise: { title: 'Expertise', sub: 'Relevant experience and capability' },
  trust: { title: 'Trust', sub: 'Verified work · recommendations · people you know' },
  budget: { title: 'Budget', sub: 'Your economic comfort zone' },
  geography: { title: 'Geography', sub: 'Where the work happens' },
};

export function weightsFromOrder(order: Criterion[]): Record<Criterion, number> {
  const weights = { budget: 0, expertise: 0, geography: 0, trust: 0 };
  order.forEach((criterion, i) => {
    weights[criterion] = RANK_WEIGHTS[i] ?? 0;
  });
  return weights;
}

function clamp(n: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}

function overlapFraction(a: TimeWindow, b: TimeWindow): number {
  const start = Math.max(a.startHour, b.startHour);
  const end = Math.min(a.endHour, b.endHour);
  const intersection = Math.max(0, end - start);
  const union = Math.max(a.endHour, b.endHour) - Math.min(a.startHour, b.startHour);
  return union <= 0 ? 0 : clamp(intersection / union);
}

/**
 * Trust = who actually stands behind this person, quantified — not a star rating.
 * Blends the recommend ratio (of completed engagements, how many would work with them
 * again), identity/insurance/reference verification, and how many people in the
 * viewer's own network have worked with them directly (the strongest signal, since
 * it's a verified relationship, not a stranger's review).
 */
function trustScoreOf(counterpart: Person): number {
  const recommendRatio = counterpart.completedCount > 0 ? clamp(counterpart.recommendCount / counterpart.completedCount) : 0.5;
  const verifiedFields = counterpart.verified;
  const verifiedFrac =
    (Number(verifiedFields.identity) + Number(verifiedFields.insurance) + Number(verifiedFields.references)) / 3;
  const pathsBonus = clamp(counterpart.trustPaths / 3);
  return clamp(0.4 * recommendRatio + 0.35 * verifiedFrac + 0.25 * pathsBonus);
}

/**
 * Expertise = can they credibly do this, quantified — trust tier plus demonstrated
 * transaction volume (completedCount), not a self-reported skill rating.
 */
function expertiseScoreOf(counterpart: Person): number {
  const tierScore = counterpart.tier === 'expert' ? 1 : counterpart.tier === 'trades' ? 0.7 : 0.5;
  const volumeScore = clamp(Math.log10(counterpart.completedCount + 1) / Math.log10(20));
  return clamp(0.6 * tierScore + 0.4 * volumeScore);
}

/**
 * Finds the viewer's own need/offer in the same category as the card, so budget,
 * timing, and distance can be evaluated against what the viewer actually asked for —
 * not a generic default. Undefined means there's no active mission in this category,
 * so neither the hard timing constraint nor a tailored budget target applies.
 */
function viewerContextFor(card: MatchCard, viewer: Person) {
  if (card.kind === 'offer') {
    // Card is someone offering a service; viewer would be the buyer.
    return viewer.needs.find((n) => n.category === card.category);
  }
  // Card is someone's need; viewer would be the provider.
  return viewer.offers.find((o) => o.category === card.category);
}

/** Minimum meaningful overlap for two windows to count as "actually fits." */
const HARD_TIMING_THRESHOLD = 0.15;

/** The hard-constraint check itself — exported so a specific mission (recommendations.tsx) can apply it directly. */
export function windowsFit(a: TimeWindow, b: TimeWindow): boolean {
  return overlapFraction(a, b) >= HARD_TIMING_THRESHOLD;
}

export type TimeBucket = 'now' | 'week' | 'month' | 'later';
export const TIME_LABEL: Record<TimeBucket, string> = { now: 'Now', week: 'This week', month: 'This month', later: 'Later' };

/**
 * Coarse "when does this happen" bucket for the Exchange's Time filter — a display
 * grouping only, computed on demand from the same `window` the hard timing constraint
 * already uses. Not a second source of truth: `passesHardConstraints`/`windowsFit`
 * remain the actual gate; this just groups the same data for browsing.
 */
export function timeBucket(window: TimeWindow): TimeBucket {
  if (window.endHour <= 24) return 'now';
  if (window.endHour <= 168) return 'week';
  if (window.endHour <= 720) return 'month';
  return 'later';
}

/**
 * Timing consideration at the moment of booking, not just at discovery: does this
 * new window clash with something the viewer already has on the books? Only checks
 * live commitments — a 'complete' booking already happened, its relative window is
 * stale and shouldn't block a new one. Returns the first clash, if any, so the
 * screen can surface it before the user commits (flagged, never silently blocked —
 * "the user approves every commitment" applies here too).
 */
export function findScheduleConflict(window: TimeWindow, bookings: Booking[]): Booking | undefined {
  return bookings.find((b) => b.status !== 'complete' && b.window && windowsFit(window, b.window));
}

/**
 * Hard constraint, not a preference: if the viewer has an active need/offer in this
 * card's category, its window must actually overlap the card's window. No amount of
 * budget, trust, or expertise can trade this off — it's a gate, evaluated before
 * `computeFit` ever runs. Cards outside any category the viewer has an active mission
 * for pass automatically — there's nothing to violate yet.
 */
export function passesHardConstraints(card: MatchCard, viewer: Person): boolean {
  const context = viewerContextFor(card, viewer);
  if (!context) return true;
  return windowsFit(context.window, card.window);
}

export function computeFit(
  card: MatchCard,
  viewer: Person,
  counterpart: Person,
  orderOverride?: Criterion[]
): Fit {
  const context = viewerContextFor(card, viewer);
  const relevantRadius = (context && 'distanceMax' in context ? context.distanceMax : undefined) ?? 10;

  let budgetScore: number;
  let budgetLine: string;
  if (card.kind === 'offer') {
    const target = (context && 'budgetMax' in context ? context.budgetMax : undefined) ?? card.price * 1.3;
    budgetScore = card.price <= target ? 1 : clamp(1 - (card.price - target) / target);
    budgetLine =
      card.price <= target
        ? `$${card.price} is within the $${target} you're comfortable with for this.`
        : `$${card.price} runs above the $${target} comfort range you set for this.`;
  } else {
    const yourRate = (context && 'price' in context ? context.price : undefined) ?? card.price * 0.8;
    budgetScore = card.price >= yourRate ? 1 : clamp(card.price / yourRate);
    budgetLine =
      card.price >= yourRate
        ? `$${card.price} is at or above your usual $${yourRate} rate for this.`
        : `$${card.price} is a bit under your usual $${yourRate} rate for this.`;
  }

  const geographyScore = clamp(1 - card.distanceMi / relevantRadius);
  const geographyLine = `${card.distanceMi} mi away, inside the ${relevantRadius} mi range that matters to you.`;

  const expertiseScore = expertiseScoreOf(counterpart);
  const expertiseLine = `${counterpart.completedCount} DemandOne engagement${counterpart.completedCount === 1 ? '' : 's'} completed${counterpart.tier === 'expert' ? ', recognized expert' : ''}.`;

  const trustScore = trustScoreOf(counterpart);
  const trustLine = `${counterpart.recommendCount} of ${counterpart.completedCount} would work with them again${counterpart.trustPaths > 0 ? `, ${counterpart.trustPaths} people you know used them` : ''}.`;

  const breakdown: FitBreakdown = {
    budget: budgetScore,
    expertise: expertiseScore,
    geography: geographyScore,
    trust: trustScore,
  };

  const lineFor: Record<Criterion, string> = {
    budget: budgetLine,
    expertise: expertiseLine,
    geography: geographyLine,
    trust: trustLine,
  };

  const order = orderOverride && orderOverride.length > 0 ? orderOverride : viewer.standardOfValue.order;
  const weights = weightsFromOrder(order);
  const score = Math.round(
    100 *
      (weights.budget * budgetScore +
        weights.expertise * expertiseScore +
        weights.geography * geographyScore +
        weights.trust * trustScore)
  );

  const [first, second] = order;
  const explanation = [first && lineFor[first], second && lineFor[second]].filter((line): line is string =>
    Boolean(line)
  );

  return { score: clamp(score, 0, 100), breakdown, explanation };
}

/**
 * Objective price benchmark — independent of the viewer entirely. For an offer, a
 * lower price than the category average is good value for a buyer; for a need, a
 * higher budget than average is good value for a provider deciding whether to take
 * the job. Only flagged "good" above a real threshold, so the badge stays rare.
 */
const GOOD_VALUE_THRESHOLD = 10;

export function computeMarketValue(card: MatchCard, category: Category | undefined): MarketValue {
  const avg = category?.marketAvgPrice ?? card.price;
  // Literal: how the price actually sits relative to the benchmark, regardless of kind.
  const vsAvgPct = Math.round(((card.price - avg) / avg) * 100);
  const literalDirection = vsAvgPct >= 0 ? 'above' : 'below';
  const label = `${Math.abs(vsAvgPct)}% ${literalDirection} typical rate`;

  // Goodness: a cheap offer is good for a buyer; a generous need budget is good for a provider.
  const deltaPct = card.kind === 'offer' ? -vsAvgPct : vsAvgPct;
  const isGoodValue = deltaPct >= GOOD_VALUE_THRESHOLD;

  return { deltaPct, isGoodValue, label };
}

export { CRITERION_LABEL };
