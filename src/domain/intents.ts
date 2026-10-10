/**
 * Category inference — the rule-based stand-in for an intent model. Pure and
 * deterministic: phrases map to exchange categories, with a keyword fallback.
 * The richer conversational interpreter (semantic.ts) builds on these tables.
 */

import type { WorkCategory } from './types';

export type { WorkCategory };

export interface ImpliedCategory {
  categoryId: string;
  why: string;
}

/** Phrase → category, most specific first. Every match counts (a capability can span categories). */
const CATEGORY_PHRASES: { categoryId: string; phrases: string[]; why: string }[] = [
  {
    categoryId: 'ma-advisory',
    phrases: ['due diligence', 'diligence', 'acquisition', 'acquire', 'buying a competitor', 'buy a competitor', 'merger', 'm&a', 'sell-side', 'transaction advisory', 'quality of earnings'],
    why: 'deal and diligence specialists',
  },
  {
    categoryId: 'finance',
    phrases: ['financial model', 'financial modelling', 'three-statement', 'valuation', 'value the business', 'fp&a', 'forecast', 'reforecast', 'cap table', 'investor deck', 'fundraising', 'raise', 'series a', 'series b', 'spreadsheet', 'excel', 'financial analysis', 'numbers'],
    why: 'financial modeling and valuation',
  },
  {
    categoryId: 'strategy',
    phrases: ['market research', 'market sizing', 'market size', 'how big the market', 'competitive analysis', 'competitor landscape', 'go-to-market', 'market entry', 'pricing strategy', 'strategy', 'commercial diligence'],
    why: 'strategy and market research',
  },
  {
    categoryId: 'tax',
    phrases: ['tax', 'vat', 'bookkeeping', 'year-end', 'filing', 'hmrc', 'structuring'],
    why: 'tax structuring and compliance',
  },
  {
    categoryId: 'advisory',
    phrases: ['fractional cfo', 'fractional', 'cfo', 'coo', 'interim', 'board', 'part-time finance lead', 'runway'],
    why: 'fractional leadership',
  },
];

export function inferCategories(text: string): ImpliedCategory[] {
  const lower = text.toLowerCase();
  const hits: ImpliedCategory[] = [];
  for (const rule of CATEGORY_PHRASES) {
    if (rule.phrases.some((p) => lower.includes(p)) && !hits.some((h) => h.categoryId === rule.categoryId)) {
      hits.push({ categoryId: rule.categoryId, why: rule.why });
    }
  }
  return hits;
}

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
};

const KEYWORD_WORK: { keywords: string[]; work: WorkCategory[] }[] = [
  { keywords: ['diligence', 'acquisition', 'valuation'], work: ['advise', 'analyze'] },
  { keywords: ['model', 'modeling', 'modelling', 'cap table'], work: ['analyze', 'build'] },
  { keywords: ['fractional', 'interim'], work: ['advise', 'operate'] },
  { keywords: ['fundraising', 'investor'], work: ['advise', 'connect'] },
  { keywords: ['research', 'sizing'], work: ['analyze'] },
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

/** Every category the description touches, plus broad work types. */
export function interpretCapability(text: string): CapabilityInterpretation {
  const categories = inferCategories(text).map((c) => c.categoryId);
  const workTypes = Array.from(new Set(categories.flatMap((c) => inferWorkCategories(text, c))));
  return { categories, workTypes: workTypes.length > 0 ? workTypes : ['advise'] };
}
