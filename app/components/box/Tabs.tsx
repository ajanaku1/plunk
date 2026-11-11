'use client';

import { useState } from 'react';
import { launchpadId } from '@/config';
import { pct } from '@/lib/fees';
import { formatCoinsM, formatNear, pricePerMillion } from '@/lib/format';
import { type Bid, type BoxState, kindLabel, type LaunchBox, revealedPrice } from '@/lib/launchpad';
import { claimable } from '@/components/box/ClaimsPanel';
import { useNear } from '@/providers/near-provider';

type TabsProps = { box: LaunchBox; state: BoxState; bids: Bid[]; onClaim: (bid: Bid) => void; busy: boolean };

function outcome(bid: Bid, state: BoxState, box: LaunchBox): string {
  if (state === 'open' && bid.recipient === box.dev && BigInt(bid.tokens) === 0n) return `dev fill → escrow${BigInt(bid.refund) > 0n ? ` · ${formatNear(bid.refund, 2)} Ⓝ back` : ''}`;
  if (state === 'open') return `${formatCoinsM(bid.tokens)}M coins · ${formatNear(bid.refund, 2)} Ⓝ back`;
  if (state === 'failed') return `refund ${formatNear(bid.budget, 2)} Ⓝ`;
  if (state === 'bidding') return 'in the box';
  return 'clearing…';
}

function BidRow({ bid, state, box, onClaim, busy }: { bid: Bid; state: BoxState; box: LaunchBox; onClaim: (b: Bid) => void; busy: boolean }) {
  const kind = kindLabel(bid.kind);
  const price = revealedPrice(bid.kind);
  const canClaim = claimable(bid, state);
  return (
    <tr>
      <td>#{bid.id}</td>
      <td>
        <span className={`tag ${kind === 'Cross-chain' ? 'xchain' : kind.toLowerCase()}`}>{kind}</span>
      </td>
      <td className="r">{formatNear(bid.budget, 2)} Ⓝ</td>
      <td className="r" style={{ color: 'var(--muted)' }}>
        {kind === 'Sealed' ? (price ? `${pricePerMillion(price).toFixed(3)} Ⓝ/1M` : '•••') : 'market'}
      </td>
      <td className="r">{outcome(bid, state, box)}</td>
      <td className="r">
        {canClaim && (
          <button type="button" className="chip" disabled={busy} onClick={() => onClaim(bid)}>
            Claim
          </button>
        )}
      </td>
    </tr>
  );
}

function Details({ box }: { box: LaunchBox }) {
  const s = box.split;
  return (
    <div className="kv">
      <div><small>Coin contract</small><b>{box.coin_id}</b></div>
      <div><small>Launchpad</small><b>{launchpadId}</b></div>
      <div><small>Dev</small><b>{box.dev}</b></div>
      <div><small>Clearing</small><b>uniform price, pro-rata at the margin</b></div>
      <div><small>Raise fee</small><b>1% of accepted NEAR</b></div>
      <div><small>Trade fee</small><b>{pct(box.fee_bps)} gross · Rhea 20 / protocol 5 / dev 75</b></div>
      <div><small>Dev share split</small><b>dev {pct(s.dev)} · holders {pct(s.holders)} · burn {pct(s.buyback_burn)} · keep {pct(s.buyback_keep)}</b></div>
      <div><small>Dev sell tax</small><b>90% → 0% over {Math.round(box.tax_window_secs / 3600)}h, paid to holders</b></div>
      <div><small>Liquidity</small><b>100% of LP held by {launchpadId}, never withdrawn</b></div>
      <div><small>Sealed bids</small><b>drand quicknet timelock, auto-reveal at close</b></div>
      {box.opening?.pool_id !== null && box.opening?.pool_id !== undefined && <div><small>Pool</small><b>Rhea #{box.opening.pool_id}</b></div>}
    </div>
  );
}

export function Tabs({ box, state, bids, onClaim, busy }: TabsProps) {
  const { accountId } = useNear();
  const [tab, setTab] = useState<'mine' | 'details'>('mine');
  return (
    <section className="card">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>Your bids</button>
        <button role="tab" aria-selected={tab === 'details'} onClick={() => setTab('details')}>Details</button>
      </div>
      <div className="tabpanel">
        {tab === 'details' && <Details box={box} />}
        {tab === 'mine' && !accountId && <div className="empty">Connect a wallet to see your bids.</div>}
        {tab === 'mine' && accountId && bids.length === 0 && <div className="empty">No bids from {accountId} yet.</div>}
        {tab === 'mine' && bids.length > 0 && (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr><th>Bid</th><th>Type</th><th className="r">Amount</th><th className="r">Max price</th><th className="r">Outcome</th><th className="r"></th></tr>
              </thead>
              <tbody>
                {bids.map((b) => <BidRow key={b.id} bid={b} state={state} box={box} onClaim={onClaim} busy={busy} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
