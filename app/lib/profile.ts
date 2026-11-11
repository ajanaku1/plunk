/** Pure helpers behind the profile page: what an account launched, holds, bid on and can claim. */
import { type Bid, type BoxState, claimable, type LaunchBox, stateOf } from '@/lib/launchpad';
import type { Reserves } from '@/lib/pool';

export type Claimable = { near: string; coin: string };

/** One opened coin as seen from an account: wallet balance, pool reserves for pricing, pending rewards. */
export type Holding = {
  box: LaunchBox;
  balance: bigint;
  reserves: Reserves | null;
  rewards: Claimable;
};

export type BidRow = { box: LaunchBox; bid: Bid; state: BoxState; pending: boolean };

/** NEAR value of `balance` coins at the pool's spot price (yocto). Zero when there is no pool yet. */
export function holdingValue(balance: bigint, reserves: Reserves | null): bigint {
  if (!reserves || reserves.y === 0n) return 0n;
  return (balance * reserves.x) / reserves.y;
}

/** Share of the 1B supply an account holds, in basis points. */
export function supplyBps(balance: bigint): number {
  const supply = 1_000_000_000n * 10n ** 24n;
  return Number((balance * 10_000n) / supply);
}

export function launchesOf(boxes: LaunchBox[], account: string): LaunchBox[] {
  return boxes.filter((b) => b.dev === account);
}

/** Holdings worth showing: a balance or something to claim. */
export function activeHoldings(all: Holding[]): Holding[] {
  return all.filter((h) => h.balance > 0n || BigInt(h.rewards.near) > 0n || BigInt(h.rewards.coin) > 0n);
}

export function bidRows(boxes: LaunchBox[], bidsByBox: Map<number, Bid[]>, nowNs: number): BidRow[] {
  const rows: BidRow[] = [];
  for (const box of boxes) {
    const state = stateOf(box, nowNs);
    for (const bid of bidsByBox.get(box.id) ?? []) rows.push({ box, bid, state, pending: claimable(bid, state) });
  }
  return rows;
}

export type Totals = { portfolio: bigint; rewardsNear: bigint; coinsHeld: number; launched: number; pendingClaims: number };

export function totals(holdings: Holding[], launches: LaunchBox[], bids: BidRow[]): Totals {
  let portfolio = 0n;
  let rewardsNear = 0n;
  for (const h of holdings) {
    portfolio += holdingValue(h.balance, h.reserves);
    rewardsNear += BigInt(h.rewards.near);
  }
  return {
    portfolio,
    rewardsNear,
    coinsHeld: holdings.filter((h) => h.balance > 0n).length,
    launched: launches.length,
    pendingClaims: bids.filter((b) => b.pending).length,
  };
}
