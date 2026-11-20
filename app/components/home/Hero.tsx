'use client';

import Link from 'next/link';
import { Coin } from '@/components/board/Coin';
import { SealedPrice, Tiles } from '@/components/board/Flap';
import { PeekBox } from '@/components/board/PeekBox';
import { openingStep } from '@/components/box/Banner';
import { STATE_LABEL } from '@/components/home/BoxCard';
import { Peek } from '@/components/Peek';
import { meterSegments, priceText } from '@/lib/board';
import { clock, formatNear, pricePerMillion, toNumber } from '@/lib/format';
import { type BoxState, type LaunchBox, revealEnd, stateOf } from '@/lib/launchpad';

const RANK: Record<BoxState, number> = { bidding: 0, reveal: 1, opening: 2, open: 3, failed: 9 };

/** The box the home page leads with: the live room closing soonest, else the newest open coin. */
export function featured(boxes: LaunchBox[], nowNs: number): { box: LaunchBox; state: BoxState } | undefined {
  return boxes
    .map((box) => ({ box, state: stateOf(box, nowNs) }))
    .filter((x) => x.state !== 'failed')
    .sort((a, b) => RANK[a.state] - RANK[b.state] || revealEnd(a.box) - revealEnd(b.box))[0];
}

function cta(state: BoxState, ticker: string): string {
  if (state === 'bidding') return 'Plunk in →';
  if (state === 'open') return `Trade $${ticker} →`;
  return 'Watch it open →';
}

function clockText(box: LaunchBox, state: BoxState, nowNs: number): string {
  if (state === 'bidding') return clock((box.close_at - nowNs) / 1e9);
  if (state === 'reveal') return clock((revealEnd(box) - nowNs) / 1e9);
  if (state === 'opening') return `${openingStep(box)}/4`;
  return box.opening ? priceText(pricePerMillion(box.opening.price)) : '0.0000';
}

function caption(state: BoxState): string {
  if (state === 'bidding') return 'Closes in';
  if (state === 'reveal') return 'Prices unlock in';
  if (state === 'opening') return 'Opening, step';
  return 'NEAR per 1M. Everyone paid this.';
}

function Meter({ box }: { box: LaunchBox }) {
  const total = toNumber(box.total_in);
  const min = toNumber(box.min_raise);
  const { lit, marker } = meterSegments(total, min);
  return (
    <div className="bd-meter" role="img" aria-label={`${formatNear(box.total_in, 1)} NEAR raised, ${formatNear(box.min_raise, 1)} minimum`}>
      {Array.from({ length: 22 }, (_, i) => <i key={i} className={`${i < lit ? 'on' : ''}${i === marker ? ' min' : ''}`} />)}
      <span><b>{formatNear(box.total_in, 1)}</b> Ⓝ raised · {formatNear(box.min_raise, 1)} minimum</span>
    </div>
  );
}

export function Hero({ boxes, nowNs, loaded }: { boxes: LaunchBox[]; nowNs: number; loaded: boolean }) {
  const f = featured(boxes, nowNs);
  if (!f) {
    return (
      <section className="bd-hero gutter" data-state="none">
        <div className="in">
          <div className="bd-panel">
            <div className="bd-peek"><Peek state="bidding" size={120} /></div>
            <div className="bd-left">
              <span className="eyebrow">{loaded ? 'No box is live' : 'Loading boxes…'}</span>
              <h1>Everyone pays <em>one price.</em></h1>
              <p>Plunk NEAR into a sealed box. It shuts, unlocks, and opens at a single clearing price for every bidder. Liquidity is locked forever.</p>
            </div>
            <div className="bd-cta"><Link className="cta" href="/make">Make a box</Link><Link className="cta ghost" href="/docs">How it works</Link></div>
          </div>
        </div>
      </section>
    );
  }
  const { box, state } = f;
  const ticker = box.meta.ticker.toUpperCase();
  const sealed = state === 'bidding' || state === 'reveal' || state === 'opening';
  return (
    <section className="bd-hero gutter" data-state={state}>
      <div className="in">
        <div className="bd-panel">
          <div className="bd-peek"><PeekBox state={state} size={190} pulse={box.bid_count} /></div>
          <div className="bd-left">
            <div className="bd-who">
              <Link href={`/box/${box.id}`} aria-label={`${box.meta.name} box`}><Coin image={box.meta.image} ticker={ticker} size={104} square /></Link>
              <div>
                <h1>{box.meta.name}<small>${ticker}</small></h1>
                <p>{box.meta.description || (state === 'open' ? 'Cleared at one price. Liquidity is locked under the launchpad forever.' : 'Everyone pays one price. Nobody can see it until the lid lifts.')}</p>
              </div>
            </div>
            {sealed && <div className="bd-sealed"><span>The price, sealed</span><SealedPrice /></div>}
            {sealed && <Meter box={box} />}
          </div>
          <div className="bd-clock" role={state === 'bidding' || state === 'reveal' ? 'timer' : undefined}>
            <Tiles text={clockText(box, state, nowNs)} />
            <small>{caption(state)}</small>
          </div>
          <div className="bd-cta">
            <Link className="cta" href={`/box/${box.id}`}>{cta(state, ticker)}</Link>
            <Link className="cta ghost" href="/make">Make a box</Link>
            <span className="meta"><span className="chip status" data-state={state}>{STATE_LABEL[state]}</span> {box.bidder_count} {box.bidder_count === 1 ? 'bidder' : 'bidders'} · {formatNear(box.total_in, 1)} Ⓝ in the box · dev {box.dev}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
