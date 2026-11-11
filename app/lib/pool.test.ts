import { describe, expect, it } from 'vitest';
import { candlesFrom, pricePerM, quote, swapMsg, withSlippage } from './pool';

const NEAR = 10n ** 24n;
// The SC-001 pool after open: 198 NEAR against 500M coins → 0.396 NEAR per 1M.
const r = { x: 198n * NEAR, y: 500_000_000n * NEAR };

describe('pool math', () => {
  it('prices reserves in NEAR per 1M coins', () => {
    expect(pricePerM(r)).toBeCloseTo(0.396, 6);
    expect(pricePerM({ x: 1n, y: 0n })).toBe(0);
  });

  it('quotes a constant-product swap after the pool fee', () => {
    const out = quote(r, 1n * NEAR, 'buy', 300); // 1 NEAR in, 3% fee
    // net 0.97 NEAR; out = 0.97 × 5e8 / (198 + 0.97) coins ≈ 2.4376M
    expect(Number(out / NEAR)).toBe(2_437_553);
    const back = quote(r, out, 'sell', 300);
    expect(back < NEAR).toBe(true);
    expect(withSlippage(1_000_000n, 100)).toBe(990_000n);
  });

  it('builds the Ref Execute message', () => {
    const m = JSON.parse(swapMsg(4821, 'wrap.testnet', 'frog.plunk.testnet', 5n * NEAR, 1n));
    expect(m.actions[0]).toEqual({ pool_id: 4821, token_in: 'wrap.testnet', amount_in: (5n * NEAR).toString(), token_out: 'frog.plunk.testnet', min_amount_out: '1' });
  });

  it('turns a price series into candles that open at the previous close', () => {
    const c = candlesFrom([
      { time: 3600, price: 0.4 },
      { time: 7200, price: 0.5 },
      { time: 10800, price: 0.45 },
    ]);
    expect(c[0]).toEqual({ time: 3600, open: 0.4, high: 0.4, low: 0.4, close: 0.4 });
    expect(c[1]).toEqual({ time: 7200, open: 0.4, high: 0.5, low: 0.4, close: 0.5 });
    expect(c[2]).toEqual({ time: 10800, open: 0.5, high: 0.5, low: 0.45, close: 0.45 });
  });
});
