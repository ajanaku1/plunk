/** Formatting between yocto bigints and what people read. Prices are yocto per whole coin on chain. */

export const YOCTO = 10n ** 24n;
const MILLION = 1_000_000n;

export function toNumber(yocto: bigint | string, decimals = 24): number {
  const v = typeof yocto === 'string' ? BigInt(yocto) : yocto;
  return Number(v / 10n ** BigInt(decimals - 6)) / 1e6;
}

export function fmt(n: number, maxFractionDigits = 2): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits });
}

/** "12.5" NEAR → yocto. Accepts up to 24 decimals; anything beyond is dropped. */
export function parseNear(text: string): bigint | null {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(text.trim());
  if (!m) return null;
  const frac = (m[2] ?? '').slice(0, 24).padEnd(24, '0');
  return BigInt(m[1]) * YOCTO + BigInt(frac);
}

/** NEAR per 1M coins, as typed → yocto per whole coin. 1 NEAR/1M = 1e18 yocto per coin. */
export function parsePricePerMillion(text: string): bigint | null {
  const near = parseNear(text);
  return near === null ? null : near / MILLION;
}

/** yocto per whole coin → NEAR per 1M coins, for display. */
export function pricePerMillion(yoctoPerCoin: bigint | string): number {
  const v = typeof yoctoPerCoin === 'string' ? BigInt(yoctoPerCoin) : yoctoPerCoin;
  return toNumber(v * MILLION);
}

export function formatNear(yocto: bigint | string, digits = 2): string {
  return fmt(toNumber(yocto), digits);
}

/** Whole coins in millions, from smallest units. */
export function formatCoinsM(units: bigint | string): string {
  const v = typeof units === 'string' ? BigInt(units) : units;
  return fmt(toNumber(v / MILLION), 2);
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function nsToDate(ns: number): Date {
  return new Date(ns / 1e6);
}

export function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function shortAccount(id: string, keep = 14): string {
  return id.length <= keep ? id : `${id.slice(0, 6)}…${id.slice(-6)}`;
}
