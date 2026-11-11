'use client';

import { useEffect, useState } from 'react';
import { type PoolInfo, pricePerM, type Reserves, reservesOf } from '@/lib/pool';
import { useNear } from '@/providers/near-provider';

const POLL_MS = 15_000;

export type Tick = { time: number; price: number; reserves: Reserves };
export type ReserveFeed = { reserves: Reserves | null; ticks: Tick[]; feeBps: number };

/** Polls the pool every 15 s while the page is open: the live price tail and the trade feed source (R7 fallback). */
export function useReserves(exchange: string | undefined, poolId: number | null): ReserveFeed {
  const { view } = useNear();
  const [feed, setFeed] = useState<ReserveFeed>({ reserves: null, ticks: [], feeBps: 0 });
  useEffect(() => {
    if (!exchange || poolId === null) return;
    let live = true;
    const poll = async () => {
      try {
        const p = (await view({ contractId: exchange, method: 'get_pool', args: { pool_id: poolId } })) as PoolInfo;
        if (!live) return;
        const reserves = reservesOf(p);
        const tick = { time: Math.floor(Date.now() / 1000), price: pricePerM(reserves), reserves };
        setFeed((f) => {
          const last = f.ticks[f.ticks.length - 1];
          const same = last && last.reserves.x === reserves.x && last.reserves.y === reserves.y;
          return { reserves, feeBps: p.total_fee, ticks: same ? f.ticks : [...f.ticks, tick].slice(-500) };
        });
      } catch {
        // keep the last good reserves; the next poll retries
      }
    };
    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [view, exchange, poolId]);
  return feed;
}
