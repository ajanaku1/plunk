'use client';

import { useEffect, useRef, useState } from 'react';
import { Coin } from '@/components/board/Coin';
import { Tiles } from '@/components/board/Flap';
import { COPY, openingStep } from '@/components/box/Banner';
import { Peek } from '@/components/Peek';
import { STATE_LABEL, priceText } from '@/lib/board';
import { clock, formatNear, pricePerMillion } from '@/lib/format';
import { type BoxState, type LaunchBox, revealEnd } from '@/lib/launchpad';
import type { Stage as Scene } from '@/lib/stage3d';
import { FLIP_FROM, OPENING_T, REST_T, stageTime } from '@/lib/stagemap';
import { TOTAL, captionAt, priceAt } from '@/lib/timeline';

type Mode = { kind: 'live' } | { kind: 'flip'; start: number } | { kind: 'film'; start: number; from: number } | { kind: 'scrub'; t: number };

function hasWebgl(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * The top of the Room: a stage showing the box as it really is. Bidding: the lid sits ajar and each real bid arcs in. Reveal: shut, sealed, trembling for the
 * real 60 s. Opening: held just before the crack. The moment it opens while you watch, the lid swings and the coins spill. Latecomers land on the open frame
 * and can scrub or replay the whole film in place. Only real numbers are shown. `cinema` fills the screen and plays the film from `startT` for screen recording.
 */
export function Stage({ box, state, nowNs, cinema = false, startT = 0, onExit }: { box: LaunchBox; state: BoxState; nowNs: number; cinema?: boolean; startT?: number; onExit?: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<Scene | null>(null);
  const mode = useRef<Mode>({ kind: 'live' });
  const input = useRef({ state, closeAt: box.close_at });
  input.current = { state, closeAt: box.close_at };
  const prevState = useRef<BoxState>(state);
  const prevBids = useRef(box.bid_count);
  const [t, setT] = useState(() => stageTime({ state, nowNs, closeAt: box.close_at }));
  const [gl, setGl] = useState(true);
  const [ready, setReady] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const ticker = box.meta.ticker.toUpperCase();
  const final = priceText(pricePerMillion(box.opening?.price ?? '0'));

  useEffect(() => {
    const el = canvas.current;
    const host = wrap.current;
    if (!el || !host) return;
    if (!hasWebgl()) {
      setGl(false);
      return;
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let off = false;
    let raf = 0;
    let visible = true;
    let lastSet = 0;
    let firstDrawn = false;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
    });
    io.observe(host);
    const ro = new ResizeObserver(() => api.current?.resize());
    ro.observe(host);
    void import('@/lib/stage3d')
      .then(async ({ createStage }) => {
        const s = await createStage({ canvas: el, image: box.meta.image || undefined, ticker: box.meta.ticker, bidders: box.bidder_count });
        if (off) return s.dispose();
        api.current = s;
        s.resize();
        if (cinema && input.current.state === 'open' && !reduce) mode.current = { kind: 'film', start: performance.now() / 1000, from: startT };
        const frame = (now: number) => {
          if (off) return;
          raf = requestAnimationFrame(frame);
          if (!visible || document.hidden) return;
          const wall = now / 1000;
          const m = mode.current;
          let tt: number;
          let scripted = false;
          if (m.kind === 'film') {
            tt = m.from + (wall - m.start);
            scripted = true;
            if (tt >= TOTAL) mode.current = { kind: 'live' };
          } else if (m.kind === 'flip') {
            tt = FLIP_FROM + (wall - m.start);
            if (tt >= REST_T) mode.current = { kind: 'live' };
          } else if (m.kind === 'scrub') {
            tt = m.t;
            scripted = true;
          } else {
            const { state: st, closeAt } = input.current;
            tt = stageTime({ state: st, nowNs: Date.now() * 1e6, closeAt });
            if (st === 'opening' && !reduce) tt = OPENING_T + 0.04 * Math.sin(wall * 2.2);
          }
          tt = Math.min(tt, TOTAL - 0.01);
          s.render(tt, wall, scripted);
          if (!firstDrawn) {
            firstDrawn = true;
            setReady(true);
          }
          if (now - lastSet > 100) {
            lastSet = now;
            setT(tt);
          }
        };
        raf = requestAnimationFrame(frame);
      })
      .catch(() => setGl(false));
    return () => {
      off = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      api.current?.dispose();
      api.current = null;
    };
    // the scene is built once per stage; live values come in through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // each real bid arcs into the box; the moment the box opens while you watch, the lid swings and the coins spill
  useEffect(() => {
    const add = box.bid_count - prevBids.current;
    prevBids.current = box.bid_count;
    if (add > 0 && state === 'bidding') for (let i = 0; i < Math.min(add, 5); i++) setTimeout(() => api.current?.fireOrb(performance.now() / 1000), i * 220);
  }, [box.bid_count, state]);
  useEffect(() => {
    const before = prevState.current;
    prevState.current = state;
    if (before !== 'open' && before !== 'failed' && state === 'open' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      mode.current = { kind: 'flip', start: performance.now() / 1000 };
      setScrubbing(false);
    }
  }, [state]);
  useEffect(() => {
    if (!cinema) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit?.();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [cinema, onExit]);

  const playing = mode.current.kind === 'film' || mode.current.kind === 'flip' || scrubbing;
  const replay = () => {
    setScrubbing(false);
    mode.current = { kind: 'film', start: performance.now() / 1000, from: 0 };
  };
  const [head, rest] = COPY[state];
  const target = state === 'bidding' ? box.close_at : revealEnd(box);
  const left = Math.max(0, Math.ceil((target - nowNs) / 1e9));
  const step = openingStep(box);
  const showFilm = mode.current.kind === 'film' || mode.current.kind === 'scrub' || mode.current.kind === 'flip';
  const price = priceAt(final, t);
  const filmPrice = showFilm && state === 'open' && price.visible && !price.done;
  const shownPrice = filmPrice ? price.text : final;

  return (
    <section ref={wrap} className={`stage${cinema ? ' cinema' : ''}`} data-state={state} aria-label={`${box.meta.name} box, ${STATE_LABEL[state]}`}>
      <canvas ref={canvas} className="stage-gl" style={{ opacity: ready ? 1 : 0 }} aria-hidden="true" />
      {(!gl || !ready) && <div className="stage-flat" aria-hidden="true"><Peek state={state} size={140} /></div>}
      {!cinema && (
        <div className="stage-who">
          <Coin image={box.meta.image || undefined} ticker={ticker} size={44} square />
          <div><b>{box.meta.name} <small>${ticker}</small></b><span className="chip status" data-state={state}>{STATE_LABEL[state]}</span></div>
        </div>
      )}
      <div className="stage-clock">
        {(state === 'bidding' || state === 'reveal') && !showFilm && (
          <>
            <span role="timer"><Tiles text={clock(left)} label={`${clock(left)} ${state === 'bidding' ? 'to close' : 'to open'}`} /></span>
            <small>{state === 'bidding' ? 'to close' : 'to open'}</small>
          </>
        )}
        {state === 'opening' && !showFilm && (
          <>
            <div className="stepper" aria-label={`step ${step} of 4`}>{[1, 2, 3, 4].map((n) => <i key={n} className={n <= step ? 'done' : undefined} />)}</div>
            <small>opening, step {step} of 4</small>
          </>
        )}
        {(state === 'open' || (showFilm && price.visible)) && state === 'open' && (
          <>
            <Tiles text={shownPrice} label={`${final} NEAR per 1M`} className={filmPrice ? undefined : 'lk'} />
            <small>{filmPrice ? 'The price, unlocking' : 'NEAR per 1M. Everyone paid this.'}</small>
          </>
        )}
      </div>
      <div className="stage-cap">
        {showFilm && state === 'open' ? (
          <p className="cap" aria-live="off">{captionAt(t)}</p>
        ) : (
          <p className="cap"><b>{head}</b> <span>{rest}</span></p>
        )}
        {state !== 'failed' && <p className="nums mono">{box.bid_count} {box.bid_count === 1 ? 'bid' : 'bids'} · {box.bidder_count} {box.bidder_count === 1 ? 'bidder' : 'bidders'} · {formatNear(box.total_in, 1)} Ⓝ in the box</p>}
      </div>
      {state === 'open' && !cinema && (
        <div className="stage-ctl">
          <button type="button" onClick={replay} disabled={mode.current.kind === 'film'}>{mode.current.kind === 'film' ? 'Playing…' : 'Replay the opening'}</button>
          <label className="scrub">
            <span className="sr">Scrub the opening</span>
            <input
              type="range"
              min={0}
              max={TOTAL - 0.01}
              step={0.01}
              value={mode.current.kind === 'live' && !scrubbing ? REST_T : t}
              onChange={(e) => {
                setScrubbing(true);
                mode.current = { kind: 'scrub', t: Number(e.target.value) };
              }}
            />
          </label>
          {(scrubbing || playing) && <button type="button" onClick={() => { setScrubbing(false); mode.current = { kind: 'live' }; }}>Back to now</button>}
        </div>
      )}
      {cinema && <p className="stage-hint">Esc to leave</p>}
    </section>
  );
}
