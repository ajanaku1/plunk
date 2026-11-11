'use client';

import { pct } from '@/lib/fees';
import { fmt, formatNear, pricePerMillion } from '@/lib/format';
import type { LaunchBox } from '@/lib/launchpad';
import { pricePerM, type Reserves } from '@/lib/pool';

const SUPPLY_M = 1000; // 1B coins = 1000 × 1M

/** Market cap, locked liquidity, move since the clearing price and the pool fee: the row every launchpad shows under the name. */
export function MarketRow({ box, reserves, feeBps }: { box: LaunchBox; reserves: Reserves | null; feeBps: number }) {
  const spot = reserves ? pricePerM(reserves) : 0;
  const clearing = box.opening ? pricePerMillion(box.opening.price) : 0;
  const move = spot && clearing ? ((spot - clearing) / clearing) * 100 : null;
  const tone = move === null ? undefined : move >= 0 ? 'var(--ok)' : 'var(--bad)';
  return (
    <div className="market" aria-label="Market">
      <div><small>Market cap</small><b>{reserves ? `${fmt(spot * SUPPLY_M, 1)} Ⓝ` : '…'}</b></div>
      <div><small>Liquidity · locked</small><b>{reserves ? `${formatNear(reserves.x * 2n, 1)} Ⓝ` : '…'}</b></div>
      <div><small>Since open</small><b style={{ color: tone }}>{move === null ? '…' : `${move >= 0 ? '+' : ''}${fmt(move, 1)}%`}</b></div>
      <div><small>Pool fee</small><b>{feeBps ? pct(feeBps) : pct(box.fee_bps)}</b></div>
    </div>
  );
}
