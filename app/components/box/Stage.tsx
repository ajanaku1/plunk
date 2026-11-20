'use client';

import { useEffect, useRef, useState } from 'react';
import { Coin } from '@/components/board/Coin';
import { Tiles } from '@/components/board/Flap';
import { COPY, openingStep } from '@/components/box/Banner';
import { Peek } from '@/components/Peek';
import { useOpenBox } from '@/hooks/useOpenBox';
import { STATE_LABEL, priceText } from '@/lib/board';
import { clock, formatNear, pricePerMillion } from '@/lib/format';
import { type BoxState, type LaunchBox, revealEnd } from '@/lib/launchpad';
import type { Stage as Scene } from '@/lib/stage3d';
import { FLIP_FROM, REST_T, stageTime } from '@/lib/stagemap';
import { TOTAL, captionAt, priceAt } from '@/lib/timeline';

type Mode = { kind: 'live' } | { kind: 'flip'; start: number } | { kind: 'film'; start: number; from: number } | { kind: 'scrub'; t: number };

const FLYERS = 14;
const STEP_LABEL = ['Clearing bids', 'Minting the coin', 'Creating the pool', 'Adding liquidity'];

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
 * real 60 s. Opening: held just before the crack. The moment it opens while you watch, the lid swings and the coins spill; then the stage closes up and the
 * coins travel across to form the price. Latecomers get the compact strip with a Watch button that opens the stage again. Only real numbers are shown.
 * `cinema` fills the screen and plays the film from `startT` for screen recording, with no close-out.
 */
