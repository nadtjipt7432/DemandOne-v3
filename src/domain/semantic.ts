/**
 * The semantic interpreter behind voice (and typed) input — a deterministic,
 * documented stand-in for a language model. It turns an utterance plus the
 * current context into a structured interpretation; it never acts on its own.
 *
 * What it understands is the set of scenarios in `SCENARIOS` plus the parsers for
 * timing, budget, hours, counterparty terms and short replies. Anything outside
 * that set produces a clarifying question, never a guessed intent.
 *
 * Documented scenarios (see tests/unit/semantic.test.ts for the full list):
 *  - Acquisition / diligence    "We're looking at buying a competitor and need someone to check the numbers"
 *  - Fundraising model          "We're raising a Series A and need a financial model"
 *  - Valuation                  "I need the business valued before talking to investors"
 *  - Market research            "How big is the UK market for clinic software?"
 *  - Tax on a deal              "Need tax advice on structuring an acquisition"
 *  - Fractional finance lead    "We need a part-time CFO"
 *  - Releasing capacity (offer) "I have 10 hours next week for financial modeling at about £150 an hour"
 *  - Follow-ups                 "Yes, but within three weeks" · "Budget is around £8k" · "No, it's more valuation"
 *  - Negotiation                "I could go to £5,200 if they deliver Wednesday" · "accept" · "hold" · "stop"
 *  - Competing bids             "Compare the bids" · "Take the recurring one"
 *  - Capacity                   "I only have 6 hours now"
 *  - Delivery / completion      "The work's delivered" · "Confirm it's done"
 *  - Feedback                   "Yes, I'd work with them again"
 *  - Adjacent services          "What else might I need?"
 */

import { inferCategories } from './intents';
import { parseMoney } from './money';
import type { DeadlineOption, PaymentOption, PriceUnit, ScopeOption, VolumeOption } from './types';

/* ------------------------------------------------------------- mandates */

export interface MandateDraft {
  mode: 'need' | 'offer';
  objective: string;
  likelyNeed: string;
  category: string;
  related: string[];
  timingLabel?: string;
  timingHours?: number;
  budget?: number;
  unit?: PriceUnit;
  hours?: number;
  summary: string;
}

/** Fields worth asking about before a mandate goes to market. */
export function missingFields(d: MandateDraft): ('timing' | 'budget')[] {
  const out: ('timing' | 'budget')[] = [];
  if (!d.timingLabel) out.push('timing');
  if (d.budget === undefined) out.push('budget');
  return out;
}

interface Scenario {
  id: string;
  mode: 'need' | 'offer';
  match: RegExp[];
  objective: string;
  likelyNeed: string;
  category: string;
  related: string[];
}

