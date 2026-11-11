/**
 * Mirror of the launchpad's pure math, so the app can preview exactly what the contract will do.
 * Clearing mirrors `contracts/launchpad/src/clearing.rs` (FR-008); the dev tax mirrors
 * data-model.md (FR-023). All amounts are bigint in smallest units; prices are yocto per whole coin.
 * Shared fixtures: `contracts/fixtures/*.json`, checked by both the Rust and the vitest suites.
 */

export const TOKENS_FOR_BIDDERS = 500_000_000n;
export const ONE_COIN = 10n ** 24n;
export const MAX_BIDS = 200;
export const MAX_TAX_BPS = 9_000n;
const BPS = 10_000n;

export type BidIn = { id: number; budget: bigint; maxPrice: bigint | null };
export type Fill = { id: number; paid: bigint; tokens: bigint; refund: bigint };
export type Clearing = { price: bigint; acceptedTotal: bigint; fills: Fill[] };

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/** Sealed bid indexes grouped by equal max price, highest price first. */
function sealedGroups(bids: BidIn[]): number[][] {
  const sealed = bids.flatMap((b, i) => (b.maxPrice === null ? [] : [i]));
  sealed.sort((a, b) => {
    const pa = bids[a].maxPrice as bigint;
    const pb = bids[b].maxPrice as bigint;
    return pa === pb ? 0 : pa > pb ? -1 : 1;
  });
  const groups: number[][] = [];
  for (const i of sealed) {
    const last = groups[groups.length - 1];
    if (last && bids[last[0]].maxPrice === bids[i].maxPrice) last.push(i);
    else groups.push([i]);
  }
  return groups;
}

/**
 * Market bids are always accepted. Sealed bids are then taken in groups of equal max price,
 * highest first. A group that would push the price above its max is filled pro-rata up to
 * exactly that price, and clearing stops there.
 */
export function clear(bids: BidIn[]): Clearing {
  if (bids.length > MAX_BIDS) throw new Error('too many bids');
  const paid = bids.map((b) => (b.maxPrice === null ? b.budget : 0n));
  let acc = paid.reduce((s, p) => s + p, 0n);
  for (const group of sealedGroups(bids)) {
    const cap = (bids[group[0]].maxPrice as bigint) * TOKENS_FOR_BIDDERS;
    const groupSum = group.reduce((s, i) => s + bids[i].budget, 0n);
    if (groupSum === 0n) continue;
    const room = cap > acc ? cap - acc : 0n;
    const target = acc + groupSum <= cap ? groupSum : room;
    for (const i of group) {
      paid[i] = (bids[i].budget * target) / groupSum;
      acc += paid[i];
    }
    if (target < groupSum) break;
  }
  return settle(bids, paid, acc);
}

/** Price rounds up so it never understates; tokens round down so the box never oversells. */
function settle(bids: BidIn[], paid: bigint[], acceptedTotal: bigint): Clearing {
  const price = ceilDiv(acceptedTotal, TOKENS_FOR_BIDDERS);
  const fills = bids.map((b, i) => ({
    id: b.id,
    paid: paid[i],
    tokens: paid[i] === 0n ? 0n : (paid[i] * ONE_COIN) / price,
    refund: b.budget - paid[i],
  }));
  return { price, acceptedTotal, fills };
}

export type TaxWindow = { start: bigint; end: bigint };
export type Withdrawal = { toHolders: bigint; toDev: bigint; rateBps: bigint };

function remaining(now: bigint, w: TaxWindow): bigint {
  return now >= w.end ? 0n : w.end - now;
}

/** The tax rate shown to users: 90% falling linearly to 0 over the window, floored to whole bps. */
export function taxRateBps(now: bigint, w: TaxWindow): bigint {
  const length = w.end - w.start;
  if (length <= 0n) throw new Error('empty tax window');
  return (MAX_TAX_BPS * remaining(now, w)) / length;
}

/** A dev withdrawal of `amount`: holders get amount × tax, rounded up in their favour (FR-023). */
export function devWithdraw(amount: bigint, now: bigint, w: TaxWindow): Withdrawal {
  const rateBps = taxRateBps(now, w);
  const toHolders = ceilDiv(amount * MAX_TAX_BPS * remaining(now, w), BPS * (w.end - w.start));
  return { toHolders, toDev: amount - toHolders, rateBps };
}
