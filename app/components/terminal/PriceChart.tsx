'use client';

import { useEffect, useRef, useState } from 'react';
import type { IChartApi, UTCTimestamp } from 'lightweight-charts';
import type { Tick } from '@/hooks/useReserves';
import { fmt } from '@/lib/format';
import { type Candle, candlesFrom } from '@/lib/pool';

type PriceChartProps = { boxId: number; ticks: Tick[]; ticker: string; poolLabel: string };

const MIN_CANDLES = 24;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Hourly candles from harvest snapshots (server route) plus the live tail polled from the pool. */
function useCandles(boxId: number, ticks: Tick[]): { candles: Candle[]; source: string } {
  const [base, setBase] = useState<{ candles: Candle[]; source: string }>({ candles: [], source: '' });
  useEffect(() => {
    fetch(`/api/candles?box=${boxId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { candles: Candle[]; source: string }) => setBase(j))
      .catch(() => setBase({ candles: [], source: 'live only' }));
  }, [boxId]);
  const lastHour = base.candles[base.candles.length - 1]?.time ?? 0;
  const tail = candlesFrom(ticks.filter((t) => t.time > lastHour).map((t) => ({ time: t.time, price: t.price })));
  return { candles: [...base.candles, ...tail], source: base.source };
}

export function PriceChart({ boxId, ticks, ticker, poolLabel }: PriceChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi>(null);
  const setData = useRef<(c: Candle[]) => void>(() => undefined);
  const { candles, source } = useCandles(boxId, ticks);
  const last = candles[candles.length - 1];

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    import('lightweight-charts')
      .then(({ createChart, CandlestickSeries, AreaSeries, ColorType }) => {
        if (disposed) return;
        const line = cssVar('--line');
        const green = cssVar('--green');
        const c = createChart(el, {
          layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: cssVar('--muted'), fontFamily: cssVar('--font-mono'), attributionLogo: false },
          grid: { vertLines: { color: line }, horzLines: { color: line } },
          rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.15 } },
          timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 2, minBarSpacing: 4 },
          autoSize: true,
        });
        const format = { type: 'price' as const, precision: 4, minMove: 0.0001 };
        // Too few points make candlesticks read as one slab, so a young pool shows a line until it has a day of hours.
        const candlesSeries = c.addSeries(CandlestickSeries, { upColor: green, downColor: cssVar('--bad'), wickUpColor: green, wickDownColor: cssVar('--bad'), borderVisible: false, priceFormat: format });
        const lineSeries = c.addSeries(AreaSeries, { lineColor: green, topColor: `${green}44`, bottomColor: `${green}05`, lineWidth: 2, priceFormat: format });
        chart.current = c;
        setData.current = (data) => {
          const useCandles = data.length >= MIN_CANDLES;
          candlesSeries.setData(useCandles ? data.map((k) => ({ ...k, time: k.time as UTCTimestamp })) : []);
          lineSeries.setData(useCandles ? [] : data.map((k) => ({ time: k.time as UTCTimestamp, value: k.close })));
          c.timeScale().fitContent();
        };
        setData.current(candles);
      })
      .catch(() => {
        el.textContent = 'Chart did not load.';
      });
    return () => {
      disposed = true;
      chart.current?.remove();
      chart.current = null;
    };
    // mount once; data flows through the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setData.current(candles);
  }, [candles]);

  return (
    <section className="card">
      <div className="chart-head">
        <span>Price · NEAR per 1M ${ticker}</span>
        <span className="mono" style={{ fontWeight: 600 }}>{last ? fmt(last.close, 4) : '—'}</span>
      </div>
      <div className="chart" ref={host} />
      <div className="chart-note">
        <span>{poolLabel}</span>
        <span>{source === 'harvest-snapshots' ? 'hourly from harvests · live every 15 s' : 'live every 15 s while this page is open'}</span>
      </div>
    </section>
  );
}
