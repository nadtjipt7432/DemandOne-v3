/**
 * Universal Intent Search — the mock "intent model" behind it.
 *
 * A real system would parse free text into entities/goals/constraints with an LLM.
 * This is a rule-based stand-in, the same spirit as `inferMode` in service.ts: a
 * small hand-authored situation → category expansion table, with a generic keyword
 * fallback so no input is ever a dead end. `interpretIntent` is pure and
 * screen-agnostic — it only decides *which categories* are relevant and why; the
 * actual ranking/gating of real listings within those categories is still entirely
 * `computeFit` / `computeMarketValue` / `passesHardConstraints` in matching.ts.
 */

import type { Criterion, WorkCategory } from './types';

export type { WorkCategory };

export interface ImpliedCategory {
  categoryId: string;
  why: string;
}

export interface IntentResult {
  interpretation: string;
  impliedCategories: ImpliedCategory[];
}

interface SituationRule {
  id: string;
  triggers: string[];
  interpretation: string;
  impliedCategories: (ImpliedCategory & { priority: number })[];
}

const SITUATION_RULES: SituationRule[] = [
  {
    id: 'college-admissions',
    triggers: [
      'college admissions',
      'application essay',
      'admissions essay',
      'college essay',
      'college counselor',
      'test prep',
      'sat tutor',
      'act tutor',
    ],
    interpretation: 'you need college admissions help',
    impliedCategories: [{ categoryId: 'admissions', why: 'admissions consultants and tutors with near-term availability', priority: 1 }],
  },
  {
    id: 'tax-deadline',
    triggers: ['taxes filed', 'file my taxes', 'tax return', 'tax question', 'tax filing', 'structure an acquisition'],
    interpretation: 'you need tax expertise',
    impliedCategories: [{ categoryId: 'tax', why: 'tax partners and preparers with near-term availability', priority: 1 }],
  },
  {
    id: 'financial-model',
    triggers: ['financial model', 'investor deck', 'investor materials', 'cap table', 'pitch deck'],
    interpretation: 'you need financial modeling help',
    impliedCategories: [{ categoryId: 'finance', why: 'financial modeling and fundraising-materials specialists', priority: 1 }],
  },
  {
    id: 'fundraising',
    triggers: ['raising a series', 'fundraising round', 'raising a round', 'fundraising strategy', 'fundraise'],
    interpretation: "you're raising money",
    impliedCategories: [
      { categoryId: 'finance', why: 'financial modeling for the raise', priority: 1 },
      { categoryId: 'advisory', why: 'someone to manage the fundraising process', priority: 2 },
    ],
  },
  {
    id: 'ma-sellside',
    triggers: ['m&a advisor', 'sell-side', 'sell side', 'due diligence', 'diligence work', 'preparing to sell', 'acquisition'],
    interpretation: 'you need M&A or diligence support',
    impliedCategories: [{ categoryId: 'ma-advisory', why: 'sell-side and diligence specialists', priority: 1 }],
  },
  {
    id: 'fractional-cfo',
    triggers: ['fractional cfo', 'fractional executive', 'fractional coo', 'runway planning'],
    interpretation: "you're looking for fractional executive capacity",
    impliedCategories: [{ categoryId: 'advisory', why: 'fractional CFOs and executives with open capacity', priority: 1 }],
  },
  {
    id: 'strategy-consulting',
    triggers: ['strategy consultant', 'strategy consulting', 'go-to-market', 'pricing strategy', 'consulting clients'],
    interpretation: 'you need strategy or consulting support',
    impliedCategories: [{ categoryId: 'strategy', why: 'strategy consultants with open capacity', priority: 1 }],
  },
  {
    id: 'ma-capacity',
    triggers: ['m&a work', 'm&a deals', 'm&a transactions'],
    interpretation: 'you could help with M&A work',
    impliedCategories: [{ categoryId: 'ma-advisory', why: 'companies running a deal process often need exactly this', priority: 1 }],
  },
  {
    id: 'banker-capacity',
    triggers: ['former investment banker', 'investment banker', 'private equity', 'operating partner'],
    interpretation: 'you could help a company with your finance experience',
    impliedCategories: [{ categoryId: 'finance', why: 'companies nearby often need exactly this', priority: 1 }],
  },
  {
    id: 'spreadsheet-skill',
    triggers: ['excel', 'spreadsheet', 'bookkeeping', 'quickbooks'],
    interpretation: "you're good with spreadsheets and have time to spare",
    impliedCategories: [{ categoryId: 'finance', why: 'companies nearby often need exactly this', priority: 1 }],
  },
];

