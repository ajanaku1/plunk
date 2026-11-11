'use client';

import Link from 'next/link';
import { formatNear } from '@/lib/format';
import { type BoxState, type LaunchBox, stateOf } from '@/lib/launchpad';

/** The protocol at a glance, from the box list alone (no indexer). */
export function StatsStrip({ boxes, nowNs }: { boxes: LaunchBox[]; nowNs: number }) {
  let raised = 0n;
  let live = 0;
  let trading = 0;
  for (const b of boxes) {
    const s = stateOf(b, nowNs);
    if (s === 'open') {
      trading++;
      raised += BigInt(b.opening?.accepted_total ?? '0');
    } else if (s !== 'failed') live++;
  }
  return (
    <div className="stats">
      <div><small>Boxes</small><b>{boxes.length}</b></div>
      <div><small>Live now</small><b>{live}</b></div>
      <div><small>Coins trading</small><b>{trading}</b></div>
      <div><small>NEAR raised</small><b>{formatNear(raised, 1)} Ⓝ</b></div>
    </div>
  );
}

const STEPS = [
  { n: '01', t: 'Plunk NEAR in', d: 'Set a budget, optionally a max price. Nobody sees a price while the room is open.' },
  { n: '02', t: 'The box opens', d: 'One clearing price for everyone. Bids below it are refunded in full.' },
  { n: '03', t: 'Trade and earn', d: 'Liquidity is locked forever. Fees and the dev sell tax flow to holders every hour.' },
] as const;

export function HowItWorks() {
  return (
    <section className="how">
      {STEPS.map((s) => (
        <div key={s.n} className="card pad">
          <span className="num">{s.n}</span>
          <b>{s.t}</b>
          <p>{s.d}</p>
        </div>
      ))}
      <Link className="card pad more" href="/docs"><b>How Plunk works →</b><p>Fees, the dev tax, rewards, and what to know before you bid.</p></Link>
    </section>
  );
}

export const SORTS = ['newest', 'raised', 'closing'] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABEL: Record<Sort, string> = { newest: 'Newest', raised: 'Most raised', closing: 'Closing soon' };

const RANK: Record<BoxState, number> = { bidding: 0, reveal: 1, opening: 2, open: 3, failed: 4 };

export function sortBoxes(boxes: LaunchBox[], sort: Sort, nowNs: number): LaunchBox[] {
  const out = [...boxes];
  if (sort === 'raised') out.sort((a, b) => Number(BigInt(b.total_in) - BigInt(a.total_in)));
  if (sort === 'closing') out.sort((a, b) => RANK[stateOf(a, nowNs)] - RANK[stateOf(b, nowNs)] || a.close_at - b.close_at);
  return out;
}

export function matchesQuery(box: LaunchBox, q: string): boolean {
  const s = q.trim().toLowerCase().replace(/^\$/, '');
  if (!s) return true;
  return box.meta.name.toLowerCase().includes(s) || box.meta.ticker.includes(s) || String(box.id) === s || box.dev.includes(s);
}
