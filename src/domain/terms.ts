/**
 * Negotiable terms beyond price, as predefined structured alternatives. DemandOne
 * doesn't pretend an agent can renegotiate arbitrary professional scopes — each
 * dimension has a few well-understood steps, and each step has a conventional
 * price effect (`TERM_VALUE`). The agent uses those conventions on public prices to
 * suggest trade-offs; a counterparty's private limit never enters that calculation.
 */

import type { DeadlineOption, PaymentOption, PriceUnit, ScopeOption, Terms, VolumeOption } from './types';

export const DEADLINES: DeadlineOption[] = ['listed', 'plus3', 'plus7'];
export const SCOPES: ScopeOption[] = ['full', 'one-revision', 'core'];
export const PAYMENTS: PaymentOption[] = ['on-completion', 'deposit', 'upfront'];
export const VOLUMES: VolumeOption[] = ['single', 'recurring'];

/** Conventional price effect of each step, relative to the listed terms. */
export const TERM_VALUE = {
  deadline: { listed: 1, plus3: 0.94, plus7: 0.9 } as Record<DeadlineOption, number>,
  scope: { full: 1, 'one-revision': 0.92, core: 0.82 } as Record<ScopeOption, number>,
  payment: { 'on-completion': 1, deposit: 0.97, upfront: 0.95 } as Record<PaymentOption, number>,
  volume: { single: 1, recurring: 0.9 } as Record<VolumeOption, number>,
};

export function termMultiplier(t: Omit<Terms, 'price'>): number {
  return TERM_VALUE.deadline[t.deadline] * TERM_VALUE.scope[t.scope] * TERM_VALUE.payment[t.payment] * TERM_VALUE.volume[t.volume];
}

export const LISTED_TERMS: Omit<Terms, 'price'> = { deadline: 'listed', scope: 'full', payment: 'on-completion', volume: 'single' };

export function deadlineLabel(option: DeadlineOption, listedLabel: string): string {
  if (option === 'listed') return listedLabel;
  return `${listedLabel}, ${option === 'plus3' ? '+3 days' : '+1 week'}`;
}

export const SCOPE_LABEL: Record<ScopeOption, string> = {
  full: 'Full scope, 2 revision rounds',
  'one-revision': 'Full scope, 1 revision round',
  core: 'Core deliverable, no revisions',
};

export const PAYMENT_LABEL: Record<PaymentOption, string> = {
  'on-completion': 'On completion',
  deposit: '50% deposit, rest on completion',
  upfront: 'In full, up front',
};

export const VOLUME_LABEL: Record<VolumeOption, string> = {
  single: 'One engagement',
  recurring: '3 monthly engagements',
};

export const UNIT_LABEL: Record<PriceUnit, string> = { fixed: 'fixed fee', hour: 'per hour', sprint: 'per sprint' };
export const UNIT_SHORT: Record<PriceUnit, string> = { fixed: '', hour: '/hr', sprint: '/sprint' };

/** Non-price terms as a comparable key. */
export function termsKey(t: Omit<Terms, 'price'>): string {
  return `${t.deadline}|${t.scope}|${t.payment}|${t.volume}`;
}

export function sameTerms(a: Omit<Terms, 'price'>, b: Omit<Terms, 'price'>): boolean {
  return termsKey(a) === termsKey(b);
}

/** Plain-language list of how `t` differs from `base`, e.g. ["+3 days", "1 revision round"]. */
export function describeChanges(t: Terms, base: Terms): string[] {
  const out: string[] = [];
  if (t.deadline !== base.deadline) out.push(t.deadline === 'listed' ? 'listed delivery' : t.deadline === 'plus3' ? 'delivery +3 days' : 'delivery +1 week');
  if (t.scope !== base.scope) out.push(t.scope === 'full' ? 'full scope' : t.scope === 'one-revision' ? 'one revision round' : 'core deliverable only');
  if (t.payment !== base.payment) out.push(t.payment === 'deposit' ? '50% deposit' : t.payment === 'upfront' ? 'paid up front' : 'paid on completion');
  if (t.volume !== base.volume) out.push(t.volume === 'recurring' ? '3 monthly engagements' : 'one engagement');
  return out;
}

export function roundTo(price: number, step: number, dir: 'up' | 'down' | 'nearest'): number {
  const f = dir === 'up' ? Math.ceil : dir === 'down' ? Math.floor : Math.round;
  return f(price / step) * step;
}

/** Rounding step that suits the magnitude: £1 for hourly rates, £5 under £1k, £50 under £10k, £250 above. */
export function priceStep(price: number): number {
  if (price < 300) return 1;
  if (price < 1000) return 5;
  if (price < 10000) return 50;
  return 250;
}
