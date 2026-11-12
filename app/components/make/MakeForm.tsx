'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { launchpadId } from '@/config';
import { useConfig } from '@/hooks/useConfig';
import { type TickerCheck, useTickerTaken } from '@/hooks/useTickerTaken';
import { IMAGE_TYPES, MAX_BYTES } from '@/app/api/upload/handler';
import { prepareArt, uploadArt } from '@/lib/image';
import { messageOf } from '@/lib/errors';
import { txLink } from '@/lib/txlink';
import { ALL_DEV, breakdown, pct, splitIsValid } from '@/lib/fees';
import { formatNear, parseNear } from '@/lib/format';
import { tgas } from '@/lib/gas';
import { type BoxArgs, FEE_BPS, ROOM_SECS, SOLANA_SHARE_BPS, type Split, TAX_WINDOW_SECS, TICKER_RE } from '@/lib/launchpad';
import { useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

const SPLIT_KEYS: (keyof Split)[] = ['dev', 'holders', 'buyback_burn', 'buyback_keep'];
const SPLIT_LABEL: Record<keyof Split, string> = { dev: 'Dev', holders: 'Holders', buyback_burn: 'Buyback & burn', buyback_keep: 'Buyback & keep' };

type Draft = {
  name: string;
  ticker: string;
  image: string;
  description: string;
  roomMin: number;
  minRaise: string;
  feeBps: number;
  taxDays: number;
  solanaPct: number;
  shared: boolean;
  split: Split;
};

const INITIAL: Draft = { name: '', ticker: '', image: '', description: '', roomMin: 5, minRaise: '10', feeBps: 100, taxDays: 1, solanaPct: 30, shared: false, split: ALL_DEV };

/** Mirrors contracts/launchpad/src/types.rs::validate so the button only enables what the contract accepts. */
function problems(d: Draft, floor: bigint | undefined, ticker: TickerCheck): string[] {
  const out: string[] = [];
  const raise = parseNear(d.minRaise);
  if (!d.name.trim()) out.push('Name is required.');
  if (!TICKER_RE.test(d.ticker)) out.push('Ticker: 2–10 characters, a–z and 0–9.');
  else if (ticker === 'taken') out.push(`$${d.ticker} is taken. Pick another ticker.`);
  else if (ticker === 'checking') out.push('Checking the ticker…');
  if (d.roomMin * 60 < ROOM_SECS[0] || d.roomMin * 60 > ROOM_SECS[1]) out.push('Room: 2–10 minutes.');
  if (d.feeBps < FEE_BPS[0] || d.feeBps > FEE_BPS[1]) out.push('Fee: 0.5–3%.');
  if (d.taxDays * 86_400 < TAX_WINDOW_SECS[0] || d.taxDays * 86_400 > TAX_WINDOW_SECS[1]) out.push('Dev-tax window: 1–7 days.');
  if (raise === null) out.push('Minimum raise must be a number.');
  else if (floor !== undefined && raise < floor) out.push(`Minimum raise is at least ${formatNear(floor, 2)} NEAR.`);
  if (d.solanaPct * 100 < SOLANA_SHARE_BPS[0] || d.solanaPct * 100 > SOLANA_SHARE_BPS[1]) out.push('Solana share: 0–50%.');
  if (d.shared && !splitIsValid(d.split)) out.push('Fee split must add up to 100%.');
  return out;
}

function toArgs(d: Draft): BoxArgs {
  return {
    meta: { name: d.name.trim(), ticker: d.ticker, image: d.image.trim(), description: d.description.trim() },
    room_secs: d.roomMin * 60,
    min_raise: (parseNear(d.minRaise) ?? 0n).toString(),
    fee_bps: d.feeBps,
    split: d.shared ? d.split : null,
    tax_window_secs: d.taxDays * 86_400,
    solana_share_bps: d.solanaPct * 100,
  };
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{hint && <span>{hint}</span>}</label>
      {children}
    </div>
  );
}

const TICKER_HINT: Partial<Record<TickerCheck, string>> = { checking: 'checking…', free: 'available ✓', taken: 'taken ✗' };

/** How the box card will read on the home page, updated as the dev types. */
function Preview({ d }: { d: Draft }) {
  const [broken, setBroken] = useState('');
  const ticker = (d.ticker || 'tkr').toUpperCase();
  const showImage = d.image.trim() !== '' && broken !== d.image;
  return (
    <div className="ident" style={{ gridTemplateColumns: '44px minmax(0,1fr)', marginBottom: 12 }}>
      <div className="avatar" style={{ width: 44, height: 44, borderRadius: 12 }}>
        {showImage ? <img src={d.image.trim()} alt="" onError={() => setBroken(d.image)} /> : ticker.slice(0, 2)}
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: 15 }}>{d.name.trim() || 'Your coin'} <span className="tk" style={{ color: 'var(--muted)', fontWeight: 500 }}>${ticker}</span></h3>
        <div className="hint">{broken && broken === d.image ? 'That image URL did not load; the ticker initials show instead.' : `This is how the box card reads. Image is optional.`}</div>
      </div>
    </div>
  );
}

