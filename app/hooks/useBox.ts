'use client';

import { useCallback, useEffect, useState } from 'react';
import { launchpadId } from '@/config';
import { messageOf } from '@/lib/errors';
import type { Bid, LaunchBox } from '@/lib/launchpad';
import { useNear } from '@/providers/near-provider';

const POLL_MS = 4000;

export type BoxData = {
  /** undefined while loading, null when no such box */
  box: LaunchBox | null | undefined;
  bids: Bid[];
  nowNs: number;
  error: string;
  refresh: () => Promise<void>;
};

/** Polls the box and the connected account's bids; ticks a wall clock in block-time units. */
export function useBox(id: number): BoxData {
  const { view, accountId } = useNear();
  const [box, setBox] = useState<LaunchBox | null | undefined>(undefined);
  const [bids, setBids] = useState<Bid[]>([]);
  const [error, setError] = useState('');
  const [nowNs, setNowNs] = useState(() => Date.now() * 1e6);

  const refresh = useCallback(async () => {
    try {
      const b = (await view({ contractId: launchpadId, method: 'get_box', args: { id } })) as LaunchBox | null;
      setBox(b);
      if (b && accountId) {
        setBids((await view({ contractId: launchpadId, method: 'get_bids', args: { box_id: id, account: accountId } })) as Bid[]);
      } else {
        setBids([]);
      }
      setError('');
    } catch (e) {
      setError(messageOf(e));
    }
  }, [view, id, accountId]);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), POLL_MS);
    const tick = setInterval(() => setNowNs(Date.now() * 1e6), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  return { box, bids, nowNs, error, refresh };
}
