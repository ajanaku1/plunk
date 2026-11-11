'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { GAS_RESERVE, useBalance } from '@/hooks/useBalance';
import { messageOf } from '@/lib/errors';
import { txLink } from '@/lib/txlink';
import { pct } from '@/lib/fees';
import { fmt, formatCoinsM, formatNear, parseNear, toNumber } from '@/lib/format';
import { tgas } from '@/lib/gas';
import { fetchStorageMin } from '@/hooks/useStorageMin';
import type { Config, LaunchBox } from '@/lib/launchpad';
import { quote, type Reserves, swapMsg, withSlippage } from '@/lib/pool';
import { type BatchParams, useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

type SwapPanelProps = { box: LaunchBox; config: Config; reserves: Reserves | null; onTraded: () => Promise<void> };
type Side = 'buy' | 'sell';

const SLIPPAGE_BPS = 100;
const MILLION = 1_000_000n;

type StorageBalance = { total: string } | null;

/** Coin balance of the connected account, refreshed with `key`. */
function useCoinBalance(coinId: string, accountId: string, key: unknown): bigint {
  const { view } = useNear();
  const [bal, setBal] = useState(0n);
  useEffect(() => {
    if (!accountId) return setBal(0n);
    view({ contractId: coinId, method: 'ft_balance_of', args: { account_id: accountId } })
      .then((v) => setBal(BigInt(v as string)))
      .catch(() => setBal(0n));
  }, [view, coinId, accountId, key]);
  return bal;
}

export function SwapPanel({ box, config, reserves, onTraded }: SwapPanelProps) {
  const { accountId, signIn, view, batchMany, lastTx } = useNear();
  const { notify } = useToast();
  const [side, setSide] = useState<Side>('buy');
  const [text, setText] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const coins = useCoinBalance(box.coin_id, accountId, reserves?.x);
  const near = useBalance(accountId, reserves?.x);
  const ticker = box.meta.ticker.toUpperCase();
  const poolId = box.opening?.pool_id ?? null;

  // Buy amounts are NEAR; sell amounts are millions of coins.
  const amountIn = side === 'buy' ? parseNear(text) : (() => {
    const n = parseNear(text);
    return n === null ? null : n * MILLION;
  })();
  const bad = amountIn === null || amountIn <= 0n;
  const over = !!accountId && amountIn !== null && (side === 'buy' ? near !== undefined && amountIn + GAS_RESERVE > near : amountIn > coins);
  const out = reserves && !bad ? quote(reserves, amountIn, side, box.fee_bps) : 0n;
  const minOut = withSlippage(out, SLIPPAGE_BPS);

  const trade = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!accountId) return void signIn().catch((err: unknown) => setError(messageOf(err)));
    if (bad || !amountIn || poolId === null || !reserves) return;
    setBusy(true);
    try {
      const txs: BatchParams[] = [];
      const [tokenIn, tokenOut] = side === 'buy' ? [config.wnear, box.coin_id] : [box.coin_id, config.wnear];
      const registered = (await view({ contractId: tokenOut, method: 'storage_balance_of', args: { account_id: accountId } })) as StorageBalance;
      if (!registered) txs.push({ contractId: tokenOut, actions: [{ method: 'storage_deposit', args: { account_id: accountId, registration_only: true }, deposit: await fetchStorageMin(view, tokenOut), gas: tgas(10) }] });
      const msg = swapMsg(poolId, tokenIn, tokenOut, amountIn, minOut);
      const call = { method: 'ft_transfer_call', args: { receiver_id: config.exchange, amount: amountIn.toString(), msg }, deposit: '1', gas: tgas(120) };
      txs.push({ contractId: tokenIn, actions: side === 'buy' ? [{ method: 'near_deposit', deposit: amountIn.toString(), gas: tgas(10) }, call] : [call] });
      await batchMany(txs);
      notify(side === 'buy' ? `Bought $${ticker}.` : `Sold $${ticker} for NEAR.`, txLink(lastTx()));
      await onTraded();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const receive = side === 'buy' ? `${formatCoinsM(out)}M $${ticker}` : `${formatNear(out, 4)} NEAR`;
  return (
    <form onSubmit={(e) => void trade(e)}>
      <div className="seg full" role="radiogroup" aria-label="Side">
        <button type="button" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>Buy</button>
        <button type="button" aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>Sell</button>
      </div>
      <div className="field">
        <label htmlFor="swapAmt">
          Amount
          {accountId && side === 'sell' && <button type="button" onClick={() => setText(fmt(toNumber(coins / MILLION), 2).replace(/,/g, ''))}>You hold {formatCoinsM(coins)}M</button>}
          {accountId && side === 'buy' && near !== undefined && <b>Balance {formatNear(near, 2)} Ⓝ</b>}
        </label>
        <div className="input big" aria-invalid={text !== '' && bad}>
          <input id="swapAmt" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
          <span>{side === 'buy' ? 'NEAR' : `M $${ticker}`}</span>
        </div>
        <div className="quick">
          {(side === 'buy' ? ['1', '5', '25', '100'] : ['1', '10', '50', '100']).map((q) => (
            <button key={q} type="button" aria-pressed={text === q} onClick={() => setText(q)}>{q}</button>
          ))}
        </div>
      </div>
      <div className="est">
        <div><span>You receive</span><b>{reserves ? receive : '—'}</b></div>
        <div><span>Min after {pct(SLIPPAGE_BPS)} slippage</span><b>{side === 'buy' ? `${formatCoinsM(minOut)}M` : `${formatNear(minOut, 4)} Ⓝ`}</b></div>
        <div><span>Pool fee</span><b>{pct(box.fee_bps)} · Rhea 20 / protocol 5 / dev 75</b></div>
        <div><span>Route</span><b>Rhea pool #{poolId ?? '—'} · direct</b></div>
      </div>
      <button className="cta" type="submit" disabled={busy || (!!accountId && (bad || over || !reserves))}>
        {!accountId ? 'Connect wallet' : busy ? 'Signing…' : side === 'buy' ? `Buy $${ticker}` : `Sell $${ticker}`}
      </button>
      {over && <p className="err">{side === 'buy' ? 'More than your NEAR balance after keeping 0.1 NEAR for gas.' : `You hold ${formatCoinsM(coins)}M $${ticker}.`}</p>}
      {error && <p className="err">{error}</p>}
      <p className="fine">Swaps go straight to the Rhea pool. On mainnet a 0.1% Plunk fee is added through the Rhea router.</p>
    </form>
  );
}
