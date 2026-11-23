import type { BoxState, LaunchBox } from '@/lib/launchpad';

export const COPY: Record<BoxState, [string, string]> = {
  bidding: ['Bidding is open.', 'Everyone who gets in pays the same clearing price. No price is visible to anyone until the box shuts.'],
  reveal: ['Box shut.', 'Sealed bids are unlocking automatically. Nothing to do on your side.'],
  opening: ['Opening.', 'Clearing, coin, pool and liquidity take a few transactions.'],
  open: ['Open.', 'Cleared at one price. Liquidity is locked forever. Claims are live.'],
  failed: ['Failed.', 'The minimum was not reached. Every bid is refunded in full. No coin, no pool.'],
};

export function openingStep(box: LaunchBox): number {
  const o = box.opening;
  if (!o) return 1;
  if (BigInt(o.shares) > 0n) return 4;
  if (o.pool_id !== null) return 3;
  if (o.coin_ready) return 2;
  return 1;
}
