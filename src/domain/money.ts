/**
 * The one money formatter. Whole dollars everywhere in the UI (`$1,240`), with
 * thousands separators; prices in the mock market are whole dollars.
 */
const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function formatMoney(amount: number): string {
  return formatter.format(Math.round(amount));
}
