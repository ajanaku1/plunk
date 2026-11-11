'use client';

import { useEffect, useRef, useState } from 'react';
import type { Tick } from '@/hooks/useReserves';
import { fmt, formatCoinsM, formatNear, toNumber } from '@/lib/format';
import type { LaunchBox } from '@/lib/launchpad';

type FeedItem = { time: number; kind: 'buy' | 'sell' | 'dev' | 'harvest'; text: string; amount: string };
type TradesFeedProps = { box: LaunchBox; ticks: Tick[] };

/** Trades inferred from reserve changes between polls: coin reserve down = buy, up = sell. */
function tradesFrom(ticks: Tick[], ticker: string): FeedItem[] {
  const out: FeedItem[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const a = ticks[i - 1].reserves;
    const b = ticks[i].reserves;
    if (b.y < a.y) out.push({ time: ticks[i].time, kind: 'buy', text: `Buy · ${formatCoinsM(a.y - b.y)}M $${ticker}`, amount: `${formatNear(b.x - a.x, 2)} Ⓝ` });
    else if (b.y > a.y) out.push({ time: ticks[i].time, kind: 'sell', text: `Sell · ${formatCoinsM(b.y - a.y)}M $${ticker}`, amount: `${formatNear(a.x - b.x, 2)} Ⓝ` });
  }
  return out;
}

/** Dev withdrawals and harvests show up as escrow, pot, treasury and snapshot changes between box polls. */
function useBoxEvents(box: LaunchBox): FeedItem[] {
  const prev = useRef(box);
  const [items, setItems] = useState<FeedItem[]>([]);
  useEffect(() => {
    const p = prev.current;
    prev.current = box;
    const now = Math.floor(Date.now() / 1000);
    const ticker = box.meta.ticker.toUpperCase();
    const fresh: FeedItem[] = [];
    const taken = BigInt(p.escrow.balance) - BigInt(box.escrow.balance);
    const pot = BigInt(box.coin_pot) - BigInt(p.coin_pot);
    if (taken > 0n) fresh.push({ time: now, kind: 'dev', text: `The dev got plunked · ${formatCoinsM(pot > 0n ? pot : 0n)}M $${ticker} to holders`, amount: `${fmt((Number(pot) / Number(taken)) * 100, 1)}% tax` });
    if (box.last_harvest_epoch > p.last_harvest_epoch) fresh.push({ time: now, kind: 'harvest', text: 'Harvest · fees split 20 / 5 / 75', amount: `epoch ${box.last_harvest_epoch}` });
    if (fresh.length) setItems((xs) => [...fresh, ...xs].slice(0, 50));
  }, [box]);
  return items;
}

export function TradesFeed({ box, ticks }: TradesFeedProps) {
  const ticker = box.meta.ticker.toUpperCase();
  const events = useBoxEvents(box);
  const items = [...tradesFrom(ticks, ticker), ...events].sort((a, b) => b.time - a.time).slice(0, 30);
  return (
    <section className="card">
      <div className="chart-head"><span>Activity</span><span className="mono" style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)' }}>live · since you opened this page</span></div>
      {items.length === 0 ? (
        <div className="empty">Trades and dev withdrawals appear here as they happen. Pool price now: {ticks.length ? fmt(ticks[ticks.length - 1].price, 4) : '—'} Ⓝ per 1M.</div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <tbody>
              {items.map((it, i) => (
                <tr key={`${it.time}-${i}`}>
                  <td style={{ color: 'var(--muted)' }}>{new Date(it.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td><span className={`tag ${it.kind === 'buy' ? 'market' : it.kind === 'sell' ? 'xchain' : 'sealed'}`}>{it.kind}</span></td>
                  <td>{it.text}</td>
                  <td className="r">{it.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="chart-note"><span>{toNumber(box.total_in) > 0 ? `Pool #${box.opening?.pool_id ?? '—'}` : ''}</span><span>polled every 15 s</span></div>
    </section>
  );
}
