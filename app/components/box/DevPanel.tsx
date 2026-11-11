'use client';

import { useEffect, useState } from 'react';
import { launchpadId } from '@/config';
import { messageOf } from '@/lib/errors';
import { txLink } from '@/lib/txlink';
import { pct, splitIsValid } from '@/lib/fees';
import { clock, fmt, formatCoinsM } from '@/lib/format';
import { tgas } from '@/lib/gas';
import { useStorageMin } from '@/hooks/useStorageMin';
import { type LaunchBox, type Split, treasuryTotal, type Withdrawal } from '@/lib/launchpad';
import { devWithdraw } from '@/lib/math';
import { useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

type DevPanelProps = { box: LaunchBox; nowNs: number; onChange: () => Promise<void> };

const SPLIT_KEYS: (keyof Split)[] = ['dev', 'holders', 'buyback_burn', 'buyback_keep'];
const SPLIT_LABEL: Record<keyof Split, string> = { dev: 'Dev', holders: 'Holders', buyback_burn: 'Burn', buyback_keep: 'Keep' };

/** Runs one dev action with the shared busy / error state. */
function useAction(onChange: () => Promise<void>) {
  const { notify } = useToast();
  const { lastTx } = useNear();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const run = async (name: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(name);
    setError('');
    try {
      await fn();
      notify(done, txLink(lastTx()));
      await onChange();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy('');
    }
  };
  return { busy, error, run };
}

function Withdraw({ box, nowNs, onChange }: DevPanelProps) {
  const { call } = useNear();
  const coinMin = useStorageMin(box.coin_id);
  const { busy, error, run } = useAction(onChange);
  const [percent, setPercent] = useState(10);
  const balance = BigInt(box.escrow.balance);
  const amount = (balance * BigInt(percent)) / 100n;
  const w = { start: BigInt(box.escrow.window_start), end: BigInt(box.escrow.window_end) };
  const preview = w.end > w.start && amount > 0n ? devWithdraw(amount, BigInt(Math.floor(nowNs)), w) : null;
  const ticker = box.meta.ticker.toUpperCase();
  const withdraw = () =>
    run('withdraw', () => call({ contractId: launchpadId, method: 'dev_withdraw', args: { box_id: box.id, amount: amount.toString() }, deposit: coinMin, gas: tgas(80) }), 'Withdrawn. Holders got their share.');
  return (
    <div>
      <div className="field">
        <label htmlFor="wd">Withdraw from escrow <b>{percent}% · {formatCoinsM(amount)}M ${ticker}</b></label>
        <input id="wd" className="range" type="range" min={0} max={100} step={1} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
      </div>
      <div className="est">
        <div><span>You get</span><b>{preview ? `${formatCoinsM(preview.toDev)}M` : '—'}</b></div>
        <div><span>Holders get</span><b className="pu">{preview ? `${formatCoinsM(preview.toHolders)}M (${fmt(Number(preview.rateBps) / 100, 2)}%)` : '—'}</b></div>
      </div>
      <button className="cta" type="button" disabled={busy !== '' || amount === 0n} onClick={() => void withdraw()}>
        {busy === 'withdraw' ? 'Signing…' : `Withdraw ${formatCoinsM(amount)}M $${ticker}`}
      </button>
      {error && <p className="err">{error}</p>}
    </div>
  );
}

function Extend({ box, nowNs, onChange }: DevPanelProps) {
  const { call } = useNear();
  const { busy, error, run } = useAction(onChange);
  const [days, setDays] = useState(1);
  const running = nowNs < box.escrow.window_end;
  const extend = () =>
    run('extend', () => call({ contractId: launchpadId, method: 'dev_extend', args: { box_id: box.id, secs: days * 86_400 }, deposit: '1', gas: tgas(30) }), `New ${days}-day window started at 90%.`);
  return (
    <div style={{ marginTop: 16 }}>
      <div className="h3"><span>Tax window</span><span>{running ? `${clock((box.escrow.window_end - nowNs) / 1e9)} left` : 'ended'}</span></div>
      <div className="field" style={{ marginTop: 0 }}>
        <label htmlFor="ext">Extend by <b>{days} day{days === 1 ? '' : 's'}</b></label>
        <input id="ext" className="range" type="range" min={1} max={7} step={1} value={days} disabled={running} onChange={(e) => setDays(Number(e.target.value))} />
      </div>
      <button className="cta ghost" type="button" disabled={running || busy !== ''} onClick={() => void extend()}>
        {running ? 'Extend (after the window ends)' : busy === 'extend' ? 'Signing…' : 'Start a new window at 90%'}
      </button>
      {error && <p className="err">{error}</p>}
    </div>
  );
}

function GiveMore({ box, onChange }: DevPanelProps) {
  const { call } = useNear();
  const { busy, error, run } = useAction(onChange);
  const [split, setSplit] = useState<Split>(box.split);
  useEffect(() => setSplit(box.split), [box.split]);
  const valid = splitIsValid(split) && split.dev <= box.split.dev;
  const changed = SPLIT_KEYS.some((k) => split[k] !== box.split[k]);
  const set = (k: keyof Split, v: string) => setSplit({ ...split, [k]: Math.round(Math.max(0, Math.min(100, Number(v) || 0)) * 100) });
  const shift = () => run('split', () => call({ contractId: launchpadId, method: 'shift_split', args: { box_id: box.id, split }, deposit: '1', gas: tgas(30) }), 'Split shifted. This cannot be undone.');
  return (
    <div style={{ marginTop: 16 }}>
      <div className="h3"><span>Give more to holders</span><span>of your {pct((box.fee_bps * 75) / 100)} share</span></div>
      <div className="row2">
        {SPLIT_KEYS.map((k) => (
          <div className="field" key={k} style={{ marginTop: 0 }}>
            <label htmlFor={`s-${k}`}>{SPLIT_LABEL[k]}</label>
            <div className="input" aria-invalid={!valid}><input id={`s-${k}`} inputMode="decimal" value={split[k] / 100} onChange={(e) => set(k, e.target.value)} /><span>%</span></div>
          </div>
        ))}
      </div>
      <button className="cta ghost" type="button" disabled={!valid || !changed || busy !== ''} onClick={() => void shift()}>
        {busy === 'split' ? 'Signing…' : 'Shift split (one-way)'}
      </button>
      {!valid && changed && <p className="err">Must sum to 100% and your own share can only go down.</p>}
      {error && <p className="err">{error}</p>}
    </div>
  );
}

function Treasury({ box, onChange }: DevPanelProps) {
  const { call, view } = useNear();
  const coinMin = useStorageMin(box.coin_id);
  const { busy, error, run } = useAction(onChange);
  const total = treasuryTotal(box);
  const [preview, setPreview] = useState<Withdrawal>();
  useEffect(() => {
    if (total === 0n) return setPreview(undefined);
    view({ contractId: launchpadId, method: 'preview_treasury_withdraw', args: { box_id: box.id, amount: total.toString() } })
      .then((w) => setPreview(w as Withdrawal))
      .catch(() => setPreview(undefined));
  }, [view, box.id, total]);
  const take = () =>
    run('treasury', () => call({ contractId: launchpadId, method: 'treasury_withdraw', args: { box_id: box.id, amount: total.toString() }, deposit: coinMin, gas: tgas(80) }), 'Treasury withdrawn.');
  if (total === 0n) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="h3"><span>Treasury</span><span>{formatCoinsM(total)}M kept</span></div>
      <div className="est">
        <div><span>Withdraw all now, you get</span><b>{preview ? `${formatCoinsM(preview.to_dev)}M` : '—'}</b></div>
        <div><span>Holders get</span><b className="pu">{preview ? `${formatCoinsM(preview.to_holders)}M (${fmt(preview.rate_bps / 100, 2)}%)` : '—'}</b></div>
      </div>
      <button className="cta ghost" type="button" disabled={busy !== ''} onClick={() => void take()}>{busy === 'treasury' ? 'Signing…' : 'Withdraw treasury'}</button>
      {error && <p className="err">{error}</p>}
      <p className="fine">Each kept deposit runs its own 7-day 90% → 0% curve. Oldest first.</p>
    </div>
  );
}