/** Upload to IPFS through /api/upload, or paste a URL. The stored value is always a URL string. */
function ArtField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [state, setState] = useState<'idle' | 'uploading' | string>('idle');
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setState('uploading');
    try {
      onChange(await uploadArt(await prepareArt(file, MAX_BYTES)));
      setState('idle');
    } catch (e) {
      setState(messageOf(e));
    }
  };
  return (
    <Field id="image" label="Image" hint="optional · PNG, JPG, GIF, WebP · up to 1 MB">
      <div className="artrow">
        <label className="cta ghost upload" aria-busy={state === 'uploading'}>
          {state === 'uploading' ? 'Uploading…' : value ? 'Replace image' : 'Upload image'}
          <input type="file" accept={IMAGE_TYPES.join(',')} disabled={state === 'uploading'} onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        <div className="input"><input id="image" value={value} placeholder="or paste an https:// link" onChange={(e) => onChange(e.target.value)} /></div>
      </div>
      {state !== 'idle' && state !== 'uploading' && <p className="err">{state}</p>}
    </Field>
  );
}

function SplitEditor({ split, onChange }: { split: Split; onChange: (s: Split) => void }) {
  const set = (k: keyof Split, v: string) => onChange({ ...split, [k]: Math.round(Math.max(0, Math.min(100, Number(v) || 0)) * 100) });
  const sum = SPLIT_KEYS.reduce((a, k) => a + split[k], 0);
  return (
    <div className="row2" style={{ marginTop: 4 }}>
      {SPLIT_KEYS.map((k) => (
        <Field key={k} id={`split-${k}`} label={SPLIT_LABEL[k]}>
          <div className="input" aria-invalid={sum !== 10_000}>
            <input id={`split-${k}`} inputMode="decimal" value={split[k] / 100} onChange={(e) => set(k, e.target.value)} />
            <span>% of dev share</span>
          </div>
        </Field>
      ))}
    </div>
  );
}

function Summary({ d, creationFee, issues, busy, connected }: { d: Draft; creationFee: string | undefined; issues: string[]; busy: boolean; connected: boolean }) {
  const b = breakdown(d.feeBps, d.shared ? d.split : ALL_DEV);
  const label = !connected ? 'Connect wallet' : busy ? 'Signing…' : creationFee ? `Create box · pay ${formatNear(creationFee, 3)} Ⓝ` : 'Loading fee…';
  return (
    <section className="card pad">
      <div className="h3"><span>Every trade pays {pct(b.grossBps)}</span><span>net of Rhea</span></div>
      <div className="est">
        <div><span>Rhea (DEX)</span><b>{pct(b.rheaBps)}</b></div>
        <div><span>Protocol</span><b>{pct(b.protocolBps)}</b></div>
        <div><span>Dev share</span><b>{pct(b.devShareBps)}</b></div>
        {d.shared && SPLIT_KEYS.map((k) => (
          <div key={k} style={{ paddingLeft: 12 }}><span>↳ {SPLIT_LABEL[k]}</span><b>{pct(b.buckets[k], 3)}</b></div>
        ))}
      </div>
      <div className="h3" style={{ marginTop: 16 }}><span>Before you sign</span></div>
      <div className="est">
        <div><span>Creation fee</span><b>{creationFee ? `${formatNear(creationFee, 3)} Ⓝ` : '…'}</b></div>
        <div><span>Covers</span><b>the coin&apos;s storage · not refunded</b></div>
        <div><span>Raise fee</span><b>1% of accepted NEAR at Open</b></div>
        <div><span>Supply</span><b>1B · 500M to bidders · 500M to the pool</b></div>
        <div><span>Liquidity</span><b>locked under {launchpadId} forever</b></div>
        {d.solanaPct > 0 && <div><span>Solana share</span><b>{d.solanaPct}% held at Open</b></div>}
      </div>
      <button className="cta" type="submit" disabled={busy || (connected && (issues.length > 0 || !creationFee))}>{label}</button>
      {connected && issues.length > 0 && <p className="err">{issues[0]}</p>}
    </section>
  );
}

