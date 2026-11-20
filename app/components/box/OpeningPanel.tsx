'use client';

import { openingStep } from '@/components/box/Banner';
import { useOpenBox } from '@/hooks/useOpenBox';
import type { LaunchBox } from '@/lib/launchpad';

type OpeningPanelProps = { box: LaunchBox; onStep: () => Promise<void> };

const STEPS = ['Clearing bids', 'Minting the coin', 'Creating the pool', 'Adding liquidity'];

/** Past Reveal: anyone may call `open`; while Opening, `retry_open` carries on (FR-014). */
export function OpeningPanel({ box, onStep }: OpeningPanelProps) {
  const { nudge, busy, error, label, started } = useOpenBox(box, onStep);
  const step = started ? openingStep(box) : 0;

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
        {label}
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
