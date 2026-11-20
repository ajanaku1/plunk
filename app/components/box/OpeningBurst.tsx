'use client';

import { useEffect, useRef, useState } from 'react';
import type { BoxState, LaunchBox } from '@/lib/launchpad';

/**
 * Plays the coin burst when the box you are watching opens, and gives every open box a Replay button.
 * three.js loads on demand, so a page that never opens a box never downloads it.
 */
export function OpeningBurst({ box, state }: { box: LaunchBox; state: BoxState }) {
  const prev = useRef<BoxState>(state);
  const stopRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  const ticker = box.meta.ticker;
  const image = box.meta.image;

  const play = () => {
    stopRef.current?.();
    setPlaying(true);
    void import('@/lib/ceremony3d')
      .then(({ playOpening }) => {
        stopRef.current = playOpening({ image: image || undefined, ticker, onDone: () => setPlaying(false) });
      })
      .catch(() => setPlaying(false));
  };

  useEffect(() => {
    if (prev.current !== 'open' && state === 'open' && prev.current !== 'failed') play();
    prev.current = state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  useEffect(() => () => stopRef.current?.(), []);

  if (state !== 'open') return null;
  return (
    <button type="button" className="replay" onClick={play} disabled={playing} aria-label="Replay the opening">
      {playing ? 'Opening…' : 'Replay opening'}
    </button>
  );
}
