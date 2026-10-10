/**
 * "My Market" — the derivations behind the Home screen.
 *
 * Home is not a feed or a dashboard: it's the viewer's live position in the
 * exchange — decisions waiting on them, what they currently have out there, where
 * supply/demand is close enough to tip in their favor, and what the agent is quietly
 * doing without being asked. Every function here is pure and derived entirely from
 * existing state (matches/needs/offers/cards) — no new fields, no persisted signals.
 * A section with nothing to say returns an empty array; `today.tsx` hides it rather
 * than rendering an empty module.
 */

import { computeMarketValue, windowsFit } from '@/domain/matching';
import type { AppState, Match, MatchCard, Person, TimeWindow } from '@/domain/types';

/* ------------------------------------------------- 1. Decisions waiting for me */

/** Structured so callers can render either plain text or the charcoal "near-clearance" panel with the same numbers. */
export interface Tension {
  spread: number;
  yourLabel: string; // "Your bid" (viewer buying) or "Your ask" (viewer selling)
  yourAmount: number;
  theirLabel: string; // "Ask" or "Bid" — the counterpart's side
  theirAmount: number;
}

export interface DecisionEntry {
  match: Match;
  personName: string;
  headline: string; // "Claire came back at $220" / "Elena is ready to talk price"
  tension?: Tension; // only when there's a real gap
  favorable?: boolean; // currentPrice already clears the viewer's own constraint
}

/** The viewer's own stated number for this category — their budget ceiling as a buyer, their floor as a seller. Undefined when they have no active mission in this category to compare against. */
function ownConstraint(match: Match, viewer: Person): { label: string; amount: number } | undefined {
  if (match.kind === 'offer') {
    const need = viewer.needs.find((n) => n.category === match.category);
    return need ? { label: 'maximum', amount: need.budgetMax } : undefined;
  }
  const offer = viewer.offers.find((o) => o.category === match.category);
  return offer?.floorPrice !== undefined ? { label: 'minimum', amount: offer.floorPrice } : undefined;
}

export function getDecisions(matches: Record<string, Match>, people: Record<string, Person>, viewer: Person): DecisionEntry[] {
  return Object.values(matches)
    .filter((m) => m.status === 'mutual' || m.status === 'negotiating')
    .map((match) => {
      const person = people[match.personId];
      const personName = person?.name.split(' ')[0] ?? 'They';
      const constraint = ownConstraint(match, viewer);
      const gap = constraint
        ? match.kind === 'offer'
          ? match.currentPrice - constraint.amount
          : constraint.amount - match.currentPrice
        : undefined;

      const headline =
        match.status === 'negotiating'
          ? `${personName} came back at $${match.currentPrice}`
          : `${personName} is ready to talk price on ${match.title.toLowerCase()}`;

      if (constraint && gap !== undefined && gap > 0) {
        const isBuyer = match.kind === 'offer';
        return {
          match,
          personName,
          headline,
          tension: {
            spread: gap,
            yourLabel: isBuyer ? 'Your bid' : 'Your ask',
            yourAmount: constraint.amount,
            theirLabel: isBuyer ? 'Ask' : 'Bid',
            theirAmount: match.currentPrice,
          },
        };
      }
      if (constraint && gap !== undefined && gap <= 0 && match.status === 'negotiating') {
        return { match, personName, headline, favorable: true };
      }
      return { match, personName, headline };
    })
    .sort((a, b) => (a.tension ? -1 : 0) - (b.tension ? -1 : 0)); // tension cases first — they're the ones actually asking for a call
}

/* ------------------------------------------------- 2. What I have in the market */

export interface PortfolioEntry {
  kind: 'need' | 'offer';
  id: string;
  title: string;
  category: string;
  matchCount: number;
  negotiatingCount: number;
  watching: boolean;
}

export function getPortfolio(viewer: Person, matches: Record<string, Match>, cards: MatchCard[]): PortfolioEntry[] {
  const activeMatches = Object.values(matches);
  // Same hard timing gate recommendations.tsx uses — a count that doesn't actually
  // fit the window would send the user to an empty recommendations screen.
  const entryFor = (kind: 'need' | 'offer', item: { id: string; title: string; category: string; window: TimeWindow; howLong?: string }): PortfolioEntry => {
    const complementKind = kind === 'need' ? 'offer' : 'need';
    const matchCount = cards.filter((c) => c.category === item.category && c.kind === complementKind && windowsFit(item.window, c.window)).length;
    const negotiatingCount = activeMatches.filter((m) => m.category === item.category && m.status === 'negotiating').length;
    return { kind, id: item.id, title: item.title, category: item.category, matchCount, negotiatingCount, watching: item.howLong === 'watching' };
  };
  return [...viewer.needs.map((n) => entryFor('need', n)), ...viewer.offers.map((o) => entryFor('offer', o))];
}

/* --------------------------------------------- 3. Almost-clearable — timing only */

/**
 * Price-gap near-misses are already folded into getDecisions (they're an active
 * match, which already needs a decision). This covers the other near-miss: a card
 * that doesn't qualify yet purely on timing, but would with a little more slack —
 * the "move your deadline by 2 days" insight. `SLACK_HOURS` is the widening tried.
 */
const SLACK_HOURS = 48;

