'use client';

import { useEffect, useRef } from 'react';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import type { Sample } from '@/hooks/useActivity';
import { fmt } from '@/lib/format';

type ActivityChartProps = { samples: Sample[]; bidders: number; bids: number; note: string };

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Total NEAR in the box over time. lightweight-charts 5 is loaded on the client only. */
export function ActivityChart({ samples, bidders, bids, note }: ActivityChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>(null);
  const setData = useRef<(s: Sample[]) => void>(() => undefined);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    import('lightweight-charts')
      .then(({ createChart, AreaSeries, ColorType }) => {
        if (disposed) return;
        const line = cssVar('--line');
        const green = cssVar('--green');
        const c = createChart(el, {
          layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: cssVar('--muted'), fontFamily: cssVar('--font-mono'), attributionLogo: false },
          grid: { vertLines: { color: line }, horzLines: { color: line } },
          rightPriceScale: { borderVisible: false },
          timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
          handleScroll: false,
          handleScale: false,
          autoSize: true,
        });
        const series = c.addSeries(AreaSeries, {
          lineColor: green,
          topColor: `${green}55`,
          bottomColor: `${green}05`,
          lineWidth: 2,
          priceFormat: { type: 'custom', formatter: (v: number) => `${fmt(v, 1)} Ⓝ` },
        });
        chart.current = c;
        setData.current = (s) => {
          series.setData(s.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
          c.timeScale().fitContent();
        };
        setData.current(samples);
      })
      .catch(() => {
        el.textContent = 'Chart did not load.';
      });
    return () => {
      disposed = true;
      chart.current?.remove();
      chart.current = null;
    };
    // The chart mounts once; data updates go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setData.current(samples);
  }, [samples]);

  return (
    <section className="card">
      <div className="chart-head">
        <span>Box activity</span>
        <span className="mono" style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 12 }}>total NEAR in</span>
      </div>
      <div className="chart" ref={host} />
      <div className="chart-note">
        <span>{note}</span>
        <span>
          {bids} bids · {bidders} bidders
        </span>
      </div>
    </section>
  );
}
