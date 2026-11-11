'use client';

import Link from 'next/link';
import { Headline, STATE_LABEL } from '@/components/home/BoxCard';
import { Peek } from '@/components/Peek';
import { formatNear, pricePerMillion } from '@/lib/format';
import { type BoxState, type LaunchBox, revealEnd, stateOf } from '@/lib/launchpad';

const RANK: Record<BoxState, number> = { bidding: 0, reveal: 1, opening: 2, open: 3, failed: 9 };

/** The box the home page leads with: the live room closing soonest, else the newest open coin. */
export function featured(boxes: LaunchBox[], nowNs: number): { box: LaunchBox; state: BoxState } | undefined {
  return boxes
    .map((box) => ({ box, state: stateOf(box, nowNs) }))
    .filter((x) => x.state !== 'failed')
    .sort((a, b) => RANK[a.state] - RANK[b.state] || revealEnd(a.box) - revealEnd(b.box))[0];
}

function eyebrow(state: BoxState): string {
  if (state === 'open') return 'Latest open · trading on Rhea';
  return `Live now · ${STATE_LABEL[state].toLowerCase()}`;
}

function cta(state: BoxState, ticker: string): string {
  if (state === 'bidding') return 'Plunk in →';
  if (state === 'open') return `Trade $${ticker} →`;
  return 'Watch it open →';
}

function leadLabel(state: BoxState): string {
  if (state === 'open') return 'Clearing price';
  if (state === 'bidding') return 'Closes in';
  return 'Opens in';
}

function Stats({ box, state, nowNs }: { box: LaunchBox; state: BoxState; nowNs: number }) {
  const cap = state === 'open' && box.opening ? `${(pricePerMillion(box.opening.price) * 1000).toFixed(1)} Ⓝ` : null;
  return (
    <div className="hero-stats">
      <div><small>{leadLabel(state)}</small><Headline box={box} state={state} nowNs={nowNs} /></div>
      <div><small>In the box</small><b>{formatNear(box.total_in, 1)} Ⓝ</b></div>
      <div><small>{cap ? 'Market cap at open' : 'Bidders'}</small><b>{cap ?? box.bidder_count}</b></div>
    </div>
  );
}

export function Hero({ boxes, nowNs, loaded }: { boxes: LaunchBox[]; nowNs: number; loaded: boolean }) {
  const f = featured(boxes, nowNs);
  if (!f) {
    return (
      <section className="hero gutter" data-state="none">
        <div className="in">
          <div className="hero-art"><Peek state="bidding" size={120} /></div>
          <div className="hero-body">
            <span className="eyebrow">{loaded ? 'No box is live' : 'Loading boxes…'}</span>
            <h1>Everyone pays <em>one price.</em></h1>
            <p>Plunk NEAR into a sealed box. It shuts, unlocks, and opens at a single clearing price for every bidder. Liquidity is locked forever.</p>
            <div className="hero-cta"><Link className="cta" href="/make">Make a box</Link><Link className="cta ghost" href="/docs">How it works</Link></div>
          </div>
        </div>
      </section>
    );
  }
  const { box, state } = f;
  const ticker = box.meta.ticker.toUpperCase();
  return (
    <section className="hero gutter" data-state={state}>
      <div className="in">
        <Link href={`/box/${box.id}`} className="hero-art avatar">{box.meta.image ? <img src={box.meta.image} alt="" /> : <Peek state={state} size={120} />}</Link>
        <div className="hero-body">
          <span className="eyebrow"><i />{eyebrow(state)}</span>
          <h1>{box.meta.name} <em>${ticker}</em></h1>
          <p>{box.meta.description || (state === 'open' ? 'Cleared at one price. Liquidity is locked under the launchpad forever.' : 'One clearing price for everyone. No price is shown until the box shuts.')}</p>
          <Stats box={box} state={state} nowNs={nowNs} />
          <div className="hero-cta"><Link className="cta" href={`/box/${box.id}`}>{cta(state, ticker)}</Link><Link className="cta ghost" href="/make">Make a box</Link></div>
        </div>
      </div>
    </section>
  );
}
