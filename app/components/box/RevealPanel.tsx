'use client';

import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { defaultChainInfo, roundTime } from 'tlock-js';
import { launchpadId } from '@/config';
import { messageOf } from '@/lib/errors';
import { tgas } from '@/lib/gas';
import type { LaunchBox, SealedView } from '@/lib/launchpad';
import { type Revealed, roundForClose, unseal } from '@/lib/sealed';
import { type Action, useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

type RevealPanelProps = { box: LaunchBox; onRevealed: () => Promise<void> };

const POLL_MS = 5000;

type Progress = { sealed: SealedView[]; decrypted: Map<number, Revealed>; junk: Set<number> };
const EMPTY: Progress = { sealed: [], decrypted: new Map(), junk: new Set() };

/** Decrypts every still-sealed bid the drand round now allows; junk ciphertexts are skipped, not retried. */
async function decryptAll(p: Progress): Promise<Progress> {
  const decrypted = new Map(p.decrypted);
  const junk = new Set(p.junk);
  for (const s of p.sealed) {
    if (decrypted.has(s.bid_id) || junk.has(s.bid_id)) continue;
    try {
      decrypted.set(s.bid_id, await unseal(s.tlock));
    } catch {
      junk.add(s.bid_id);
    }
  }
  return { ...p, decrypted, junk };
}

/** Reveal actions for bids that are decrypted and still unrevealed on chain. */
function pendingReveals(boxId: number, p: Progress): Action[] {
  return p.sealed
    .filter((s) => p.decrypted.has(s.bid_id))
    .map((s) => {
      const r = p.decrypted.get(s.bid_id) as Revealed;
      return { method: 'reveal', args: { box_id: boxId, bid_id: s.bid_id, max_price: r.maxPrice.toString(), salt: r.saltHex }, gas: tgas(10) };
    });
}

function statusLine(p: Progress, ready: number, waiting: boolean, roundAt: number): string {
  if (p.sealed.length === 0) return 'All sealed bids are revealed. The box opens next.';
  if (waiting) return `The drand round for this box lands at ${new Date(roundAt).toLocaleTimeString()}. Then every sealed bid decrypts here.`;
  if (ready > 0) return `${ready} bid${ready === 1 ? '' : 's'} decrypted and ready to submit.`;
  if (p.junk.size) return `${p.junk.size} could not be decrypted and will clear as market bids.`;
  return 'Decrypting…';
}

/**
 * FR-007: once the quicknet round at close_at is out, this page decrypts every stored ciphertext
 * and submits all reveals in one transaction. The user never sees a salt or a reveal button.
 */
export function RevealPanel({ box, onRevealed }: RevealPanelProps) {
  const { view, batch, accountId, signIn } = useNear();
  const { notify } = useToast();
  const [p, setP] = useState<Progress>(EMPTY);
  const latest = useRef(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const roundAt = roundTime(defaultChainInfo, roundForClose(box.close_at));
  const update = (next: Progress) => {
    latest.current = next;
    setP(next);
  };

  const poll = useCallback(async () => {
    try {
      const sealed = (await view({ contractId: launchpadId, method: 'get_sealed', args: { box_id: box.id, from: 0, limit: 200 } })) as SealedView[];
      const withSealed = { ...latest.current, sealed };
      update(Date.now() >= roundAt ? await decryptAll(withSealed) : withSealed);
    } catch (e) {
      setError(messageOf(e));
    }
  }, [view, box.id, roundAt]);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  const pending = pendingReveals(box.id, p);
  const submit = useCallback(async () => {
    if (!accountId) return void signIn().catch((e: unknown) => setError(messageOf(e)));
    if (!pending.length || busy) return;
    setBusy(true);
    submitted.current = true;
    try {
      await batch({ contractId: launchpadId, actions: pending });
      notify(`Revealed ${pending.length} sealed bid${pending.length === 1 ? '' : 's'}.`);
      await onRevealed();
    } catch (e) {
      submitted.current = false;
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }, [accountId, signIn, pending, busy, batch, notify, onRevealed]);

  useEffect(() => {
    if (pending.length > 0 && accountId && !submitted.current && !busy) void submit();
  }, [pending.length, accountId, busy, submit]);

  const total = box.sealed_count;
  const done = total - p.sealed.length;
  const waiting = Date.now() < roundAt;
  return (
    <div>
      <div className="h3"><span>Reveal</span><span>{done} / {total} unlocked</span></div>
      <div className="meter"><i style={{ '--v': total ? done / total : 1 } as CSSProperties} /></div>
      <p className="fine">{statusLine(p, pending.length, waiting, roundAt)}</p>
      {pending.length > 0 && (
        <button className="cta ghost" type="button" disabled={busy} onClick={() => void submit()}>
          {accountId ? (busy ? 'Submitting…' : `Submit ${pending.length} reveal${pending.length === 1 ? '' : 's'}`) : 'Connect wallet to submit reveals'}
        </button>
      )}
      {error && <p className="err">{error}</p>}
      <p className="fine">Any bid still sealed when Reveal ends counts as a market bid. Anyone may submit reveals; the commit is the only check.</p>
    </div>
  );
}
