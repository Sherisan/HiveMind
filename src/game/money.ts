const SYMBOLS: Record<string, string> = {
  ZAR: 'R',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export function currencySymbol(currency = 'ZAR'): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

export function formatMoney(amount: number, currency = 'ZAR'): string {
  const symbol = currencySymbol(currency);
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A chance as a percentage. Only a certainty reads 100% or 0%: 99.97% shows as 99.9%, 0.03% as 0.1%. */
export function formatPercent(p: number): string {
  if (p >= 1) return '100%';
  if (p <= 0) return '0%';
  const pct = p * 100;
  if (pct >= 99.5 || pct < 10) return `${Math.min(99.9, Math.max(0.1, Math.round(pct * 10) / 10)).toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}
