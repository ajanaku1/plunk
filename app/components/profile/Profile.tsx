'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BoxCard, STATE_LABEL } from '@/components/home/BoxCard';
import { explorerAccount } from '@/config';
import { type Profile as ProfileData, useProfile } from '@/hooks/useProfile';
import { messageOf } from '@/lib/errors';
import { formatCoinsM, formatNear, pricePerMillion } from '@/lib/format';
import { tgas } from '@/lib/gas';
import { kindLabel } from '@/lib/launchpad';
import { pricePerM } from '@/lib/pool';
import { type BidRow, type Holding, holdingValue, supplyBps } from '@/lib/profile';
import { txLink } from '@/lib/txlink';
import { useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

const TABS = ['holdings', 'launches', 'bids'] as const;
type Tab = (typeof TABS)[number];

function ProfileHead({ account, p, mine }: { account: string; p: ProfileData; mine: boolean }) {
  const { notify } = useToast();
  const copy = () => navigator.clipboard?.writeText(account).then(() => notify('Account id copied.')).catch(() => notify(account));
  const t = p.totals;
  return (
    <section className="card pad">
      <div className="ident">
        <div className="avatar">{account.slice(0, 2).toUpperCase()}</div>
        <div>
          <h1 style={{ wordBreak: 'break-all' }}>{account}{mine && <span className="tk">you</span>}</h1>
          <div className="chips">
            <span className="chip"><button type="button" onClick={copy} style={{ all: 'unset', cursor: 'pointer' }}>Copy id</button></span>
            <span className="chip"><a href={explorerAccount(account)} target="_blank" rel="noreferrer">Explorer ↗</a></span>
          </div>
        </div>
        <div className="big">
          <div className="n">{p.loaded ? `${formatNear(t.portfolio, 2)} Ⓝ` : '…'}</div>
          <div className="d">portfolio at spot</div>
        </div>
      </div>
      <div className="pills">
        <div className="pill"><small>Coins held</small><b>{p.loaded ? t.coinsHeld : '…'}</b></div>
        <div className="pill"><small>Launched</small><b>{p.loaded ? t.launched : '…'}</b></div>
        <div className="pill"><small>Rewards to claim</small><b>{p.loaded ? `${formatNear(t.rewardsNear, 4)} Ⓝ` : '…'}</b></div>
        <div className="pill"><small>Pending claims</small><b>{p.loaded ? t.pendingClaims : '…'}</b></div>
      </div>
    </section>
  );
}

function useClaim(onDone: () => void) {
  const { call, lastTx } = useNear();
  const { notify } = useToast();
  const [busy, setBusy] = useState('');
  const claim = async (coinId: string) => {
    setBusy(coinId);
    try {
      await call({ contractId: coinId, method: 'claim', gas: tgas(60) });
      notify('Rewards claimed.', txLink(lastTx()));
      onDone();
    } catch (e) {
      notify(messageOf(e));
    } finally {
      setBusy('');
    }
  };
  return { busy, claim };
}

function HoldingRow({ h, mine, busy, onClaim }: { h: Holding; mine: boolean; busy: boolean; onClaim: () => void }) {
  const ticker = h.box.meta.ticker.toUpperCase();
  const hasRewards = BigInt(h.rewards.near) > 0n || BigInt(h.rewards.coin) > 0n;
  return (
    <tr>
      <td><Link className="link" href={`/box/${h.box.id}`}>{h.box.meta.name} <span style={{ color: 'var(--muted)' }}>${ticker}</span></Link></td>
      <td className="r">{formatCoinsM(h.balance)}M <small style={{ color: 'var(--muted)' }}>{(supplyBps(h.balance) / 100).toFixed(2)}%</small></td>
      <td className="r">{h.reserves ? pricePerM(h.reserves).toFixed(4) : '—'}</td>
      <td className="r">{formatNear(holdingValue(h.balance, h.reserves), 3)} Ⓝ</td>
      <td className="r">{formatNear(h.rewards.near, 4)} Ⓝ{BigInt(h.rewards.coin) > 0n && ` + ${formatCoinsM(h.rewards.coin)}M`}</td>
      <td className="r">{mine && hasRewards && <button className="chip" type="button" disabled={busy} onClick={onClaim}>{busy ? 'Signing…' : 'Claim'}</button>}</td>
    </tr>
  );
}

function Holdings({ p, mine }: { p: ProfileData; mine: boolean }) {
  const { busy, claim } = useClaim(p.refresh);
  if (p.holdings.length === 0) return <div className="notice">No coins yet. {mine ? <Link className="link" href="/">Find a box to bid on →</Link> : 'This account holds no Plunk coins.'}</div>;
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr><th>Coin</th><th className="r">Balance</th><th className="r">Price Ⓝ/1M</th><th className="r">Value</th><th className="r">Rewards</th><th /></tr></thead>
        <tbody>{p.holdings.map((h) => <HoldingRow key={h.box.id} h={h} mine={mine} busy={busy === h.box.coin_id} onClaim={() => void claim(h.box.coin_id)} />)}</tbody>
      </table>
    </div>
  );
}

