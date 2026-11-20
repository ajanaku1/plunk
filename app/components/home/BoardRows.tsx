'use client';

import Link from 'next/link';
import { Coin } from '@/components/board/Coin';
import { SealedPrice, Tiles } from '@/components/board/Flap';
import { openingStep } from '@/components/box/Banner';
import { STATE_LABEL } from '@/components/home/BoxCard';
import { ageLabel, changeVsClose } from '@/lib/board';
import { clock, pricePerMillion } from '@/lib/format';
import { type BoxState, type LaunchBox, revealEnd, stateOf } from '@/lib/launchpad';

function timeText(box: LaunchBox, state: BoxState, nowNs: number): string {
  if (state === 'bidding') return clock((box.close_at - nowNs) / 1e9);
  if (state === 'reveal') return clock((revealEnd(box) - nowNs) / 1e9);
  if (state === 'opening') return `${openingStep(box)}/4`;
  if (state === 'open') return ageLabel(box.open_at, nowNs);
  return 'SHUT';
}

function PriceCell({ box, state, spot }: { box: LaunchBox; state: BoxState; spot: number | undefined }) {
  if (state === 'open' && box.opening) {
    const clearing = pricePerMillion(box.opening.price);
    const move = changeVsClose(clearing, spot);
    return (
      <>
        {move && <span className="bd-chg" data-tone={move.tone}>{move.label}</span>}
        <Tiles text={(spot || clearing).toFixed(4)} />
      </>
    );
  }
  if (state === 'failed') return <span className="bd-none">refunded</span>;
  return <SealedPrice />;
}

/** Every box as a row of the board: coin, state, a flip clock, bidders, and a price that is sealed until the box opens. */
export function BoardRows({ boxes, nowNs, spots }: { boxes: LaunchBox[]; nowNs: number; spots: Record<number, number> }) {
  return (
    <div className="bd-rows">
      <div className="bd-head" aria-hidden="true"><span>Coin</span><span>Time</span><span>Bidders</span><span>Price</span></div>
      {boxes.map((b) => {
        const state = stateOf(b, nowNs);
        const ticker = b.meta.ticker.toUpperCase();
        return (
          <Link key={b.id} href={`/box/${b.id}`} className="bd-row" data-state={state}>
            <span className="bd-coin">
              <Coin image={b.meta.image} ticker={ticker} size={52} square />
              <span className="bd-name"><b>{b.meta.name} <small>${ticker}</small></b><small className="mono">dev {b.dev}</small><span className="chip status" data-state={state}>{STATE_LABEL[state]}</span></span>
            </span>
            <span className="bd-t1"><Tiles text={timeText(b, state, nowNs)} /></span>
            <span className="bd-t2"><Tiles text={String(b.bidder_count)} /></span>
            <span className="bd-px"><PriceCell box={b} state={state} spot={spots[b.id]} /></span>
          </Link>
        );
      })}
    </div>
  );
}
