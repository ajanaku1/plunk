'use client';

import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { launchpadId } from '@/config';
import { messageOf } from '@/lib/errors';
import type { LaunchBox } from '@/lib/launchpad';
import { useNear } from '@/providers/near-provider';

const PAGE = 50;
const POLL_MS = 10_000;

export type Boxes = { boxes: LaunchBox[]; error: string; loaded: boolean; nowNs: number };

const BoxesCtx = createContext<Boxes>({ boxes: [], error: '', loaded: false, nowNs: 0 });

/** One list of every box, newest first, shared by the shell tape, the home grid and profiles. Polled every 10 s; `nowNs` ticks once a second. */
export function BoxesProvider({ children }: PropsWithChildren) {
  const { view } = useNear();
  const [s, setS] = useState<Omit<Boxes, 'nowNs'>>({ boxes: [], error: '', loaded: false });
  const [nowNs, setNow] = useState(() => Date.now() * 1e6);
  useEffect(() => {
    const load = async () => {
      try {
        const all: LaunchBox[] = [];
        for (let from = 0; ; from += PAGE) {
          const page = (await view({ contractId: launchpadId, method: 'list_boxes', args: { from, limit: PAGE } })) as LaunchBox[];
          all.push(...page);
          if (page.length < PAGE) break;
        }
        setS({ boxes: all.reverse(), error: '', loaded: true });
      } catch (e) {
        setS((p) => ({ ...p, error: messageOf(e), loaded: true }));
      }
    };
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const tick = setInterval(() => setNow(Date.now() * 1e6), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [view]);
  return <BoxesCtx.Provider value={{ ...s, nowNs }}>{children}</BoxesCtx.Provider>;
}

export function useBoxesContext(): Boxes {
  return useContext(BoxesCtx);
}
