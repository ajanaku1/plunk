'use client';

import { useEffect, useRef, useState } from 'react';
import { Peek } from '@/components/Peek';
import type { PeekController, PeekState } from '@/lib/peek3d';
import type { BoxState } from '@/lib/launchpad';

function webgl(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const MAP: Record<BoxState, PeekState> = { bidding: 'bidding', reveal: 'reveal', opening: 'opening', open: 'open', failed: 'failed' };

/** The 3D Peek. Loads three.js after first paint; with no WebGL, or if loading fails, the flat Peek stays. `pulse` is any number that changes when a bid lands. */
export function PeekBox({ state, size, pulse }: { state: BoxState; size: number; pulse?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const ctl = useRef<PeekController | null>(null);
  const [ready, setReady] = useState(false);
  const first = useRef(state);
  useEffect(() => {
    let off = false;
    const el = host.current;
    if (!el || !webgl()) return;
    const start = () => {
      void import('@/lib/peek3d')
        .then(({ mountPeek }) => {
          if (off) return;
          ctl.current = mountPeek(el, MAP[first.current]);
          setReady(true);
        })
        .catch(() => undefined);
    };
    const later = setTimeout(start, 250); // after first paint
    return () => {
      off = true;
      clearTimeout(later);
      ctl.current?.dispose();
      ctl.current = null;
    };
  }, []);
  useEffect(() => {
    ctl.current?.setState(MAP[state]);
  }, [state]);
  const seen = useRef(pulse);
  useEffect(() => {
    if (pulse !== undefined && seen.current !== pulse) ctl.current?.bid();
    seen.current = pulse;
  }, [pulse]);
  return (
    <div className="peekbox" style={{ width: size, height: size }} aria-hidden="true">
      <div ref={host} className="peekbox-gl" style={{ opacity: ready ? 1 : 0 }} />
      {!ready && <Peek state={state} size={size * 0.7} />}
    </div>
  );
}
