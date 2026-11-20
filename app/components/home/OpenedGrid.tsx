'use client';

import Link from 'next/link';
import { Coin } from '@/components/board/Coin';
import { Tiles } from '@/components/board/Flap';
import { ageLabel, changeVsClose } from '@/lib/board';
import { formatNear, pricePerMillion } from '@/lib/format';
import type { LaunchBox } from '@/lib/launchpad';

/** The coins that opened most recently, art first, each measured against its own clearing price. */
export function OpenedGrid({ boxes, nowNs, spots }: { boxes: LaunchBox[]; nowNs: number; spots: Record<number, number> }) {
  const open = boxes.filter((b) => b.phase === 'Open' && b.opening).sort((a, b) => b.open_at - a.open_at).slice(0, 4);
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
                <div className="pr"><Tiles text={(spot || clearing).toFixed(4)} /><span className="mono">Close {clearing.toFixed(4)}</span></div>
                <div className="mono meta">Opened {ageLabel(b.open_at, nowNs)} ago · {formatNear(b.opening?.accepted_total ?? '0', 1)} Ⓝ raised</div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
