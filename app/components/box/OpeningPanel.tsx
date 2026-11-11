'use client';

import { useState } from 'react';
import { launchpadId } from '@/config';
import { openingStep } from '@/components/box/Banner';
import { messageOf } from '@/lib/errors';
import { tgas } from '@/lib/gas';
import type { LaunchBox } from '@/lib/launchpad';
import { useNear } from '@/providers/near-provider';
import { useToast } from '@/providers/toast';

type OpeningPanelProps = { box: LaunchBox; onStep: () => Promise<void> };

const STEPS = ['Clearing bids', 'Minting the coin', 'Creating the pool', 'Adding liquidity'];

/** Past Reveal: anyone may call `open`; while Opening, `retry_open` carries on (FR-014). */
export function OpeningPanel({ box, onStep }: OpeningPanelProps) {
  const { accountId, signIn, call } = useNear();
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = box.phase === 'Opening';
  const step = started ? openingStep(box) : 0;

  const nudge = async () => {
    setError('');
    if (!accountId) return void signIn().catch((e: unknown) => setError(messageOf(e)));
    setBusy(true);
    try {
      await call({ contractId: launchpadId, method: started ? 'retry_open' : 'open', args: { box_id: box.id }, gas: tgas(300) });
      await onStep();
      notify(started ? 'Nudged. If the box is still Opening, nudge again: each nudge runs one or two steps.' : 'Opening started. Nudge until all four steps are done.');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="h3"><span>Opening</span><span>{started ? `${step} / 4` : 'waiting'}</span></div>
      <div className="meter"><i style={{ '--v': step / 4 } as React.CSSProperties} /></div>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i + 1 < step || (i + 1 === step && step === 4) ? 'done' : i + 1 === step ? 'now' : undefined}>{s}</li>
        ))}
      </ol>
      <button className="cta" type="button" disabled={busy} onClick={() => void nudge()}>
        {!accountId ? 'Connect wallet' : busy ? 'Signing…' : started ? 'Nudge it along' : 'Open the box'}
      </button>
      {error && <p className="err">{error}</p>}
      <p className="fine">
        {started
          ? 'Coin, pool and liquidity take a few transactions. Anyone can nudge it; each nudge resumes where the last one stopped.'
          : 'Reveal is over. Anyone can open the box: it clears every bid at one price and then builds the coin and the pool.'}
      </p>
    </div>
  );
}
