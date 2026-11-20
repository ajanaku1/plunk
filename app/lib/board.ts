/** Small pure helpers for the Board look (flip tiles, raise meter, coin stacks). Kept free of React so they can be tested. */

/** Short age for a flip tile: "5M", "3H", "2D". `fromNs` and `nowNs` are block-time nanoseconds. */
export function ageLabel(fromNs: number, nowNs: number): string {
  const s = Math.max(0, Math.floor((nowNs - fromNs) / 1e9));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}M`;
  if (s < 86_400) return `${Math.floor(s / 3600)}H`;
  return `${Math.floor(s / 86_400)}D`;
}

/** How many of `n` segments are lit for `total` raised, and where the minimum marker sits. The scale leaves headroom above both numbers. */
export function meterSegments(total: number, min: number, n = 22): { lit: number; marker: number } {
  const scale = Math.max(min * 1.5, total * 1.1, 1e-9);
  return { lit: Math.min(n, Math.round((total / scale) * n)), marker: Math.min(n - 1, Math.round((min / scale) * n)) };
}

/** Move from the clearing price to the spot price, as a signed percent and a tone for colour. Null when either price is missing. */
export function changeVsClose(clearing: number, spot: number | undefined): { pct: number; label: string; tone: 'up' | 'down' | 'flat' } | null {
  if (!spot || !clearing) return null;
  const pct = ((spot - clearing) / clearing) * 100;
  const rounded = Math.abs(pct) < 0.05 ? 0 : pct;
  return { pct: rounded, label: `${rounded >= 0 ? '+' : ''}${rounded.toFixed(rounded === 0 ? 0 : 1)}%`, tone: rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat' };
}

/** Number of discs in a holding's stack, 1 to 6, from the share of supply it represents (0 to 1). */
export function stackCount(share: number): number {
  if (!(share > 0)) return 1;
  return Math.max(1, Math.min(6, Math.ceil(share * 20)));
}

/** A stable colour for a coin that has no picture, from its ticker. The tile shows the ticker's first two letters. */
export function tickerHue(ticker: string): number {
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** A price per 1M coins as text: 4 decimals, or two significant digits when that would read as zero. */
export function priceText(n: number): string {
  if (!(n > 0) || n >= 0.0001) return (n > 0 ? n : 0).toFixed(4);
  return n.toFixed(Math.min(20, Math.ceil(-Math.log10(n)) + 1));
}
