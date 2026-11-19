'use client';

import { useEffect, useRef, useState } from 'react';

/** One split-flap tile. When `ch` changes the old top half folds down and the new bottom half folds in (CSS in styles/board.css). */
function Flap({ ch, sealed }: { ch: string; sealed?: boolean }) {
  const shown = useRef(ch);
  const [prev, setPrev] = useState(ch);
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (shown.current === ch) return;
    setPrev(shown.current);
    shown.current = ch;
    setTurn((n) => n + 1);
    const t = setTimeout(() => setPrev(ch), 340);
    return () => clearTimeout(t);
  }, [ch]);
  const flipping = prev !== ch;
  return (
    <span className={`flap${sealed ? ' sealed' : ''}`} aria-hidden="true">
      <span className="t"><i>{ch}</i></span>
      <span className="b"><i>{flipping ? prev : ch}</i></span>
      {flipping && (
        <>
          <span key={`t${turn}`} className="ft"><i>{prev}</i></span>
          <span key={`b${turn}`} className="fb"><i>{ch}</i></span>
        </>
      )}
    </span>
  );
}

const PLAIN = /[:.\s·+\-%/]/;

/** A row of flip tiles for `text`. Punctuation is drawn plain. The row has one spoken label so screen readers do not read tile by tile. */
export function Tiles({ text, label, sealed, className }: { text: string; label?: string; sealed?: boolean; className?: string }) {
  return (
    <span className={`tiles${className ? ` ${className}` : ''}`} role="img" aria-label={sealed ? 'Sealed price, hidden until the box opens' : (label ?? text)}>
      {[...text].map((c, i) => (PLAIN.test(c) ? <span key={i} className="fx" aria-hidden="true">{c}</span> : <Flap key={i} ch={c} sealed={sealed} />))}
    </span>
  );
}

/** Digits that never settle: the price of a box that has not opened is not known to anyone, so the tiles scramble and stay frosted. */
export function SealedPrice({ digits = 4 }: { digits?: number }) {
  const [text, setText] = useState(`0.${'0'.repeat(digits)}`);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const roll = () => {
      if (!alive) return;
      setText((cur) => `0.${[...cur.slice(2)].map((d) => (Math.random() < 0.35 ? String(Math.floor(Math.random() * 10)) : d)).join('')}`);
      t = setTimeout(roll, 700 + Math.random() * 1200);
    };
    roll();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [digits]);
  return <Tiles text={text} sealed />;
}