export function MakeForm() {
  const router = useRouter();
  const { accountId, signIn, call, lastTx } = useNear();
  const { config, error: configError } = useConfig();
  const { notify } = useToast();
  const [d, setD] = useState<Draft>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const patch = (p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p }));
  const tickerCheck = useTickerTaken(d.ticker);
  const issues = problems(d, config ? BigInt(config.min_raise_floor) : undefined, tickerCheck);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!accountId) return void signIn().catch((err: unknown) => setError(messageOf(err)));
    if (!config || issues.length) return;
    setBusy(true);
    try {
      const id = (await call({ contractId: launchpadId, method: 'create_box', args: { args: toArgs(d) }, deposit: config.creation_fee, gas: tgas(100) })) as number;
      notify(`Box #${id} is live. Bidding is open for ${d.roomMin} minutes.`, txLink(lastTx()));
      router.push(`/box/${id}`);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  return (
    <form className="page narrow gutter in" onSubmit={(e) => void submit(e)}>
      <main className="main">
        <section className="card pad sec">
          <h2><span>01</span>Identity</h2>
          <Preview d={d} />
          <div className="row2">
            <Field id="name" label="Name"><div className="input"><input id="name" value={d.name} maxLength={40} placeholder="Frog on NEAR" onChange={(e) => patch({ name: e.target.value })} /></div></Field>
            <Field id="ticker" label="Ticker" hint={TICKER_HINT[tickerCheck] ?? `${d.ticker || 'ticker'}.${launchpadId}`}>
              <div className="input" aria-invalid={d.ticker !== '' && !TICKER_RE.test(d.ticker)}>
                <span>$</span><input id="ticker" value={d.ticker} maxLength={10} placeholder="frog" onChange={(e) => patch({ ticker: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })} />
              </div>
            </Field>
          </div>
          <ArtField value={d.image} onChange={(image) => patch({ image })} />
          <Field id="desc" label="Description" hint="optional"><div className="input"><textarea id="desc" value={d.description} maxLength={280} onChange={(e) => patch({ description: e.target.value })} /></div></Field>
        </section>

        <section className="card pad sec">
          <h2><span>02</span>The box</h2>
          <div className="row2">
            <Field id="room" label="Bidding room" hint={`${d.roomMin} min`}>
              <input id="room" className="range" type="range" min={2} max={10} step={1} value={d.roomMin} onChange={(e) => patch({ roomMin: Number(e.target.value) })} />
              <p className="hint">2–10 minutes. Sealed bids add a fixed 60 s Reveal after close.</p>
            </Field>
            <Field id="min" label="Minimum raise" hint={config ? `floor ${formatNear(config.min_raise_floor, 2)} Ⓝ` : undefined}>
              <div className="input" aria-invalid={parseNear(d.minRaise) === null}><input id="min" inputMode="decimal" value={d.minRaise} onChange={(e) => patch({ minRaise: e.target.value })} /><span>NEAR</span></div>
              <p className="hint">Below this at close, the box fails and everyone is refunded in full.</p>
            </Field>
          </div>
          <Field id="tax" label="Dev sell tax window" hint={`${d.taxDays} day${d.taxDays === 1 ? '' : 's'}`}>
            <input id="tax" className="range" type="range" min={1} max={7} step={1} value={d.taxDays} onChange={(e) => patch({ taxDays: Number(e.target.value) })} />
            <p className="hint">Your own sells are taxed 90% → 0% over this window; the tax goes to holders. Buyers see it before they bid.</p>
          </Field>
          <Field id="sol" label="Solana share of the pool" hint={d.solanaPct === 0 ? 'off' : `${d.solanaPct}%`}>
            <input id="sol" className="range" type="range" min={0} max={50} step={5} value={d.solanaPct} onChange={(e) => patch({ solanaPct: Number(e.target.value) })} />
            <p className="hint">At Open this share of the pool&apos;s coins and NEAR is held by the box for the coin&apos;s Solana pool instead of going to Rhea. The rest seeds Rhea as usual.</p>
          </Field>
        </section>

        <section className="card pad sec">
          <h2><span>03</span>Trading fee</h2>
          <Field id="fee" label="Fee per trade (gross)" hint={pct(d.feeBps)}>
            <input id="fee" className="range" type="range" min={FEE_BPS[0]} max={FEE_BPS[1]} step={10} value={d.feeBps} onChange={(e) => patch({ feeBps: Number(e.target.value) })} />
            <p className="hint">Rhea keeps 20% of it, the protocol 5%, you 75%. Fixed for the life of the coin.</p>
          </Field>
          <label className="toggle"><input type="checkbox" checked={d.shared} onChange={(e) => patch({ shared: e.target.checked })} /> Share your 75% with holders and buybacks</label>
          {d.shared && <SplitEditor split={d.split} onChange={(split) => patch({ split })} />}
          {d.shared && <p className="hint">Later you can only move more away from yourself, never back.</p>}
        </section>
        {(error || configError) && <p className="err">{error || configError}</p>}
      </main>
      <aside className="side">
        <Summary d={d} creationFee={config?.creation_fee} issues={issues} busy={busy} connected={!!accountId} />
      </aside>
    </form>
  );
}
