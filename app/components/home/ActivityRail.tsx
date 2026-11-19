'use client';

import Link from 'next/link';
import { type TapeItem } from '@/hooks/useTape';

/** What the shell tape shows, as a list beside the board: one line per box, with its state or its move since the clearing price. */
export function ActivityRail({ items }: { items: TapeItem[] }) {
  return (
    <div className="card pad bd-feed">
      <h2>On the tape</h2>
      <p className="d">Live rooms and the move of every open coin since its clearing price.</p>
      {items.length === 0 ? <p className="d">Nothing yet.</p> : (
        <ul>
          {items.slice(0, 8).map((it) => (
            <li key={it.id}><Link href={`/box/${it.id}`}><b>${it.ticker}</b><span data-tone={it.tone}>{it.text}</span></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