/** Fallback: direct keyword → category scan, so no input is ever a dead end. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  advisory: ['cfo', 'fractional', 'advisor', 'advisory', 'runway'],
  finance: ['financial model', 'modeling', 'fundraising', 'cap table', 'investor deck', 'excel', 'bookkeeping'],
  tax: ['tax', 'filing', 'accountant', 'irs'],
  'ma-advisory': ['m&a', 'merger', 'acquisition', 'diligence', 'sell-side'],
  strategy: ['strategy', 'consulting', 'go-to-market', 'pricing'],
  admissions: ['admissions', 'college essay', 'application essay', 'tutor', 'tutoring', 'test prep', 'sat', 'act score'],
};

export function interpretIntent(text: string): IntentResult {
  const lower = text.toLowerCase();

  const rule = SITUATION_RULES.find((r) => r.triggers.some((t) => lower.includes(t)));
  if (rule) {
    return {
      interpretation: rule.interpretation,
      impliedCategories: [...rule.impliedCategories]
        .sort((a, b) => a.priority - b.priority)
        .map(({ categoryId, why }) => ({ categoryId, why })),
    };
  }

  const fallbackMatches = Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => keywords.some((k) => lower.includes(k)))
    .map(([categoryId]) => ({ categoryId, why: 'mentioned in what you typed' }));

  if (fallbackMatches.length > 0) {
    return { interpretation: "here's what looks relevant", impliedCategories: fallbackMatches };
  }

  return { interpretation: 'tell me more, or browse the Exchange directly', impliedCategories: [] };
}

const TIMING_PHRASES: { phrase: string; label: string }[] = [
  { phrase: 'next two days', label: 'Within 2 days' },
  { phrase: 'next month', label: 'Next month' },
  { phrase: 'next week', label: 'Next week' },
  { phrase: 'this week', label: 'This week' },
  { phrase: 'this month', label: 'This month' },
  { phrase: 'next quarter', label: 'This quarter' },
];

const SECTOR_KEYWORDS: Record<string, string> = {
  healthcare: 'Healthcare',
  fintech: 'Fintech',
  'real estate': 'Real estate',
  saas: 'SaaS',
};

export interface QuickFacts {
  timingLabel?: string;
  sector?: string;
  priorityLabel?: string;
  priorities?: Criterion[];
  experienceLabel?: string;
  availabilityLabel?: string;
}

/**
 * A second, narrower deterministic pass over the same text — the "What DemandOne
 * understood" bullets shown before the structured form. Pulls out a handful of
 * concrete facts (timing, sector, a stated priority trade-off, experience/
 * availability) only when the phrasing is unambiguous; same keyword-scan spirit as
 * `interpretIntent`, not general NLU. Anything not confidently found is left
 * undefined so the UI can say so plainly ("Not specified") rather than guess.
 */