export interface TimingOpportunity {
  id: string;
  title: string;
  category: string;
  kind: 'need' | 'offer';
  unlockCount: number;
}

export function getTimingOpportunities(viewer: Person, cards: MatchCard[]): TimingOpportunity[] {
  const widen = (w: TimeWindow): TimeWindow => ({ ...w, endHour: w.endHour + SLACK_HOURS });
  const results: TimingOpportunity[] = [];

  const scan = (kind: 'need' | 'offer', items: { id: string; title: string; category: string; window: TimeWindow }[]) => {
    const complementKind = kind === 'need' ? 'offer' : 'need';
    for (const item of items) {
      const pool = cards.filter((c) => c.category === item.category && c.kind === complementKind);
      const unlockCount = pool.filter((c) => !windowsFit(item.window, c.window) && windowsFit(widen(item.window), c.window)).length;
      if (unlockCount > 0) results.push({ id: item.id, title: item.title, category: item.category, kind, unlockCount });
    }
  };
  scan('need', viewer.needs);
  scan('offer', viewer.offers);
  return results;
}

/* --------------------------------------------------- 4. Working in your favor */

export interface FavorEntry {
  cardId: string;
  personName: string;
  title: string;
  valueLabel: string;
  forTitle: string; // the viewer's own need/offer this is relevant to
}

/** Best good-value card in a category the viewer has an active need/offer for, not already in a match. */
export function getMarketFavor(viewer: Person, matches: Record<string, Match>, cards: MatchCard[], people: Record<string, Person>, categories: AppState['categories']): FavorEntry[] {
  const matchedCardIds = new Set(Object.values(matches).map((m) => m.cardId));
  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const favors: FavorEntry[] = [];

  for (const need of viewer.needs) {
    const pool = cards.filter(
      (c) => c.category === need.category && c.kind === 'offer' && !matchedCardIds.has(c.id) && windowsFit(need.window, c.window)
    );
    const best = pool
      .map((c) => ({ card: c, value: computeMarketValue(c, categoryById[c.category]) }))
      .filter((x) => x.value.isGoodValue)
      .sort((a, b) => b.value.deltaPct - a.value.deltaPct)[0];
    if (best) {
      favors.push({
        cardId: best.card.id,
        personName: people[best.card.personId]?.name.split(' ')[0] ?? 'Someone',
        title: best.card.title,
        valueLabel: best.value.label,
        forTitle: need.title,
      });
    }
  }
  return favors;
}

/* ------------------------------------------------ 5. What DemandOne is doing */

export function getAgentActivity(viewer: Person, matches: Record<string, Match>, cards: MatchCard[]): string[] {
  const lines: string[] = [];
  const negotiating = Object.values(matches).filter((m) => m.status === 'negotiating').length;
  if (negotiating > 0) lines.push(`Negotiating with ${negotiating} match${negotiating === 1 ? '' : 'es'}`);

  const matchedCategories = new Set(Object.values(matches).map((m) => m.category));
  const watchAndFind = (kind: 'need' | 'offer', items: { title: string; category: string; window: TimeWindow; howLong?: string }[]) => {
    const complementKind = kind === 'need' ? 'offer' : 'need';
    for (const item of items) {
      if (item.howLong === 'watching') {
        lines.push(`Watching for ${item.title.toLowerCase()}`);
      } else if (!matchedCategories.has(item.category)) {
        const count = cards.filter((c) => c.category === item.category && c.kind === complementKind && windowsFit(item.window, c.window)).length;
        if (count > 0) lines.push(`Found ${count} potential match${count === 1 ? '' : 'es'} for ${item.title.toLowerCase()}`);
      }
    }
  };
  watchAndFind('need', viewer.needs);
  watchAndFind('offer', viewer.offers);
  return lines;
}

/* ------------------------------------------- 6. Opportunities for what you offer */

export interface CapabilityOpportunity {
  categoryId: string;
  categoryLabel: string;
  needCount: number;
}

/**
 * Not a match or a listing — just "demand exists where your capability profile
 * says you're relevant," derived fresh from the same `cards` Discover already
 * uses. Tapping one hands off to intent-results (see today.tsx) pre-filled with
 * the profile's own summary — the only place a real Offer is ever created; this
 * never auto-posts one itself.
 */
export function getCapabilityOpportunities(viewer: Person, cards: MatchCard[], categories: AppState['categories']): CapabilityOpportunity[] {
  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const results: CapabilityOpportunity[] = [];
  for (const categoryId of viewer.capability?.categories ?? []) {
    const needCount = cards.filter((c) => c.category === categoryId && c.kind === 'need').length;
    if (needCount > 0) results.push({ categoryId, categoryLabel: categoryById[categoryId]?.label ?? categoryId, needCount });
  }
  return results;
}

/* ------------------------------------------------- 7. Trust/network relevance */

export function getNetworkRelevance(matches: Record<string, Match>, people: Record<string, Person>): string | undefined {
  const withPaths = Object.values(matches)
    .map((m) => people[m.personId])
    .find((p) => p && p.trustPaths > 0);
  if (!withPaths) return undefined;
  const name = withPaths.name.split(' ')[0];
  return `${withPaths.trustPaths} ${withPaths.trustPaths === 1 ? 'person' : 'people'} in your network ${withPaths.trustPaths === 1 ? 'has' : 'have'} worked with ${name}.`;
}
