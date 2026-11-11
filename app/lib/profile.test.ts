import { describe, expect, it } from 'vitest';
import type { Bid, LaunchBox } from './launchpad';
import { activeHoldings, bidRows, holdingValue, launchesOf, supplyBps, totals } from './profile';

const NEAR = 10n ** 24n;
const r = { x: 198n * NEAR, y: 500_000_000n * NEAR };

function box(id: number, dev: string, phase: LaunchBox['phase']): LaunchBox {
  return { id, dev, phase, close_at: 0, sealed_count: 0, meta: { name: '', ticker: 't', image: '', description: '' } } as unknown as LaunchBox;
}

function bid(over: Partial<Bid>): Bid {
  return { id: 1, bidder: 'a', recipient: 'a', budget: '0', kind: 'Market', tokens: '0', refund: '0', coins_paid: false, refund_paid: false, ...over };
}

describe('profile math', () => {
  it('values a holding at the pool spot price', () => {
    // 1M coins at 0.396 NEAR per 1M
    expect(Number(holdingValue(1_000_000n * NEAR, r)) / 1e24).toBeCloseTo(0.396, 6);
    expect(holdingValue(5n * NEAR, null)).toBe(0n);
    expect(holdingValue(5n * NEAR, { x: 1n, y: 0n })).toBe(0n);
  });

  it('reports supply share in bps', () => {
    expect(supplyBps(10_000_000n * NEAR)).toBe(100);
  });

  it('separates launches, live holdings and pending claims', () => {
    const boxes = [box(0, 'dev.testnet', 'Open'), box(1, 'other.testnet', 'Failed')];
    expect(launchesOf(boxes, 'dev.testnet').map((b) => b.id)).toEqual([0]);
    const holdings = [
      { box: boxes[0], balance: 0n, reserves: r, rewards: { near: '0', coin: '0' } },
      { box: boxes[0], balance: 1n, reserves: r, rewards: { near: '7', coin: '0' } },
    ];
    expect(activeHoldings(holdings)).toHaveLength(1);
    const bids = new Map([[1, [bid({ budget: '5' })]], [0, [bid({ tokens: '3', coins_paid: true })]]]);
    const rows = bidRows(boxes, bids, 1);
    expect(rows.map((x) => x.pending)).toEqual([false, true]);
    const t = totals(holdings, launchesOf(boxes, 'dev.testnet'), rows);
    expect(t).toEqual({ portfolio: 0n, rewardsNear: 7n, coinsHeld: 1, launched: 1, pendingClaims: 1 });
  });
});