const MAX_HARVEST_STEPS = 8;

function Harvest({ box, onChange }: DevPanelProps) {
  const { call, view } = useNear();
  const { busy, error, run } = useAction(onChange);
  /** Like the keeper: a harvest that ran short of gas is resumed by calling again until `box.harvest` clears. */
  const steps = async () => {
    for (let i = 1; i <= MAX_HARVEST_STEPS; i++) {
      await call({ contractId: launchpadId, method: 'harvest', args: { box_id: box.id }, gas: tgas(300) });
      const b = (await view({ contractId: launchpadId, method: 'get_box', args: { id: box.id } })) as LaunchBox | null;
      if (!b?.harvest) return;
    }
    throw new Error(`harvest still in flight after ${MAX_HARVEST_STEPS} transactions`);
  };
  const harvest = () => run('harvest', steps, 'Harvest done for this hour.');
  return (
    <div style={{ marginTop: 16 }}>
      <button className="cta ghost" type="button" disabled={busy !== ''} onClick={() => void harvest()}>{busy === 'harvest' ? 'Signing…' : 'Harvest fees now'}</button>
      {error && <p className="err">{error}</p>}
      <p className="fine">The keeper harvests every hour at :17. Anyone may run it early; a second run in the same hour does nothing.</p>
    </div>
  );
}

/** FR-031: the dev's controls on their own Open box. Rendered only for `box.dev`. */
export function DevPanel(props: DevPanelProps) {
  const { box } = props;
  const ticker = box.meta.ticker.toUpperCase();
  return (
    <section className="card pad">
      <div className="h3"><span>Dev panel</span><span>{formatCoinsM(box.escrow.balance)}M ${ticker} in escrow</span></div>
      <p className="fine" style={{ margin: '0 0 8px' }}>Everything you won in your own box sits here. Taking it out early pays holders; the rate falls to 0% at the end of the window.</p>
      {BigInt(box.escrow.balance) > 0n ? <Withdraw {...props} /> : <p className="fine">Escrow is empty.</p>}
      <Extend {...props} />
      <GiveMore {...props} />
      <Treasury {...props} />
      <Harvest {...props} />
    </section>
  );
}

