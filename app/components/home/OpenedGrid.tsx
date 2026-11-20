'use client';

import Link from 'next/link';
import { Coin } from '@/components/board/Coin';
import { Tiles } from '@/components/board/Flap';
import { ageLabel, changeVsClose, priceText } from '@/lib/board';
import { formatNear, pricePerMillion } from '@/lib/format';
import type { LaunchBox } from '@/lib/launchpad';

/** The (up to four) coins that opened most recently. */
export function justOpened(boxes: LaunchBox[]): LaunchBox[] {
  return boxes.filter((b) => b.phase === 'Open' && b.opening).sort((a, b) => b.open_at - a.open_at).slice(0, 4);
}

/** `open` (from `justOpened`) art first, each measured against its own clearing price. `boxes` is only for the total. */
export function OpenedGrid({ boxes, open, nowNs, spots }: { boxes: LaunchBox[]; open: LaunchBox[]; nowNs: number; spots: Record<number, number> }) {
  if (open.length === 0) return null;
  return (
    <section aria-label="Just opened">
      <div className="bd-sec"><h2>Just opened</h2><span className="mono">{open.length} of {boxes.filter((b) => b.phase === 'Open').length}</span></div>
      <div className="bd-opened">
        {open.map((b) => {
          const clearing = pricePerMillion(b.opening?.price ?? '0');
          const spot = spots[b.id];
          const move = changeVsClose(clearing, spot);
          const ticker = b.meta.ticker.toUpperCase();
          return (
            <Link key={b.id} href={`/box/${b.id}`} className="bd-card">
              <div className="bd-art">
                <Coin image={b.meta.image} ticker={ticker} size="fill" square />
                {move && <span className="pill" data-tone={move.tone}>{move.label} vs Close</span>}
              </div>
              <div className="bd-card-body">
                <div className="nm"><b>{b.meta.name}</b><span className="mono">${ticker}</span></div>
                <div className="pr"><Tiles text={priceText(spot || clearing)} /><span className="mono">Close {priceText(clearing)}</span></div>
                <div className="mono meta">Opened {ageLabel(b.open_at, nowNs)} ago · {formatNear(b.opening?.accepted_total ?? '0', 1)} Ⓝ raised</div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
