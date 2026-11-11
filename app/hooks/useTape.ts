'use client';

import { useEffect, useState } from 'react';
import { useBoxes } from '@/hooks/useBoxes';
import { useConfig } from '@/hooks/useConfig';
import { clock, pricePerMillion } from '@/lib/format';
import { type BoxState, type LaunchBox, revealEnd, stateOf } from '@/lib/launchpad';
import { type PoolInfo, pricePerM, reservesOf } from '@/lib/pool';
import { useNear } from '@/providers/near-provider';

const MAX_ITEMS = 12;
const SPOT_POLL_MS = 15_000;

export type TapeItem = { id: number; ticker: string; state: BoxState; text: string; tone: 'up' | 'down' | 'live' | 'muted' };

function liveText(box: LaunchBox, state: BoxState, nowNs: number): string {
  if (state === 'bidding') return `bidding · ${clock((box.close_at - nowNs) / 1e9)}`;
  if (state === 'reveal') return `revealing · ${clock((revealEnd(box) - nowNs) / 1e9)}`;
  if (state === 'opening') return 'opening';
  return 'failed';
}

function openItem(box: LaunchBox, spot: number | undefined): TapeItem {
  const ticker = box.meta.ticker.toUpperCase();
  const clearing = box.opening ? pricePerMillion(box.opening.price) : 0;
  if (!spot || !clearing) return { id: box.id, ticker, state: 'open', text: `${clearing.toFixed(4)} Ⓝ`, tone: 'muted' };
  const move = ((spot - clearing) / clearing) * 100;
  const sign = move >= 0 ? '+' : '';
  return { id: box.id, ticker, state: 'open', text: `${spot.toFixed(4)} Ⓝ ${sign}${move.toFixed(1)}%`, tone: move >= 0 ? 'up' : 'down' };
}

/** Spot price per 1M coins for each open box, polled every 15 s. */
function useSpots(open: LaunchBox[], exchange: string | undefined): Record<number, number> {
  const { view } = useNear();
  const [spots, setSpots] = useState<Record<number, number>>({});
  const key = open.map((b) => `${b.id}:${b.opening?.pool_id ?? ''}`).join(',');
  useEffect(() => {
    if (!exchange || !key) return;
    let live = true;
    const poll = async () => {
      const pairs = await Promise.all(
        open.map(async (b) => {
          try {
            const p = (await view({ contractId: exchange, method: 'get_pool', args: { pool_id: b.opening?.pool_id } })) as PoolInfo;
            return [b.id, pricePerM(reservesOf(p))] as const;
          } catch {
            return [b.id, 0] as const;
          }
        }),
      );
      if (live) setSpots(Object.fromEntries(pairs));
    };
    void poll();
    const t = setInterval(() => void poll(), SPOT_POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
    // `key` stands in for `open`, which is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, exchange, key]);
  return spots;
}

/** The ticker tape across the top of every page: live rooms with their countdown, open coins with spot and move since the clearing price. */
export function useTape(): TapeItem[] {
  const { boxes, nowNs } = useBoxes();
  const { config } = useConfig();
  const recent = boxes.slice(0, MAX_ITEMS);
  const open = recent.filter((b) => b.phase === 'Open' && b.opening?.pool_id !== undefined);
  const spots = useSpots(open, config?.exchange);
  return recent.map((b) => {
    const state = stateOf(b, nowNs);
    if (state === 'open') return openItem(b, spots[b.id]);
    const tone = state === 'failed' ? 'muted' : 'live';
    return { id: b.id, ticker: b.meta.ticker.toUpperCase(), state, text: liveText(b, state, nowNs), tone };
  });
}
