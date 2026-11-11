'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { launchpadId, networkId } from '@/config';
import { messageOf } from '@/lib/errors';
import { clock, formatNear } from '@/lib/format';
import { tgas } from '@/lib/gas';
import type { LaunchBox } from '@/lib/launchpad';
import { beforeCutoff, originTokens, type Quote, type Status, type Token, toUnits, validAccountId } from '@/lib/xchain';
import { useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

type XChainPanelProps = { box: LaunchBox; nowNs: number };

function useTokens(): { tokens: Token[]; error: string } {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/xchain/quote?tokens=1')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`tokens ${r.status}`))))
      .then((t: Token[]) => setTokens(originTokens(t)))
      .catch((e: unknown) => setError(messageOf(e)));
  }, []);
  return { tokens, error };
}

/** Polls 1Click's status for a deposit address every 10 s until it settles. */
function useStatus(depositAddress: string | undefined): Status | undefined {
  const [s, setS] = useState<Status>();
  useEffect(() => {
    if (!depositAddress) return;
    let live = true;
    const poll = () =>
      fetch(`/api/xchain/quote?depositAddress=${encodeURIComponent(depositAddress)}`)
        .then((r) => r.json())
        .then((j: Status) => live && setS(j))
        .catch(() => undefined);
    void poll();
    const t = setInterval(() => void poll(), 10_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [depositAddress]);
  return s;
}

/** FR-028: wNEAR that arrived late or malformed is a claimable credit for the named account. */
function LateCredit({ accountId }: { accountId: string }) {
  const { view, call } = useNear();
  const { notify } = useToast();
  const [late, setLate] = useState(0n);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!accountId) return;
    view({ contractId: launchpadId, method: 'get_late', args: { account_id: accountId } })
      .then((v) => setLate(BigInt(v as string)))
      .catch(() => setLate(0n));
  }, [view, accountId, busy]);
  if (late === 0n) return null;
  const claim = async () => {
    setBusy(true);
    setError('');
    try {
      await call({ contractId: launchpadId, method: 'claim_late', gas: tgas(60) });
      notify('Late credit claimed.');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="est" style={{ marginTop: 10 }}>
      <div><span>Late or unmatched deposits</span><b>{formatNear(late, 4)} Ⓝ</b></div>
      <button className="cta ghost" type="button" disabled={busy} onClick={() => void claim()}>{busy ? 'Signing…' : 'Claim late credit'}</button>
      {error && <p className="err">{error}</p>}
    </div>
  );
}

export function XChainPanel({ box, nowNs }: XChainPanelProps) {
  const { accountId } = useNear();
  const { tokens, error: tokensError } = useTokens();
  const [assetId, setAssetId] = useState('');
  const [amount, setAmount] = useState('10');
  const [refundTo, setRefundTo] = useState('');
  const [recipient, setRecipient] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState<Quote>();
  const status = useStatus(quote?.depositAddress);
  useEffect(() => {
    if (!recipient && accountId) setRecipient(accountId);
  }, [accountId, recipient]);
  useEffect(() => {
    if (!assetId && tokens.length) setAssetId(tokens.find((t) => t.blockchain === 'sol' && t.symbol === 'USDC')?.assetId ?? tokens[0].assetId);
  }, [tokens, assetId]);

  const token = tokens.find((t) => t.assetId === assetId);
  const open = beforeCutoff(box.close_at, nowNs / 1e6);
  const units = token ? toUnits(amount, token.decimals) : null;
  const canQuote = open && !!token && !!units && refundTo.trim().length > 0 && validAccountId(recipient);

  const getQuote = async (e: FormEvent) => {
    e.preventDefault();
    if (!canQuote || !token) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/xchain/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ boxId: box.id, originAsset: token.assetId, amount: units, refundTo: refundTo.trim(), recipient: recipient.trim(), dry: false }),
      });
      const j = (await r.json()) as { quote?: Quote; error?: string; detail?: { message?: string } };
      if (!r.ok || !j.quote) throw new Error(j.error ? `${j.error}${j.detail?.message ? `: ${j.detail.message}` : ''}` : 'no quote');
      setQuote(j.quote);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (networkId !== 'mainnet') {
    return <p className="fine">Cross-chain bids go through NEAR Intents, which settles on mainnet only. On testnet, bid with wNEAR above.</p>;
  }
  return (
    <form onSubmit={(e) => void getQuote(e)} style={{ marginTop: 6 }}>
      <div className="field">
        <label htmlFor="xasset">Pay with</label>
        <div className="input">
          <select id="xasset" value={assetId} onChange={(e) => setAssetId(e.target.value)} disabled={!tokens.length}>
            {tokens.map((t) => (
              <option key={t.assetId} value={t.assetId}>{t.symbol} on {t.blockchain}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="xamt">Amount <span>{token?.symbol ?? ''}</span></label>
        <div className="input big" aria-invalid={amount !== '' && !units}><input id="xamt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /><span>{token?.symbol}</span></div>
      </div>
      <div className="field">
        <label htmlFor="xrefund">Refund address <span>on {token?.blockchain ?? 'the origin chain'}</span></label>
        <div className="input"><input id="xrefund" value={refundTo} placeholder="Where a failed swap is returned" onChange={(e) => setRefundTo(e.target.value)} /></div>
      </div>
      <div className="field">
        <label htmlFor="xrecip">NEAR account that receives the coins</label>
        <div className="input" aria-invalid={recipient !== '' && !validAccountId(recipient)}><input id="xrecip" value={recipient} placeholder="you.near" onChange={(e) => setRecipient(e.target.value.toLowerCase())} /></div>
      </div>
      {!quote && (
        <button className="cta" type="submit" disabled={busy || !canQuote}>
          {!open ? 'Cross-chain bids closed (5 min before close)' : busy ? 'Getting a deposit address…' : 'Get deposit address'}
        </button>
      )}
      {quote && (
        <div className="est" style={{ marginTop: 12 }}>
          <div><span>Send exactly</span><b>{quote.amountInFormatted} {token?.symbol}</b></div>
          <div><span>To</span><b className="mono" style={{ wordBreak: 'break-all', textAlign: 'right' }}>{quote.depositAddress}</b></div>
          <div><span>Arrives as</span><b>≈ {quote.amountOutFormatted} wNEAR market bid</b></div>
          <div><span>Quote valid</span><b>{clock((Date.parse(quote.deadline) - nowNs / 1e6) / 1000)}</b></div>
          <div><span>Status</span><b className="pu">{status?.status ?? 'waiting for deposit'}</b></div>
        </div>
      )}
      {(error || tokensError) && <p className="err">{error || tokensError}</p>}
      <p className="fine">Market bid only. It arrives within about 15 minutes; a deposit that lands after the box shuts becomes a wNEAR credit the recipient can claim here. 1Click adds 0.25%.</p>
      <LateCredit accountId={accountId} />
    </form>
  );
}