const SCENARIOS: Scenario[] = [
  {
    id: 'acquisition-diligence',
    mode: 'need',
    match: [/\b(buy|buying|acquir\w*|acquisition|take over|merge\w*)\b.*\b(compan|competitor|business|target)/i, /\bdue diligence\b|\bfinancial diligence\b|\bquality of earnings\b/i, /\b(numbers|financials)\b.*\b(make sense|add up|stack up|hold up)\b/i],
    objective: 'Potential acquisition',
    likelyNeed: 'Financial due diligence',
    category: 'ma-advisory',
    related: ['Valuation', 'Financial analysis', 'Transaction advisory'],
  },
  {
    id: 'commercial-diligence',
    mode: 'need',
    match: [/\bcommercial diligence\b/i, /\binvestment committee\b|\bbefore (the )?IC\b/i],
    objective: 'Investment decision',
    likelyNeed: 'Commercial due diligence',
    category: 'strategy',
    related: ['Market research', 'Customer interviews', 'Competitive analysis'],
  },
  {
    id: 'fundraising-model',
    mode: 'need',
    match: [/\b(rais\w*|fundrais\w*|series [abc]|seed round|investors?)\b.*\b(model|forecast|numbers|projections)/i, /\b(financial model|three[- ]statement)\b/i],
    objective: 'Fundraising',
    likelyNeed: 'Financial model',
    category: 'finance',
    related: ['Valuation', 'Investor deck review'],
  },
  {
    id: 'valuation',
    mode: 'need',
    match: [/\bvalu(e|ed|ation)\b.*\b(business|company|startup|stake)\b/i, /\bwhat('s| is) (the |my |our )?(business|company) worth\b/i],
    objective: 'Understand what the business is worth',
    likelyNeed: 'Valuation',
    category: 'finance',
    related: ['Financial model', 'Transaction advisory'],
  },
  {
    id: 'market-research',
    mode: 'need',
    match: [/\b(how big|market size|market sizing|size the market|tam)\b/i, /\b(market research|competitor (landscape|scan|analysis)|competitive analysis)\b/i, /\bmarket entry|go[- ]to[- ]market\b/i],
    objective: 'Understand the market',
    likelyNeed: 'Market research and sizing',
    category: 'strategy',
    related: ['Competitive analysis', 'Go-to-market strategy'],
  },
  {
    id: 'deal-tax',
    mode: 'need',
    match: [/\btax\b/i, /\b(vat|hmrc|year[- ]end|bookkeeping)\b/i],
    objective: 'Tax certainty',
    likelyNeed: 'Tax structuring advice',
    category: 'tax',
    related: ['Bookkeeping clean-up', 'Transaction advisory'],
  },
  {
    id: 'fractional-cfo',
    mode: 'need',
    match: [/\b(fractional|part[- ]time|interim)\b.*\b(cfo|finance (lead|director)|coo)\b/i, /\bcfo\b/i],
    objective: 'Senior finance leadership',
    likelyNeed: 'Fractional CFO',
    category: 'advisory',
    related: ['Financial model', 'Board reporting'],
  },
];

const OFFER_SIGNALS = /\b(i have|i've got|i can|i could|i'm available|available|free|spare|offering|release|releasing|i do|i'm a|former)\b/i;

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, a: 1, an: 1 };

function num(token: string): number | undefined {
  const n = Number(token);
  return Number.isFinite(n) ? n : NUMBER_WORDS[token.toLowerCase()];
}

/** "within three weeks", "by Friday", "next week", "asap" → label + hours from now. */
export function parseTiming(text: string): { label: string; hours: number } | undefined {
  const lower = text.toLowerCase();
  const m = lower.match(/\b(?:within|in|over the next|inside)\s+(\w+)\s+(day|week|month)s?\b/);
  if (m) {
    const n = num(m[1]);
    if (n) {
      const hours = n * (m[2] === 'day' ? 24 : m[2] === 'week' ? 168 : 720);
      return { label: `Within ${n} ${m[2]}${n === 1 ? '' : 's'}`, hours };
    }
  }
  if (/\b(asap|as soon as possible|urgent|urgently|right away)\b/.test(lower)) return { label: 'As soon as possible', hours: 72 };
  if (/\btomorrow\b/.test(lower)) return { label: 'By tomorrow', hours: 24 };
  if (/\bthis week\b/.test(lower)) return { label: 'This week', hours: 120 };
  if (/\bnext week\b/.test(lower)) return { label: 'Next week', hours: 288 };
  if (/\bthis month\b/.test(lower)) return { label: 'This month', hours: 720 };
  if (/\bnext month\b/.test(lower)) return { label: 'Next month', hours: 1440 };
  const day = lower.match(/\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (day) return { label: `By ${day[1][0].toUpperCase()}${day[1].slice(1)}`, hours: 168 };
  return undefined;
}

/** "£8k", "budget of 8,000", "around 150 an hour" → amount and unit. */
export function parseBudget(text: string): { amount: number; unit: PriceUnit } | undefined {
  const lower = text.toLowerCase();
  const m = lower.match(/(?:£|gbp\s*)\s?([\d,.]+\s*(?:k|thousand)?)|([\d,.]+\s*(?:k|thousand)?)\s*(?:pounds|quid|gbp)|(?:budget|pay|spend|around|about|up to|max(?:imum)?|rate)\s*(?:is|of|at)?\s*(?:£)?\s*([\d,.]+\s*(?:k|thousand)?)/);
  const raw = m?.[1] ?? m?.[2] ?? m?.[3];
  if (!raw) return undefined;
  const amount = parseMoney(raw);
  if (!amount) return undefined;
  const unit: PriceUnit = /\b(an|per|a|\/)\s?(hour|hr)\b/.test(lower) ? 'hour' : 'fixed';
  return { amount, unit };
}

export function parseHours(text: string): number | undefined {
  const m = text.toLowerCase().match(/\b(\d+|\w+)\s+hours?\b/);
  return m ? num(m[1]) : undefined;
}

function detectMode(text: string, scenario?: Scenario): 'need' | 'offer' {
  if (OFFER_SIGNALS.test(text) && !/\b(i need|we need|looking for|we're looking|i'm looking|need someone|want someone|help me|help us)\b/i.test(text)) return 'offer';
  return scenario?.mode ?? 'need';
}

/* --------------------------------------------------------- interpretation */

export type VoiceContext =
  | { kind: 'none' }
  | { kind: 'draft'; draft: MandateDraft }
  | { kind: 'negotiation'; negotiationId: string; role: 'buyer' | 'seller'; listedDeadline: string }
  | { kind: 'bids'; offerId: string; names: string[] }
  | { kind: 'booking'; bookingId: string; role: 'buyer' | 'seller'; status: string };

export interface TermsChange {
  price?: number;
  deadline?: DeadlineOption;
  scope?: ScopeOption;
  payment?: PaymentOption;
  volume?: VolumeOption;
}

export type Interpretation =
  | { type: 'mandate'; draft: MandateDraft }
  | { type: 'mandate-update'; draft: MandateDraft; changed: string[] }
  | { type: 'confirm' }
  | { type: 'decline' }
  | { type: 'negotiation'; action: 'accept' | 'hold' | 'stop' | 'status' }
  | { type: 'negotiation'; action: 'propose'; change: TermsChange }
  | { type: 'bids'; action: 'compare' | 'best' | 'pairs' | 'flexible' }
  | { type: 'bids'; action: 'what-if' | 'accept'; name: string }
  | { type: 'capacity'; hours: number }
  | { type: 'delivery' }
  | { type: 'feedback'; recommends: boolean }
  | { type: 'adjacent' }
  | { type: 'navigate'; to: 'exchange' | 'deals' | 'home' | 'profile' }
  | { type: 'clarify'; question: string };

const YES = /^\s*(yes|yeah|yep|correct|right|that's right|exactly|sure|ok(ay)?|go ahead|do it|please do|sounds good)\b/i;
const NO = /^\s*(no|nope|not quite|not really|wrong|that's not it)\b/i;

/** Deadline words in a negotiation: a named weekday or "a few more days" → +3; "another week" → +1 week. */
function parseDeadlineShift(lower: string): DeadlineOption | undefined {
  if (/\b(another|extra|additional|one more)\s+week\b|\ba week later\b|\b\+1 week\b/.test(lower)) return 'plus7';
  if (/\b(monday|tuesday|wednesday|thursday|friday)\b|\b(few|couple of|three|3) (more|extra) days\b|\bextend(ed)? (the )?(delivery|deadline)\b|\bmore time\b/.test(lower)) return 'plus3';
  return undefined;
}

function parseTermsChange(lower: string): TermsChange {
  const change: TermsChange = {};
  const price = lower.match(/(?:£|go to|offer|pay|up to|at)\s*£?\s*([\d,.]+\s*k?)/);
  if (price) change.price = parseMoney(price[1]);
  const deadline = parseDeadlineShift(lower);
  if (deadline) change.deadline = deadline;
  if (/\b(one|1|fewer|single) revision/.test(lower)) change.scope = 'one-revision';
  else if (/\b(core|smaller|reduced|no) (deliverable|scope|revisions)\b|\bjust the core\b/.test(lower)) change.scope = 'core';
  if (/\b(deposit|half up ?front|50%)\b/.test(lower)) change.payment = 'deposit';
  else if (/\b(pay|paid) (it all |in full )?up ?front\b/.test(lower)) change.payment = 'upfront';
  if (/\b(recurring|monthly|ongoing|three months|3 months)\b/.test(lower)) change.volume = 'recurring';
  return change;
}

function draftFrom(text: string): MandateDraft | undefined {
  const scenario = SCENARIOS.find((s) => s.match.some((r) => r.test(text)));
  const inferred = inferCategories(text);
  const mode = detectMode(text, scenario);
  const timing = parseTiming(text);
  const budget = parseBudget(text);
  const hours = parseHours(text);

  if (scenario) {
    return {
      mode,
      objective: mode === 'offer' ? 'Release capacity' : scenario.objective,
      likelyNeed: scenario.likelyNeed,
      category: scenario.category,
      related: scenario.related,
      timingLabel: timing?.label,
      timingHours: timing?.hours,
      budget: budget?.amount,
      unit: budget?.unit ?? (mode === 'offer' && hours ? 'hour' : 'fixed'),
      hours,
      summary: mode === 'offer' ? `${scenario.likelyNeed} capacity` : scenario.likelyNeed,
    };
  }
  if (inferred.length > 0 && (mode === 'offer' || /\b(need|looking for|want|help)\b/i.test(text))) {
    const first = inferred[0];
    const label = CATEGORY_NEED[first.categoryId] ?? 'Professional support';
    return {
      mode,
      objective: mode === 'offer' ? 'Release capacity' : 'Get specialist help',
      likelyNeed: label,
      category: first.categoryId,
      related: inferred.slice(1).map((c) => CATEGORY_NEED[c.categoryId]).filter(Boolean) as string[],
      timingLabel: timing?.label,
      timingHours: timing?.hours,
      budget: budget?.amount,
      unit: budget?.unit ?? (mode === 'offer' && hours ? 'hour' : 'fixed'),
      hours,
      summary: mode === 'offer' ? `${label} capacity` : label,
    };
  }
  return undefined;
}

const CATEGORY_NEED: Record<string, string> = {
  finance: 'Financial modeling and valuation',
  'ma-advisory': 'Financial due diligence',
  strategy: 'Market research and strategy',
  tax: 'Tax structuring advice',
  advisory: 'Fractional finance leadership',
};

const CORRECTIONS: { match: RegExp; likelyNeed: string; category: string }[] = [
  { match: /\bvaluation\b/i, likelyNeed: 'Valuation', category: 'finance' },
  { match: /\bcommercial\b/i, likelyNeed: 'Commercial due diligence', category: 'strategy' },
  { match: /\b(model|modelling|modeling)\b/i, likelyNeed: 'Financial model', category: 'finance' },
  { match: /\btax\b/i, likelyNeed: 'Tax structuring advice', category: 'tax' },
  { match: /\b(market|research|sizing)\b/i, likelyNeed: 'Market research and sizing', category: 'strategy' },
  { match: /\bdiligence\b/i, likelyNeed: 'Financial due diligence', category: 'ma-advisory' },
];

export function interpret(text: string, context: VoiceContext): Interpretation {
  const lower = text.toLowerCase().trim();
  if (!lower) return { type: 'clarify', question: "I didn't catch anything. Try saying what you need, or what you can offer." };

  if (/\b(go to|open|show( me)?)\b.*\b(exchange|market)\b/.test(lower)) return { type: 'navigate', to: 'exchange' };
  if (/\b(go to|open|show( me)?)\b.*\b(deals|negotiations)\b/.test(lower)) return { type: 'navigate', to: 'deals' };
  if (/\b(go to|open|show( me)?)\b.*\b(profile|settings|account)\b/.test(lower)) return { type: 'navigate', to: 'profile' };

  // Refining a mandate in progress.
  if (context.kind === 'draft') {
    const d = context.draft;
    const timing = parseTiming(lower);
    const budget = parseBudget(lower);
    const hours = parseHours(lower);
    const correction = NO.test(lower) ? CORRECTIONS.find((c) => c.match.test(lower)) : undefined;
    const next: MandateDraft = {
      ...d,
      ...(timing ? { timingLabel: timing.label, timingHours: timing.hours } : {}),
      ...(budget ? { budget: budget.amount, unit: budget.unit } : {}),
      ...(hours ? { hours } : {}),
      ...(correction ? { likelyNeed: correction.likelyNeed, category: correction.category, summary: correction.likelyNeed } : {}),
    };
    const changed = [timing && 'timing', budget && 'budget', hours && 'hours', correction && 'need'].filter(Boolean) as string[];
    if (changed.length > 0) return { type: 'mandate-update', draft: next, changed };
    if (YES.test(lower) || /\b(not sure|don't know|no idea|skip|flexible|open|whatever)\b/.test(lower)) return { type: 'confirm' };
    if (NO.test(lower)) return { type: 'clarify', question: 'What is it you need instead? For example valuation, a financial model, or market research.' };
    const fresh = draftFrom(text);
    if (fresh) return { type: 'mandate', draft: fresh };
    return { type: 'clarify', question: 'Tell me the timing or budget, or say "yes" to go ahead.' };
  }

  if (context.kind === 'negotiation') {
    if (/\b(stop|walk away|cancel|end it|withdraw)\b/.test(lower)) return { type: 'negotiation', action: 'stop' };
    if (/\b(hold|wait|stay|keep (my|our) (bid|offer|position))\b/.test(lower)) return { type: 'negotiation', action: 'hold' };
    if (/\b(where are we|what's the (gap|difference|status)|status|recap|summar)/.test(lower)) return { type: 'negotiation', action: 'status' };
    const change = parseTermsChange(lower);
    if (Object.keys(change).length > 0 && !/^\s*(accept|approve)\b/.test(lower)) return { type: 'negotiation', action: 'propose', change };
    if (/\b(accept|approve|take it|agree|deal|go with their)\b/.test(lower) || YES.test(lower)) return { type: 'negotiation', action: 'accept' };
  }

  if (context.kind === 'bids') {
    const named = (word: string | undefined) => (word ? context.names.find((n) => n.toLowerCase().startsWith(word.toLowerCase())) : undefined);
    const whatIf = lower.match(/\bwhat (?:happens|if)\b.*\b(?:accept|take|go with)\s+([a-z]+)/);
    if (whatIf && named(whatIf[1])) return { type: 'bids', action: 'what-if', name: named(whatIf[1])! };
    if (/\bflexib|\bleaves? me\b.*\bmost\b/.test(lower)) return { type: 'bids', action: 'flexible' };
    if (/\b(two of them|both|take on two|more than one|several of them|two at once)\b/.test(lower)) return { type: 'bids', action: 'pairs' };
    if (/\b(best|recommend|should i|for me|which (?:one|proposal|bid|of these))\b/.test(lower)) return { type: 'bids', action: 'best' };
    if (/\b(compare|difference)\b/.test(lower)) return { type: 'bids', action: 'compare' };
    const accept = lower.match(/\b(?:accept|take|go with)\s+([a-z]+)/);
    if (accept && named(accept[1])) return { type: 'bids', action: 'accept', name: named(accept[1])! };
  }

  if (context.kind === 'booking') {
    if (/\b(deliver(ed)?|done|finished|complete(d)?|sent it|handed over|received)\b/.test(lower) && !/\bagain\b/.test(lower)) return { type: 'delivery' };
    if (context.status === 'complete') {
      if (/\b(again|recommend)\b/.test(lower) || YES.test(lower)) return { type: 'feedback', recommends: !NO.test(lower) && !/\b(wouldn't|would not|never)\b/.test(lower) };
      if (NO.test(lower)) return { type: 'feedback', recommends: false };
    }
    if (/\b(what else|related|also need|next|adjacent|anything else)\b/.test(lower)) return { type: 'adjacent' };
  }

  const capacity = lower.match(/\b(?:only have|now have|reduce (?:it |capacity )?to|change (?:it |capacity )?to)\s+(\d+|\w+)\s+hours?\b/);
  if (capacity) {
    const hours = num(capacity[1]);
    if (hours !== undefined) return { type: 'capacity', hours };
  }

  if (/\b(what else|related services|anything else i might need)\b/.test(lower)) return { type: 'adjacent' };

  const draft = draftFrom(text);
  if (draft) return { type: 'mandate', draft };

  return {
    type: 'clarify',
    question: "I didn't catch a market action in that. You can tell me what you need, what you can offer, or respond to a counteroffer.",
  };
}
