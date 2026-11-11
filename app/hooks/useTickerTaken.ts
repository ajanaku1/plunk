'use client';

import { useEffect, useState } from 'react';
import { launchpadId } from '@/config';
import { TICKER_RE } from '@/lib/launchpad';
import { useNear } from '@/providers/near-provider';

export type TickerCheck = 'idle' | 'checking' | 'free' | 'taken';

/** Whether `<ticker>.<launchpad>` already exists on chain, debounced while typing. */
export function useTickerTaken(ticker: string): TickerCheck {
  const { balance } = useNear();
  const [check, setCheck] = useState<TickerCheck>('idle');
  useEffect(() => {
    if (!TICKER_RE.test(ticker)) return setCheck('idle');
    let live = true;
    setCheck('checking');
    const t = setTimeout(() => {
      balance(`${ticker}.${launchpadId}`)
        .then(() => live && setCheck('taken'))
        // viewAccount rejects for a missing account: that is the ticker being free.
        .catch(() => live && setCheck('free'));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [ticker, balance]);
  return check;
}
