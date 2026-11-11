'use client';

import Link from 'next/link';
import { type TapeItem, useTape } from '@/hooks/useTape';

const MIN_ITEMS = 6;

function Item({ it }: { it: TapeItem }) {
  return (
    <Link href={`/box/${it.id}`} className="tape-item" data-tone={it.tone}>
      <span className="tk">${it.ticker}</span>
      <span className="tx">{it.text}</span>
    </Link>
  );
}

/** A slow marquee of every recent box. Two copies make the loop seamless; it pauses on hover and stops under reduced motion. */
export function Tape() {
  const items = useTape();
  if (items.length === 0) {
    return <div className="tape" aria-hidden="true"><span className="tape-empty">No boxes yet · the first one is yours</span></div>;
  }
  const reps = Math.ceil(MIN_ITEMS / items.length);
  const half = Array.from({ length: reps }, () => items).flat();
  return (
    <div className="tape" aria-label="Recent boxes">
      <div className="tape-track" style={{ animationDuration: `${half.length * 4}s` }}>
        {half.map((it, i) => <Item key={`a${i}`} it={it} />)}
        {half.map((it, i) => <Item key={`b${i}`} it={it} />)}
      </div>
    </div>
  );
}