export function Stage({ box, state, nowNs, cinema = false, startT = 0, onExit, onStep, mine, missed }: { box: LaunchBox; state: BoxState; nowNs: number; cinema?: boolean; startT?: number; onExit?: () => void; onStep?: () => Promise<void>; mine?: string; missed?: boolean }) {
  const opener = useOpenBox(box, onStep ?? (async () => {}));
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);
  const mineRef = useRef<HTMLElement>(null);
  const api = useRef<Scene | null>(null);
  const mode = useRef<Mode>({ kind: 'live' });
  const input = useRef({ state, closeAt: box.close_at, step: openingStep(box) });
  input.current = { state, closeAt: box.close_at, step: openingStep(box) };
  const prevState = useRef<BoxState>(state);
  const prevBids = useRef(box.bid_count);
  const collapsedRef = useRef(false);
  const openingSince = useRef(nowNs);
  const reduceRef = useRef(false);
  const [t, setT] = useState(() => stageTime({ state, nowNs, closeAt: box.close_at }));
  const [gl, setGl] = useState(true);
  const [ready, setReady] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  // an open box that was already open when you arrived starts as the compact strip
  const [collapsed, setCollapsedState] = useState(!cinema && state === 'open');
  const [flyers, setFlyers] = useState(0);
  const [hit, setHit] = useState(0);
  const setCollapsed = (v: boolean) => {
    collapsedRef.current = v;
    setCollapsedState(v);
  };
  collapsedRef.current = collapsed;
  const ticker = box.meta.ticker.toUpperCase();
  const final = priceText(pricePerMillion(box.opening?.price ?? '0'));

  useEffect(() => {
    const el = canvas.current;
    const host = wrap.current;
    if (!el || !host) return;
    reduceRef.current = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!hasWebgl()) {
      setGl(false);
      return;
    }
    const reduce = reduceRef.current;
    let off = false;
    let raf = 0;
    let visible = true;
    let lastSet = 0;
    let firstDrawn = false;
    let slow = 0;
    let lastFrame = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
    });
    io.observe(host);
    // the stage animates its own height; resize the scene once it settles, not on every step
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => api.current?.resize(), 120);
    });
    ro.observe(el);
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
          if (!visible || document.hidden || (collapsedRef.current && mode.current.kind === 'live')) {
            lastFrame = 0;
            return;
          }
          // if frames run slow for a stretch, drop the pixel ratio once
          if (lastFrame) {
            const dt = now - lastFrame;
            slow = dt > 40 ? slow + 1 : Math.max(0, slow - 1);
            if (slow > 45) {
              s.setQuality(1);
              slow = -9999;
            }
          }
          lastFrame = now;
          const wall = now / 1000;
          const m = mode.current;
          let tt: number;
          let scripted = false;
          if (m.kind === 'film') {
            tt = m.from + (wall - m.start);
            scripted = true;
            if (tt >= TOTAL) {
              mode.current = { kind: 'live' };
              if (!cinema) closeOut();
            }
          } else if (m.kind === 'flip') {
            tt = FLIP_FROM + (wall - m.start);
            if (tt >= REST_T) {
              mode.current = { kind: 'live' };
              closeOut();
            }
          } else if (m.kind === 'scrub') {
            tt = m.t;
            scripted = true;
          } else {
            const { state: st, closeAt, step } = input.current;
            tt = stageTime({ state: st, nowNs: Date.now() * 1e6, closeAt, step });
            if (st === 'opening' && !reduce) tt += 0.04 * Math.sin(wall * 2.2);
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
      clearTimeout(resizeTimer);
      io.disconnect();
      ro.disconnect();
      api.current?.dispose();
      api.current = null;
    };
    // the scene is built once per stage; live values come in through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state === 'opening') openingSince.current = Date.now() * 1e6;
  }, [state, box.phase]);
  // the strip only belongs to an open box
  useEffect(() => {
    if (state !== 'open' && collapsedRef.current) setCollapsed(false);
  }, [state]);

  // each real bid arcs into the box; the moment the box opens while you watch, the lid swings and the coins spill
  useEffect(() => {
    const add = box.bid_count - prevBids.current;
    prevBids.current = box.bid_count;
    if (add > 0 && state === 'bidding') for (let i = 0; i < Math.min(add, 5); i++) setTimeout(() => api.current?.fireOrb(performance.now() / 1000), i * 220);
  }, [box.bid_count, state]);
  useEffect(() => {
    const before = prevState.current;
    prevState.current = state;
    if (before !== 'open' && before !== 'failed' && state === 'open') {
      if (reduceRef.current) setCollapsed(!cinema);
      else mode.current = { kind: 'flip', start: performance.now() / 1000 };
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

  // the close-out: the stage closes up while the box's coins travel across and land on the price
  function closeOut() {
    const host = wrap.current;
    const price = priceRef.current;
    if (!host || !price) return setCollapsed(true);
    setScrubbing(false);
    setFlyers(FLYERS);
    setCollapsed(true);
    const hr = host.getBoundingClientRect();
    const pr = price.getBoundingClientRect();
    // where the price will sit in the collapsed strip: its right edge stays CLOSED_RIGHT from the stage's right edge
    // with a result of your own, the coins land on that line; otherwise on the price tiles
    const narrow = window.matchMedia('(max-width: 760px)').matches;
    const gapR = narrow ? 14 : 200;
    const gapT = narrow ? 12 : 14;
    const m = mineRef.current?.getBoundingClientRect();
    const endX = m ? hr.width - gapR - (pr.right - (m.left + m.width / 2)) : hr.width - gapR - pr.width / 2;
    const endY = m ? gapT + (m.top + m.height / 2 - pr.top) : gapT + pr.height / 2;
    requestAnimationFrame(() => {
      const els = host.querySelectorAll<HTMLElement>('.flyer');
      els.forEach((el, i) => {
        const sx = hr.width * (0.38 + Math.random() * 0.24);
        const sy = hr.height * (0.6 + Math.random() * 0.12);
        const mx = (sx + endX) / 2 + (Math.random() - 0.5) * 120;
        const my = Math.min(sy, endY) - 70 - Math.random() * 60;
        const a = el.animate(
          [
            { transform: `translate(${sx}px, ${sy}px) scale(1.1)`, opacity: 0 },
            { transform: `translate(${sx}px, ${sy - 14}px) scale(1.1)`, opacity: 1, offset: 0.12 },
            { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${endX}px, ${endY}px) scale(0.45)`, opacity: 1, offset: 0.95 },
            { transform: `translate(${endX}px, ${endY}px) scale(0.2)`, opacity: 0 },
          ],
          { duration: 1000, delay: 250 + i * 70, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' },
        );
        a.onfinish = () => {
          setHit((h) => h + 1);
          if (i === els.length - 1) setTimeout(() => setFlyers(0), 120);
        };
      });
    });
  }

  const expand = () => {
    setCollapsed(false);
    setScrubbing(false);
    mode.current = { kind: 'film', start: performance.now() / 1000, from: 0 };
  };
  const replay = () => {
    setScrubbing(false);
    mode.current = { kind: 'film', start: performance.now() / 1000, from: 0 };
  };
  const [head, rest] = COPY[state];
  const target = state === 'bidding' ? box.close_at : revealEnd(box);
  const left = Math.max(0, Math.ceil((target - nowNs) / 1e9));
  const step = openingStep(box);
  // 'opening' also covers a box whose reveal is over but that nobody has opened yet; only phase Opening is the chain working
  const working = box.phase === 'Opening';
  const waited = Math.max(0, Math.floor((nowNs - openingSince.current) / 1e9));
  const waitText = `${Math.floor(waited / 60)}:${String(waited % 60).padStart(2, '0')}`;
  const isCollapsed = collapsed && state === 'open';
  const showFilm = !isCollapsed && (mode.current.kind === 'film' || mode.current.kind === 'scrub' || mode.current.kind === 'flip');
  const price = priceAt(final, t);
  const filmPrice = showFilm && state === 'open' && price.visible && !price.done;
  const shownPrice = filmPrice ? price.text : final;

  return (
    <section ref={wrap} className={`stage${cinema ? ' cinema' : ''}${isCollapsed ? ' collapsed' : ''}`} data-state={state} aria-label={`${box.meta.name} box, ${STATE_LABEL[state]}`}>
      <canvas ref={canvas} className="stage-gl" style={{ opacity: ready && !isCollapsed ? 1 : 0 }} aria-hidden="true" />
      {(!gl || (!ready && !isCollapsed)) && <div className="stage-flat" aria-hidden="true"><Peek state={state} size={140} /></div>}
      {!cinema && (
        <div className="stage-who">
          <Coin image={box.meta.image || undefined} ticker={ticker} size={44} square />
          <div><b>{box.meta.name} <small>${ticker}</small></b><span className="chip status" data-state={state}>{STATE_LABEL[state]}</span></div>
        </div>
      )}
      <div ref={priceRef} className="stage-clock" data-hit={hit}>
        {(state === 'bidding' || state === 'reveal') && !showFilm && (
          <>
            <span role="timer"><Tiles text={clock(left)} label={`${clock(left)} ${state === 'bidding' ? 'to close' : 'to open'}`} /></span>
            <small>{state === 'bidding' ? 'to close' : 'to open'}</small>
          </>
        )}
        {state === 'opening' && !showFilm && (
          <>
            <div className="stepper" aria-label={working ? `step ${step} of 4` : 'not started'}>{[1, 2, 3, 4].map((n) => <i key={n} className={working && n <= step ? 'done' : undefined} />)}</div>
            <small>{working ? `opening, step ${step} of 4` : 'reveal over, not opened yet'}</small>
          </>
        )}
        {state === 'open' && (isCollapsed || !showFilm || price.visible) && (
          <>
            <Tiles text={shownPrice} label={`${final} NEAR per 1M`} className={filmPrice ? undefined : 'lk'} />
            <small>
              {filmPrice ? 'The price, unlocking' : 'NEAR per 1M. Everyone paid this.'}
              {mine && !filmPrice && <b ref={mineRef} className="mine">You got {mine} ${ticker}</b>}
              {missed && !mine && !filmPrice && <b className="mine miss">Your bid didn&apos;t clear. Claim your refund.</b>}
            </small>
          </>
        )}
      </div>
      <div className="stage-cap">
        {showFilm && state === 'open' ? (
          <p className="cap" aria-live="off">{captionAt(t)}</p>
        ) : (
          <p className="cap"><b>{head}</b> <span>{state === 'opening' ? (working ? `Step ${step} of 4: ${STEP_LABEL[step - 1]}. Each step is a transaction on the chain.` : 'The reveal is over. Anyone can open the box from the Opening panel; it then takes a few transactions.') : rest}</span></p>
        )}
        {state === 'opening' && !showFilm && !cinema && onStep && (
          <p className="stage-open">
            <button className="cta" type="button" disabled={opener.busy} onClick={() => void opener.nudge()}>{opener.label}</button>
            {opener.error && <span className="err">{opener.error}</span>}
          </p>
        )}
        {state === 'opening' && !showFilm && (working ? <p className="nums mono working">working on the chain · {waitText}</p> : <p className="nums mono">waiting for someone to open it</p>)}
        {state !== 'failed' && state !== 'opening' && <p className="nums mono">{box.bid_count} {box.bid_count === 1 ? 'bid' : 'bids'} · {box.bidder_count} {box.bidder_count === 1 ? 'bidder' : 'bidders'} · {formatNear(box.total_in, 1)} Ⓝ in the box</p>}
      </div>
      {state === 'open' && !cinema && (
        <div className="stage-ctl">
          {isCollapsed ? (
            <button type="button" onClick={expand}>Watch the opening</button>
          ) : (
            <>
              <button type="button" onClick={replay}>Replay</button>
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
              <button type="button" onClick={() => { mode.current = { kind: 'live' }; closeOut(); }}>Close</button>
            </>
          )}
        </div>
      )}
      {Array.from({ length: flyers }, (_, i) => (
        <span key={i} className="flyer" aria-hidden="true"><Coin image={box.meta.image || undefined} ticker={ticker} size={30} /></span>
      ))}
      {cinema && <p className="stage-hint">Esc to leave</p>}
    </section>
  );
}
