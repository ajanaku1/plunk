'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Coin } from '@/components/board/Coin';
import { SealedPrice, Tiles } from '@/components/board/Flap';
import { explorerAccount } from '@/config';
import { pct } from '@/lib/fees';
import { priceText } from '@/lib/board';
import { clock, formatNear, nsToDate, pricePerMillion } from '@/lib/format';
import type { BoxState, LaunchBox } from '@/lib/launchpad';
import { useToast } from '@/providers/toast';

type IdentityProps = { box: LaunchBox; state: BoxState; nowNs: number };

const STATE_LABEL: Record<BoxState, string> = { bidding: 'Bidding', reveal: 'Reveal', opening: 'Opening', open: 'Open', failed: 'Failed' };

function CopyChip({ value, label }: { value: string; label?: string }) {
  const { notify } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => notify(value));
  };
  return (
    <span className="chip" data-copied={copied || undefined}>
      <button type="button" onClick={copy} title="Copy" style={{ all: 'unset', cursor: 'pointer' }}>{copied ? 'Copied ✓' : label ?? value}</button>
      <a href={explorerAccount(value)} target="_blank" rel="noreferrer" title="View on explorer" aria-label={`${value} on explorer`}>↗</a>
    </span>
  );
}

function Headline({ box, state }: { box: LaunchBox; state: BoxState }) {
  if (state === 'open' && box.opening) {
    return (
      <>
        <div className="n"><Tiles text={priceText(pricePerMillion(box.opening.price))} /></div>
        <div className="d up">per 1M ${box.meta.ticker.toUpperCase()} · the one price</div>
      </>
    );
  }
  if (state === 'failed') {
    return (
      <>
        <div className="n">{formatNear(box.total_in, 1)} Ⓝ</div>
        <div className="d down">of {formatNear(box.min_raise, 1)} Ⓝ minimum</div>
      </>
    );
  }
  return (
    <>
      <div className="n"><SealedPrice /></div>
      <div className="d">price sealed · {formatNear(box.total_in, 1)} Ⓝ in the box · {box.bidder_count} {box.bidder_count === 1 ? 'bidder' : 'bidders'}</div>
    </>
  );
}

export function Identity({ box, state, nowNs }: IdentityProps) {
  const ticker = box.meta.ticker.toUpperCase();
  const closes = state === 'bidding' ? `in ${clock((box.close_at - nowNs) / 1e9)}` : nsToDate(box.close_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <section className="card pad identcard">
      <div className="ident">
        <Coin image={box.meta.image} ticker={ticker} size={84} square />
        <div>
          <h1>
            {box.meta.name} <span className="tk">${ticker} / NEAR</span>
          </h1>
          <div className="chips">
            <span className="chip status" data-state={state}>
              {STATE_LABEL[state]}
            </span>
            <CopyChip value={box.coin_id} />
            <span className="chip"><Link href={`/u/${box.dev}`} title="Dev profile">dev {box.dev}</Link></span>
            <span className="chip status">box #{box.id}</span>
          </div>
        </div>
        <div className="big">
          <Headline box={box} state={state} />
        </div>
      </div>
      <div className="pills">
        <div className="pill"><small>Minimum</small><b>{formatNear(box.min_raise, 1)} Ⓝ</b></div>
        <div className="pill"><small>Bids</small><b>{box.bid_count}</b></div>
        <div className="pill"><small>Sealed</small><b>{box.sealed_count}</b></div>
        <div className="pill"><small>{state === 'bidding' ? 'Closes' : 'Closed at'}</small><b>{closes}</b></div>
        <div className="pill"><small>Supply</small><b>1B · 500M sold</b></div>
        <div className="pill"><small>Fees</small><b>1% raise · {pct(box.fee_bps)} trade</b></div>
      </div>
      {box.meta.description && <p className="fine">{box.meta.description}</p>}
    </section>
  );
}
