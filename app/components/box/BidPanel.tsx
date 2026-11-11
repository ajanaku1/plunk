'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { GAS_RESERVE, useBalance } from '@/hooks/useBalance';
import { useConfig } from '@/hooks/useConfig';
import { bidActions, type BidMsg } from '@/lib/bidTx';
import { messageOf } from '@/lib/errors';
import { fmt, formatNear, parseNear, parsePricePerMillion, toNumber } from '@/lib/format';
import type { LaunchBox } from '@/lib/launchpad';
import { sealBid } from '@/lib/sealed';
import { txLink } from '@/lib/txlink';
import { XChainPanel } from '@/components/box/XChainPanel';
import { useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

type BidPanelProps = { box: LaunchBox; nowNs: number; onPlaced: () => Promise<void> };
type Kind = 'market' | 'sealed';

const SOLD_M = 500;

function shareEstimate(amount: bigint | null, box: LaunchBox): string {
  if (!amount || amount <= 0n) return '—';
  const total = toNumber(box.total_in) + toNumber(amount);
  const frac = toNumber(amount) / total;
  return `≈ ${fmt(frac * SOLD_M, 2)}M $${box.meta.ticker.toUpperCase()} (${fmt(frac * 100, 2)}%)`;
}

export function BidPanel({ box, nowNs, onPlaced }: BidPanelProps) {
  const [xchain, setXchain] = useState(false);
  const { accountId, signIn, view, batch, lastTx } = useNear();
  const { config, error: configError } = useConfig();
  const { notify } = useToast();
  const bal = useBalance(accountId, box.total_in);
  const [kind, setKind] = useState<Kind>('market');
  const [amountText, setAmountText] = useState('10');
  const [maxText, setMaxText] = useState('1.000');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const amount = parseNear(amountText);
  const maxPrice = parsePricePerMillion(maxText);
  const amountBad = amount === null || amount <= 0n;
  const overBalance = !!accountId && bal !== undefined && amount !== null && amount + GAS_RESERVE > bal;
  const maxBad = kind === 'sealed' && (maxPrice === null || maxPrice <= 0n);

  const useMax = () => {
    if (bal === undefined) return;
    const spendable = bal > GAS_RESERVE ? bal - GAS_RESERVE : 0n;
    setAmountText(toNumber(spendable).toFixed(2));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!accountId) return void signIn().catch((err: unknown) => setError(messageOf(err)));
    if (!config || amountBad || maxBad || !amount) return;
    setBusy(true);
    try {
      const msg: BidMsg = kind === 'sealed' && maxPrice ? await sealBid(box.id, accountId, maxPrice, box.close_at) : { box_id: box.id, kind: 'market' };
      const actions = await bidActions({ config, accountId, amount, msg, view });
      await batch({ contractId: config.wnear, actions });
      notify(kind === 'sealed' ? 'Sealed. Your max price is encrypted until the box shuts.' : 'Plunked. You pay whatever the box clears at.', txLink(lastTx()));
      await onPlaced();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const ticker = box.meta.ticker.toUpperCase();
  return (
    <form onSubmit={(e) => void submit(e)}>
      <div className="seg full" role="radiogroup" aria-label="Bid type">
        <button type="button" aria-pressed={kind === 'market'} onClick={() => setKind('market')}>Market</button>
        <button type="button" aria-pressed={kind === 'sealed'} onClick={() => setKind('sealed')}>Max price</button>
      </div>
      <div className="field">
        <label htmlFor="amount">
          Amount
          {bal !== undefined && (
            <button type="button" onClick={useMax}>Balance: {formatNear(bal, 2)} Ⓝ</button>
          )}
        </label>
        <div className="input big" aria-invalid={amountText !== '' && amountBad}>
          <input id="amount" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
          <span>NEAR</span>
        </div>
        <div className="quick">
          {['1', '5', '10', '50'].map((q) => (
            <button key={q} type="button" aria-pressed={amountText === q} onClick={() => setAmountText(q)}>{q}</button>
          ))}
        </div>
      </div>
      {kind === 'sealed' && (
        <div className="field">
          <label htmlFor="max">Max price <span>NEAR per 1M coins</span></label>
          <div className="input big" aria-invalid={maxBad}>
            <input id="max" inputMode="decimal" value={maxText} onChange={(e) => setMaxText(e.target.value)} />
            <span>Ⓝ / 1M</span>
          </div>
        </div>
      )}
      <div className="est">
        <div><span>Bid type</span><b>{kind === 'market' ? 'Market · pays the clearing price' : 'Sealed · refunded if price > your max'}</b></div>
        <div><span>Share at today&apos;s totals</span><b>{shareEstimate(amount, box)}</b></div>
        {kind === 'sealed' && <div><span>Your max is</span><b className="pu">encrypted until close</b></div>}
      </div>
      <button className="cta" type="submit" disabled={busy || (!!accountId && (amountBad || maxBad || overBalance || !config))}>
        {!accountId ? 'Connect wallet' : busy ? 'Signing…' : `Plunk ${amountBad ? '' : fmt(toNumber(amount), 2)} NEAR`}
      </button>
      {overBalance && <p className="err">That is more than your balance after keeping 0.1 NEAR for gas.</p>}
      {(error || configError) && <p className="err">{error || configError}</p>}
      <p className="fine">
        You are refunded in full if your max is below the clearing price or the box fails. Clearing is pro-rata at the margin.
        A max price is sealed on this device with a drand timelock and opens by itself when the box shuts; there is nothing to keep.
      </p>
      <div className="xchain">
        <span className="sol" />
        <button type="button" className="link" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setXchain((v) => !v)}>
          {xchain ? 'Hide cross-chain' : `Bid on $${ticker} from Solana, Ethereum or Bitcoin`}
        </button>
      </div>
      {xchain && <XChainPanel box={box} nowNs={nowNs} />}
    </form>
  );
}
