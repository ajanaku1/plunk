'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ActivityChart } from '@/components/box/ActivityChart';
import { Banner } from '@/components/box/Banner';
import { BidPanel } from '@/components/box/BidPanel';
import { ClaimsPanel, claimable } from '@/components/box/ClaimsPanel';
import { DevPanel } from '@/components/box/DevPanel';
import { Identity } from '@/components/box/Identity';
import { TaxCard } from '@/components/box/TaxCard';
import { OpeningPanel } from '@/components/box/OpeningPanel';
import { RevealPanel } from '@/components/box/RevealPanel';
import { Tabs } from '@/components/box/Tabs';
import { launchpadId } from '@/config';
import { useActivity } from '@/hooks/useActivity';
import { useBox } from '@/hooks/useBox';
import { useConfig } from '@/hooks/useConfig';
import { useReserves } from '@/hooks/useReserves';
import { MarketRow } from '@/components/terminal/MarketRow';
import { PriceChart } from '@/components/terminal/PriceChart';
import { Rewards } from '@/components/terminal/Rewards';
import { SwapPanel } from '@/components/terminal/SwapPanel';
import { TradesFeed } from '@/components/terminal/TradesFeed';
import { messageOf } from '@/lib/errors';
import { txLink } from '@/lib/txlink';
import { fmt, formatNear, toNumber } from '@/lib/format';
import { tgas } from '@/lib/gas';
import { useStorageMin } from '@/hooks/useStorageMin';
import { type Bid, type BoxState, type LaunchBox, stateOf } from '@/lib/launchpad';
import { type Action, useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

/** An Open claim carries the coin's registration cost in case the recipient is not registered yet. */
function claimActions(box: LaunchBox, bids: Bid[], state: BoxState, coinMin: string): Action[] {
  return bids
    .filter((b) => claimable(b, state))
    .map((b) => ({ method: 'claim_bid', args: { box_id: box.id, bid_id: b.id }, deposit: state === 'open' ? coinMin : '0', gas: tgas(100) }));
}

function Progress({ box, state }: { box: LaunchBox; state: BoxState }) {
  const total = toNumber(box.total_in);
  const min = toNumber(box.min_raise);
  const scale = Math.max(min * 10, total * 1.1, 1);
  const label = total >= min ? `${fmt(total / min, 1)}× minimum` : `${fmt((total / min) * 100, 0)}% of minimum`;
  return (
    <div className="prog">
      <div className="row"><span>{state === 'open' ? 'Final raise' : 'Raise progress'}</span><b>{label}</b></div>
      <div className="bar">
        <i style={{ '--v': Math.min(1, total / scale) } as React.CSSProperties} />
        <span className="min" style={{ '--m': min / scale } as React.CSSProperties} title="Minimum" />
      </div>
      <div className="row"><span>In: <b>{formatNear(box.total_in, 1)} Ⓝ</b></span><span>Min: <b>{formatNear(box.min_raise, 1)} Ⓝ</b></span></div>
    </div>
  );
}

function Rules() {
  return (
    <section className="card pad">
      <div className="h3"><span>How a box works</span></div>
      <div className="rules">
        <div><span>01</span>Plunk NEAR in. Market bids take the clearing price; a max price seals your bid.</div>
        <div><span>02</span>At close, sealed bids unlock on their own and everyone clears at one price.</div>
        <div><span>03</span>The coin is minted, 99% of the raise becomes locked liquidity, and the dev&apos;s early sells are taxed to holders.</div>
      </div>
    </section>
  );
}

export function BoxView({ id }: { id: number }) {
  const { box, bids, nowNs, error, refresh } = useBox(id);
  const samples = useActivity(box);
  const { config } = useConfig();
  const coinMin = useStorageMin(box?.coin_id);
  const open = box?.phase === 'Open';
  const pool = useReserves(open ? config?.exchange : undefined, box?.opening?.pool_id ?? null);
  const { batch, accountId, lastTx } = useNear();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [claimError, setClaimError] = useState('');

  if (box === undefined) {
    return error ? (
      <div className="notice">Could not load box #{id}: {error}</div>
    ) : (
      <div className="page gutter in"><div className="main"><div className="skeleton" style={{ minHeight: 160 }} /><div className="skeleton" style={{ minHeight: 320 }} /></div><div className="side"><div className="skeleton" style={{ minHeight: 360 }} /></div></div>
    );
  }
  if (box === null) {
    return (
      <div className="notice">
        <p style={{ margin: '0 0 8px', color: 'var(--fg)', fontWeight: 600 }}>No box #{id} on {launchpadId}.</p>
        <p style={{ margin: 0 }}>Boxes are numbered from 0 in the order they were made. <Link className="link" href="/">See every box</Link> or <Link className="link" href="/make">make one</Link>.</p>
      </div>
    );
  }
  const state = stateOf(box, nowNs);

  const claim = async (only?: Bid) => {
    const actions = claimActions(box, only ? [only] : bids, state, coinMin);
    if (!actions.length) return;
    setBusy(true);
    setClaimError('');
    try {
      await batch({ contractId: launchpadId, actions });
      notify(state === 'open' ? `Claimed. $${box.meta.ticker.toUpperCase()} and any refund are in your wallet.` : 'Refund claimed.', txLink(lastTx()));
      await refresh();
    } catch (e) {
      setClaimError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const chartNote = state === 'failed' ? 'No pool was created.' : 'Totals only. Prices do not exist until the box clears.';
  const ticker = box.meta.ticker.toUpperCase();
  return (
    <>
      <Banner box={box} state={state} nowNs={nowNs} />
      <div className="page gutter in">
        <main className="main">
          <Identity box={box} state={state} nowNs={nowNs} />
          {state === 'open' ? (
            <>
              <MarketRow box={box} reserves={pool.reserves} feeBps={pool.feeBps} />
              <PriceChart boxId={box.id} ticks={pool.ticks} ticker={ticker} poolLabel={`Rhea pool #${box.opening?.pool_id ?? '—'} · ${box.coin_id} / ${config?.wnear ?? 'wNEAR'}`} />
              <TradesFeed box={box} ticks={pool.ticks} />
            </>
          ) : (
            <ActivityChart samples={samples} bidders={box.bidder_count} bids={box.bid_count} note={chartNote} />
          )}
          <Tabs box={box} state={state} bids={bids} onClaim={(b) => void claim(b)} busy={busy} />
        </main>
        <aside className="side">
          {state === 'open' && config && (
            <section className="card pad">
              <SwapPanel box={box} config={config} reserves={pool.reserves} onTraded={refresh} />
            </section>
          )}
          <section className="card pad">
            <Progress box={box} state={state} />
            <div style={{ marginTop: 14 }}>
              {state === 'bidding' && <BidPanel box={box} nowNs={nowNs} onPlaced={refresh} />}
              {state === 'reveal' && <RevealPanel box={box} onRevealed={refresh} />}
              {state === 'opening' && <OpeningPanel box={box} onStep={refresh} />}
              {(state === 'open' || state === 'failed') && <ClaimsPanel box={box} state={state} bids={bids} onClaimAll={() => void claim()} busy={busy} />}
              {claimError && <p className="err">{claimError}</p>}
              {error && <p className="err">Refresh failed: {error}</p>}
            </div>
          </section>
          {state === 'open' && <Rewards box={box} refreshKey={box.last_harvest_epoch} />}
          {state === 'open' && accountId === box.dev && <DevPanel box={box} nowNs={nowNs} onChange={refresh} />}
          {state === 'open' && <TaxCard box={box} nowNs={nowNs} />}
          <Rules />
        </aside>
      </div>
    </>
  );
}