/** What a bid turned into: coins at the clearing price, or the dev's own fill which goes to escrow. */
function got({ box, bid, state }: BidRow): string {
  if (state !== 'open') return '—';
  if (bid.bidder === box.dev) return 'dev fill → escrow';
  return `${formatCoinsM(bid.tokens)}M @ ${pricePerMillion(box.opening?.price ?? '0').toFixed(3)}`;
}

function BidsTable({ rows }: { rows: BidRow[] }) {
  if (rows.length === 0) return <div className="notice">No bids yet.</div>;
  return (
    <div className="tbl-wrap">
      <table>
        <thead><tr><th>Box</th><th>Kind</th><th className="r">Budget</th><th className="r">Got</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(({ box, bid, state, pending }) => (
            <tr key={`${box.id}-${bid.id}`}>
              <td><Link className="link" href={`/box/${box.id}`}>#{box.id} ${box.meta.ticker.toUpperCase()}</Link></td>
              <td><span className={`tag ${kindLabel(bid.kind).toLowerCase().replace('-chain', 'chain')}`}>{kindLabel(bid.kind)}</span></td>
              <td className="r">{formatNear(bid.budget, 2)} Ⓝ</td>
              <td className="r">{got({ box, bid, state, pending })}</td>
              <td>{pending ? <Link className="link" href={`/box/${box.id}`}>Claim →</Link> : STATE_LABEL[state]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Profile({ account }: { account: string }) {
  const { accountId } = useNear();
  const p = useProfile(account);
  const [tab, setTab] = useState<Tab>('holdings');
  const mine = accountId === account;
  const count: Record<Tab, number> = { holdings: p.holdings.length, launches: p.launches.length, bids: p.bids.length };
  return (
    <div className="gutter in stack" style={{ paddingBlock: 20 }}>
      <ProfileHead account={account} p={p} mine={mine} />
      {p.error && <p className="err">Could not load boxes: {p.error}</p>}
      <section className="card">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}{p.loaded && ` · ${count[t]}`}</button>
          ))}
        </div>
        <div className="tabpanel">
          {!p.loaded && <div className="notice">Loading…</div>}
          {p.loaded && tab === 'holdings' && <Holdings p={p} mine={mine} />}
          {p.loaded && tab === 'bids' && <BidsTable rows={p.bids} />}
          {p.loaded && tab === 'launches' && (
            p.launches.length === 0
              ? <div className="notice">No launches yet. {mine && <Link className="link" href="/make">Make a box →</Link>}</div>
              : <div className="grid" style={{ padding: 16 }}>{p.launches.map((b) => <BoxCard key={b.id} box={b} nowNs={p.nowNs} />)}</div>
          )}
        </div>
      </section>
    </div>
  );
}