export function extractQuickFacts(text: string): QuickFacts {
  const lower = text.toLowerCase();
  const facts: QuickFacts = {};

  const timing = TIMING_PHRASES.find((t) => lower.includes(t.phrase));
  if (timing) facts.timingLabel = timing.label;

  const sectorEntry = Object.entries(SECTOR_KEYWORDS).find(([k]) => lower.includes(k));
  if (sectorEntry) facts.sector = sectorEntry[1];

  if (/experience/.test(lower) && /matters more than|more than price|over price/.test(lower)) {
    facts.priorityLabel = 'Relevant experience > price';
    facts.priorities = ['expertise', 'budget'];
  }

  if (lower.includes('investment banker')) facts.experienceLabel = 'Investment banking';
  else if (lower.includes('tax partner')) facts.experienceLabel = 'Tax partner';
  else if (lower.includes('consultant')) facts.experienceLabel = 'Consulting';

  const hoursMatch = lower.match(/(\d+)\s*hours?/);
  if (hoursMatch) {
    const when = lower.includes('next week')
      ? 'next week'
      : lower.includes('this week')
        ? 'this week'
        : lower.includes('next month')
          ? 'next month'
          : undefined;
    facts.availabilityLabel = when ? `${hoursMatch[1]} hours ${when}` : `${hoursMatch[1]} hours`;
  }

  return facts;
}

/**
 * The Exchange's Work filter — six deliberately broad categories describing the TYPE
 * of value being exchanged (advise/analyze/build/operate/connect/create), not a
 * profession or industry. A Need/Offer/card can belong to more than one. Same
 * deterministic mock as the rest of this module: a category-level default, unioned
 * with any more specific keyword hits in the title/description — never manually
 * tagged, and computed on demand (not persisted) so it can't drift from the text.
 * (`WorkCategory` itself lives in types.ts — re-exported above.)
 */
export const WORK_LABEL: Record<WorkCategory, string> = {
  advise: 'Advise',
  analyze: 'Analyze',
  build: 'Build',
  operate: 'Operate',
  connect: 'Connect',
  create: 'Create',
};

const CATEGORY_DEFAULT_WORK: Record<string, WorkCategory[]> = {
  'ma-advisory': ['advise', 'analyze'],
  finance: ['analyze', 'build'],
  advisory: ['advise', 'operate'],
  tax: ['advise', 'analyze'],
  strategy: ['advise', 'analyze'],
  admissions: ['advise', 'analyze'],
};

const KEYWORD_WORK: { keywords: string[]; work: WorkCategory[] }[] = [
  { keywords: ['m&a', 'merger', 'acquisition', 'diligence', 'sell-side'], work: ['advise', 'analyze'] },
  { keywords: ['financial model', 'modeling', 'cap table'], work: ['analyze', 'build'] },
  { keywords: ['fractional cfo', 'fractional executive', 'fractional coo'], work: ['advise', 'operate'] },
  { keywords: ['fundraising', 'fundraise', 'investor'], work: ['advise', 'connect'] },
  { keywords: ['strategy', 'consulting', 'go-to-market'], work: ['advise', 'analyze'] },
  { keywords: ['bookkeeping', 'quickbooks'], work: ['analyze', 'operate'] },
  { keywords: ['college essay', 'application essay', 'admissions', 'test prep'], work: ['advise', 'create'] },
  { keywords: ['coaching', 'resume', 'linkedin'], work: ['advise', 'connect'] },
];

export function inferWorkCategories(text: string, categoryId: string): WorkCategory[] {
  const lower = text.toLowerCase();
  const set = new Set<WorkCategory>(CATEGORY_DEFAULT_WORK[categoryId] ?? ['advise']);
  for (const { keywords, work } of KEYWORD_WORK) {
    if (keywords.some((k) => lower.includes(k))) work.forEach((w) => set.add(w));
  }
  return Array.from(set);
}

export interface CapabilityInterpretation {
  categories: string[];
  workTypes: WorkCategory[];
}

/**
 * Capability onboarding's interpreter — not a third engine, just `interpretIntent`
 * (for which categories this capability is relevant to) combined with
 * `inferWorkCategories` (for the broad Advise/Analyze/... tags), the same way
 * intent-results.tsx already composes the two for a Need/Offer.
 */
export function interpretCapability(text: string): CapabilityInterpretation {
  const { impliedCategories } = interpretIntent(text);
  const categories = impliedCategories.map((c) => c.categoryId);
  const workTypes = Array.from(new Set(categories.flatMap((c) => inferWorkCategories(text, c))));
  return { categories, workTypes: workTypes.length > 0 ? workTypes : inferWorkCategories(text, categories[0] ?? '') };
}
