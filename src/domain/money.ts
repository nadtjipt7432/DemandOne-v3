/**
 * The one money formatter: whole pounds with thousands separators (`£5,600`).
 * Every price on screen goes through here, so currency is a one-line change.
 */
const formatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

export const CURRENCY_SYMBOL = '£';

export function formatMoney(amount: number): string {
  return formatter.format(Math.round(amount));
}

/** Parses "£5,200", "5200", "5.2k" → 5200. Undefined when there's no number. */
export function parseMoney(text: string): number | undefined {
  const m = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k|thousand)?/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}
