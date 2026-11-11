'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { clock, formatNear, pricePerMillion, toNumber } from '@/lib/format';
import { type BoxState, type LaunchBox, revealEnd, stateOf } from '@/lib/launchpad';

export const STATE_LABEL: Record<BoxState, string> = { bidding: 'Bidding', reveal: 'Reveal', opening: 'Opening', open: 'Open', failed: 'Failed' };

export function Headline({ box, state, nowNs }: { box: LaunchBox; state: BoxState; nowNs: number }) {
  if (state === 'open' && box.opening) return <b>{pricePerMillion(box.opening.price).toFixed(3)} Ⓝ <small>per 1M</small></b>;
  if (state === 'bidding') return <b>{clock((box.close_at - nowNs) / 1e9)} <small>to close</small></b>;
  if (state === 'reveal') return <b>{clock((revealEnd(box) - nowNs) / 1e9)} <small>to open</small></b>;
  return <b>{formatNear(box.total_in, 1)} Ⓝ <small>in the box</small></b>;
}

function headlineLabel(state: BoxState): string {
  if (state === 'open') return 'Price';
  if (state === 'bidding') return 'Closes';
  if (state === 'reveal') return 'Opens';
  return 'Raised';
}

function action(state: BoxState): string {
  if (state === 'bidding') return 'Plunk in';
  if (state === 'open') return 'Trade';
  if (state === 'failed') return 'Refunds';
  return 'Watch';
}

export function BoxCard({ box, nowNs }: { box: LaunchBox; nowNs: number }) {
  const state = stateOf(box, nowNs);
  const ticker = box.meta.ticker.toUpperCase();
  const total = toNumber(box.total_in);
  const min = toNumber(box.min_raise);
  const scale = Math.max(min * 10, total * 1.1, 1);
  return (
    <Link href={`/box/${box.id}`} className="card boxcard" data-state={state}>
      <div className="bc-top">
        <div className="avatar">{box.meta.image ? <img src={box.meta.image} alt="" /> : ticker.slice(0, 2)}</div>
        <div className="bc-name">
          <h3>{box.meta.name}</h3>
          <span className="mono">${ticker} · #{box.id}</span>
        </div>
        <span className="chip status" data-state={state}>{STATE_LABEL[state]}</span>
      </div>
      <div className="bc-stats">
        <div><small>{headlineLabel(state)}</small><Headline box={box} state={state} nowNs={nowNs} /></div>
        <div><small>Raised</small><b>{formatNear(box.total_in, 1)} Ⓝ</b></div>
        <div><small>Bidders</small><b>{box.bidder_count}</b></div>
      </div>
      <div className="bar"><i style={{ '--v': Math.min(1, total / scale) } as CSSProperties} /><span className="min" style={{ '--m': min / scale } as CSSProperties} /></div>
      <div className="bc-foot">
        <span className="mono">dev {box.dev}</span>
        <span className="bc-cta">{action(state)} →</span>
      </div>
    </Link>
  );
}
