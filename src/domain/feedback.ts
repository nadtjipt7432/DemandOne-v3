/**
 * Reciprocal feedback, measured against the agreed terms rather than stars.
 * Each side answers "would you work with them again?", rates four aspects of the
 * other party's role as fell short / as agreed / beyond, and may add one line.
 * Ratings roll up into a per-aspect record on the reviewed person.
 */
import type { Review, Reputation } from './types';

/** The role of the person being reviewed. */
export type ReviewedRole = 'seller' | 'buyer';
export type AspectKey = 'quality' | 'timeliness' | 'communication' | 'scope' | 'brief' | 'payment' | 'responsiveness';
export type AspectRating = 'short' | 'met' | 'exceeded';

export const ASPECTS: Record<ReviewedRole, { key: AspectKey; label: string }[]> = {
  seller: [
    { key: 'quality', label: 'Quality of work' },
    { key: 'timeliness', label: 'Delivered on time' },
    { key: 'communication', label: 'Communication' },
    { key: 'scope', label: 'Kept to the agreed scope' },
  ],
  buyer: [
    { key: 'brief', label: 'Clear brief' },
    { key: 'payment', label: 'Confirmed promptly' },
    { key: 'responsiveness', label: 'Responsive' },
    { key: 'scope', label: 'Kept to the agreed scope' },
  ],
};

export const RATING_LABEL: Record<AspectRating, string> = { short: 'Fell short', met: 'As agreed', exceeded: 'Beyond' };
export const RATINGS: AspectRating[] = ['short', 'met', 'exceeded'];
export const NOTE_MAX = 280;

const LABEL: Record<AspectKey, string> = Object.fromEntries(
  [...ASPECTS.seller, ...ASPECTS.buyer].map((a) => [a.key, a.label])
) as Record<AspectKey, string>;

export function aspectLabel(key: AspectKey): string {
  return LABEL[key];
}

export interface ReviewInput {
  recommends: boolean;
  ratings?: Partial<Record<AspectKey, AspectRating>>;
  note?: string;
}

export type ReviewIssue = 'unrated' | 'unexplained' | 'note-too-long';

export const REVIEW_ISSUE_TEXT: Record<ReviewIssue, string> = {
  unrated: 'Rate each aspect against what was agreed.',
  unexplained: 'Mark what fell short, or add a note, so the record says why.',
  'note-too-long': `Keep the note under ${NOTE_MAX} characters.`,
};

/**
 * `complete` reviews (the form) rate every aspect; a quick review (voice) can carry
 * only the recommendation. Either way a "no" must say why.
 */
export function validateReview(input: ReviewInput, role: ReviewedRole, complete: boolean): ReviewIssue | null {
  const note = input.note?.trim() ?? '';
  if (note.length > NOTE_MAX) return 'note-too-long';
  const ratings = input.ratings ?? {};
  if (complete && ASPECTS[role].some((a) => !ratings[a.key])) return 'unrated';
  if (!input.recommends && !Object.values(ratings).includes('short') && !note) return 'unexplained';
  return null;
}

export function toReview(input: ReviewInput, at: string, simulated = false): Review {
  const note = input.note?.trim();
  return { recommends: input.recommends, ratings: { ...(input.ratings ?? {}) }, ...(note ? { note } : {}), at, ...(simulated ? { simulated } : {}) };
}

export function emptyReputation(): Reputation {
  return { aspects: {}, notes: [] };
}

/** Fold one received review into a person's record. Notes keep the latest few. */
export function applyReview(rep: Reputation | undefined, review: Review, from: { name: string; role: ReviewedRole }): Reputation {
  const base = rep ?? emptyReputation();
  const aspects = { ...base.aspects };
  for (const [key, rating] of Object.entries(review.ratings) as [AspectKey, AspectRating][]) {
    const t = aspects[key] ?? { short: 0, met: 0, exceeded: 0 };
    aspects[key] = { ...t, [rating]: t[rating] + 1 };
  }
  const notes = review.note ? [{ text: review.note, from: from.name, role: from.role, at: review.at }, ...base.notes].slice(0, 5) : base.notes;
  return { aspects, notes };
}

export interface AspectSummary {
  key: AspectKey;
  label: string;
  short: number;
  met: number;
  exceeded: number;
  total: number;
  /** "13 of 14 as agreed or better, 4 beyond" */
  line: string;
}

export function summarizeAspects(rep: Reputation | undefined): AspectSummary[] {
  if (!rep) return [];
  // Role-specific aspects first; the shared one, scope, last.
  const order: AspectKey[] = ['quality', 'timeliness', 'communication', 'brief', 'payment', 'responsiveness', 'scope'];
  return order
    .filter((k) => rep.aspects[k])
    .map((key) => {
      const t = rep.aspects[key]!;
      const total = t.short + t.met + t.exceeded;
      const ok = t.met + t.exceeded;
      const line = `${ok} of ${total} as agreed or better${t.exceeded ? `, ${t.exceeded} beyond` : ''}`;
      return { key, label: aspectLabel(key), ...t, total, line };
    });
}

/** The single most distinctive strength, for compact rows: the aspect most often rated beyond. */
export function strongestAspect(rep: Reputation | undefined): AspectSummary | undefined {
  const best = summarizeAspects(rep)
    .filter((a) => a.total >= 3 && a.exceeded / a.total >= 0.4)
    .sort((a, b) => b.exceeded / b.total - a.exceeded / a.total)[0];
  return best;
}

/**
 * The simulated counterparty's review of the viewer (demo). Deterministic: as
 * agreed throughout, beyond on one aspect, with a short note.
 */
export function simulatedReviewOf(role: ReviewedRole, at: string): Review {
  const ratings: Partial<Record<AspectKey, AspectRating>> = Object.fromEntries(ASPECTS[role].map((a) => [a.key, 'met']));
  if (role === 'seller') ratings.communication = 'exceeded';
  else ratings.payment = 'exceeded';
  const note = role === 'seller' ? 'Clear updates throughout, and the work matched the brief.' : 'Clear brief and confirmed the same day.';
  return toReview({ recommends: true, ratings, note }, at, true);
}
