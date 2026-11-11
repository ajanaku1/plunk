/** Constant-product helpers for a Rhea simple pool [wNEAR, coin]. Prices are NEAR per 1M coins. */
import { toNumber } from '@/lib/format';

export type Reserves = { x: bigint; y: bigint };
export type PoolInfo = { amounts: [string, string]; shares_total_supply: string; total_fee: number };

const BPS = 10_000n;
const MILLION = 1_000_000n;

export function reservesOf(p: PoolInfo): Reserves {
  return { x: BigInt(p.amounts[0]), y: BigInt(p.amounts[1]) };
}

/** NEAR per 1M coins from reserves (as a number, for charts). */
export function pricePerM(r: Reserves): number {
  if (r.y === 0n) return 0;
  return toNumber((r.x * MILLION * 10n ** 24n) / r.y);
}

/** Output of a swap of `amountIn` of the input side after the pool fee. */
export function quote(r: Reserves, amountIn: bigint, side: 'buy' | 'sell', feeBps: number): bigint {
  const [rin, rout] = side === 'buy' ? [r.x, r.y] : [r.y, r.x];
  const net = (amountIn * (BPS - BigInt(feeBps))) / BPS;
  if (rin + net === 0n) return 0n;
  return (net * rout) / (rin + net);
}

export function withSlippage(out: bigint, slippageBps: number): bigint {
  return (out * (BPS - BigInt(slippageBps))) / BPS;
}

/** Ref's `Execute` message: deposit and swap in one `ft_transfer_call`. */
export function swapMsg(poolId: number, tokenIn: string, tokenOut: string, amountIn: bigint, minOut: bigint): string {
  return JSON.stringify({ actions: [{ pool_id: poolId, token_in: tokenIn, amount_in: amountIn.toString(), token_out: tokenOut, min_amount_out: minOut.toString() }] });
}

export type Candle = { time: number; open: number; high: number; low: number; close: number };

/** Hourly candles from a price series (one point per harvest snapshot). */
export function candlesFrom(points: { time: number; price: number }[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = i === 0 ? points[i].price : points[i - 1].price;
    const p = points[i].price;
    out.push({ time: points[i].time, open: prev, high: Math.max(prev, p), low: Math.min(prev, p), close: p });
  }
  return out;
}
