/** Formatting shared by the paper scorecard and strategy spec panels. */

/** Whole dollars with a sign: "+$1,514", "−$78". */
export function signedMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const rounded = Math.round(value);
  return `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}$${Math.abs(rounded).toLocaleString('en-US')}`;
}

export function netTone(value: number | null | undefined): string {
  return value === null || value === undefined || Math.round(value) === 0 ? 'flat' : value < 0 ? 'loss' : 'gain';
}
