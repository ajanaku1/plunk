'use client';

import { formatCoinsM, formatNear, pricePerMillion } from '@/lib/format';
import { type Bid, claimable, type LaunchBox } from '@/lib/launchpad';
import { useNear } from '@/providers/near-provider';

export { claimable };

type ClaimsPanelProps = { box: LaunchBox; state: 'open' | 'failed'; bids: Bid[]; onClaimAll: () => void; busy: boolean };

function sum(bids: Bid[], pick: (b: Bid) => string): bigint {
  return bids.reduce((a, b) => a + BigInt(pick(b)), 0n);
}

/** Open: your fill and refund. Failed: your 100% refund. Trading itself arrives with the terminal. */
export function ClaimsPanel({ box, state, bids, onClaimAll, busy }: ClaimsPanelProps) {
  const { accountId, signIn } = useNear();
  const ticker = box.meta.ticker.toUpperCase();
  const pending = bids.filter((b) => claimable(b, state)).length;
  const spent = sum(bids, (b) => b.budget);
  return (
    <div>
      {state === 'open' && box.opening && (
        <div className="est">
          <div><span>Clearing price</span><b>{pricePerMillion(box.opening.price).toFixed(3)} Ⓝ / 1M</b></div>
          <div><span>Accepted</span><b>{formatNear(box.opening.accepted_total, 1)} Ⓝ</b></div>
          <div><span>Liquidity</span><b>{formatNear((BigInt(box.opening.accepted_total) * 99n) / 100n, 1)} Ⓝ + 500M · locked</b></div>
          {box.opening.pool_id !== null && <div><span>Pool</span><b>Rhea #{box.opening.pool_id}</b></div>}
        </div>
      )}
      <div className="h3" style={{ marginTop: 14 }}><span>Your position</span></div>
      {!accountId && <p className="fine">Connect a wallet to see what is yours.</p>}
      {accountId && (
        <div className="est">
          <div><span>You plunked</span><b>{formatNear(spent, 2)} Ⓝ</b></div>
          {state === 'open' && accountId === box.dev && <div><span>Your fill</span><b>to escrow · see Dev</b></div>}
          {state === 'open' && accountId !== box.dev && <div><span>You receive</span><b>{formatCoinsM(sum(bids, (b) => b.tokens))}M ${ticker}</b></div>}
          <div><span>{state === 'open' ? 'Refund' : 'Refund (100%)'}</span><b>{formatNear(state === 'open' ? sum(bids, (b) => b.refund) : spent, 2)} Ⓝ</b></div>
        </div>
      )}
      <button className={`cta${state === 'failed' ? ' ghost' : ''}`} type="button" disabled={busy || (!!accountId && pending === 0)} onClick={() => (accountId ? onClaimAll() : void signIn())}>
        {!accountId ? 'Connect wallet' : busy ? 'Signing…' : pending === 0 ? 'Nothing to claim' : state === 'open' ? `Claim $${ticker}` : 'Claim refund'}
      </button>
    </div>
  );
}
