'use client';

import { useEffect, useState } from 'react';
import { launchpadId } from '@/config';
import { useBoxes } from '@/hooks/useBoxes';
import { useConfig } from '@/hooks/useConfig';
import type { Bid, LaunchBox } from '@/lib/launchpad';
import { type PoolInfo, reservesOf } from '@/lib/pool';
import { activeHoldings, type BidRow, bidRows, type Claimable, type Holding, launchesOf, type Totals, totals } from '@/lib/profile';
import { type ViewParams, useNear } from '@/providers/near-provider';

type View = (p: ViewParams) => Promise<unknown>;
const NONE: Claimable = { near: '0', coin: '0' };

/** Balance, rewards and pool reserves for one opened coin; each call falls back to "nothing" on error. */
async function loadHolding(view: View, box: LaunchBox, account: string, exchange: string | undefined): Promise<Holding> {
  const poolId = box.opening?.pool_id ?? null;
  const [balance, rewards, pool] = await Promise.all([
    view({ contractId: box.coin_id, method: 'ft_balance_of', args: { account_id: account } }).catch(() => '0'),
    view({ contractId: box.coin_id, method: 'get_claimable', args: { account_id: account } }).catch(() => NONE),
    exchange && poolId !== null ? view({ contractId: exchange, method: 'get_pool', args: { pool_id: poolId } }).catch(() => null) : null,
  ]);
  return { box, balance: BigInt(balance as string), rewards: rewards as Claimable, reserves: pool ? reservesOf(pool as PoolInfo) : null };
}

async function loadBids(view: View, boxes: LaunchBox[], account: string): Promise<Map<number, Bid[]>> {
  const lists = await Promise.all(
    boxes.map((b) => view({ contractId: launchpadId, method: 'get_bids', args: { box_id: b.id, account } }).catch(() => []) as Promise<Bid[]>),
  );
  return new Map(boxes.map((b, i) => [b.id, lists[i]]));
}

export type Profile = {
  loaded: boolean;
  error: string;
  nowNs: number;
  launches: LaunchBox[];
  holdings: Holding[];
  bids: BidRow[];
  totals: Totals;
  refresh: () => void;
};

/** Everything the profile page shows for `account`, rebuilt whenever the box list changes or `refresh` is called. */
export function useProfile(account: string): Profile {
  const { view } = useNear();
  const { config } = useConfig();
  const { boxes, error, loaded, nowNs } = useBoxes();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [bidMap, setBidMap] = useState<Map<number, Bid[]>>(new Map());
  const [ready, setReady] = useState(false);
  const [bump, setBump] = useState(0);
  // Only the box list's identity matters here, not the per-second clock.
  const boxKey = boxes.map((b) => `${b.id}:${b.phase}`).join(',');

  useEffect(() => {
    if (!loaded || !account) return;
    let live = true;
    const opened = boxes.filter((b) => b.phase === 'Open');
    Promise.all([Promise.all(opened.map((b) => loadHolding(view, b, account, config?.exchange))), loadBids(view, boxes, account)])
      .then(([h, m]) => {
        if (!live) return;
        setHoldings(activeHoldings(h));
        setBidMap(m);
        setReady(true);
      })
      .catch(() => live && setReady(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, account, loaded, boxKey, config?.exchange, bump]);

  const launches = launchesOf(boxes, account);
  const bids = bidRows(boxes, bidMap, nowNs);
  return { loaded: loaded && (ready || !!error), error, nowNs, launches, holdings, bids, totals: totals(holdings, launches, bids), refresh: () => setBump((n) => n + 1) };
}
