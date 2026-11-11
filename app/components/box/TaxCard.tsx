import type { CSSProperties } from 'react';
import { clock, formatCoinsM } from '@/lib/format';
import type { LaunchBox } from '@/lib/launchpad';
import { taxRateBps } from '@/lib/math';

type TaxCardProps = { box: LaunchBox; nowNs: number };

/** What every visitor sees on an Open box: how much the dev still holds and what selling now would cost them. */
export function TaxCard({ box, nowNs }: TaxCardProps) {
  const w = { start: BigInt(box.escrow.window_start), end: BigInt(box.escrow.window_end) };
  const rate = w.end > w.start ? Number(taxRateBps(BigInt(Math.floor(nowNs)), w)) / 100 : 0;
  const left = Math.max(0, (box.escrow.window_end - nowNs) / 1e9);
  const ticker = box.meta.ticker.toUpperCase();
  return (
    <section className="card pad">
      <div className="h3"><span>Dev sell tax</span><span>{rate.toFixed(1)}%</span></div>
      <div className="meter"><i style={{ '--v': rate / 90 } as CSSProperties} /></div>
      <div className="est" style={{ marginTop: 10 }}>
        <div><span>Dev holds in escrow</span><b>{formatCoinsM(box.escrow.balance)}M ${ticker}</b></div>
        <div><span>Treasury (kept buybacks)</span><b>{formatCoinsM(box.treasury.reduce((a, d) => a + BigInt(d.remaining), 0n))}M ${ticker}</b></div>
        <div><span>Waiting for holders</span><b>{formatCoinsM(box.coin_pot)}M ${ticker}</b></div>
      </div>
      <p className="fine">
        {left > 0
          ? `If ${box.dev} withdraws in the next ${clock(left)}, ${rate.toFixed(1)}% of it goes to holders. The rate falls to 0% at the end of the window.`
          : `The tax window has ended. ${box.dev} can withdraw tax-free, or start a new window.`}
      </p>
    </section>
  );
}
