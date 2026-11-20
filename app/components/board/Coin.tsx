'use client';

import { useState } from 'react';
import { tickerHue } from '@/lib/board';

type CoinProps = { image?: string; ticker: string; size?: number | 'fill'; square?: boolean; className?: string };

/** A token's picture drawn as a physical coin (round, with a rim and an edge) or, with `square`, as a tile. No picture, or a link that fails: the ticker's first two letters on a colour taken from the ticker. */
export function Coin({ image, ticker, size = 44, square = false, className }: CoinProps) {
  const [broken, setBroken] = useState(false);
  const show = !!image && !broken;
  return (
    <span
      className={`coin${square ? ' sq' : ''}${className ? ` ${className}` : ''}`}
      style={{ ...(size === 'fill' ? { width: '100%', aspectRatio: '1', fontSize: 'clamp(28px, 5vw, 56px)' } : { width: size, height: size, fontSize: Math.round(size * 0.36) }), ...(show ? null : { background: `hsl(${tickerHue(ticker)} 45% 28%)` }) }}
    >
      {show ? <img src={image} alt="" loading="lazy" onError={() => setBroken(true)} /> : ticker.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** A holding as a stack of that token's own coins, 1 to 6 discs. */
export function CoinStack({ image, ticker, discs, size = 30 }: { image?: string; ticker: string; discs: number; size?: number }) {
  const n = Math.max(1, Math.min(6, Math.round(discs)));
  return (
    <span className="coinstack" style={{ width: size, height: size + (n - 1) * 7 }} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="layer" style={{ bottom: i * 7 }}>{i === n - 1 ? <Coin image={image} ticker={ticker} size={size} /> : <Coin ticker="" size={size} className="blank" />}</span>
      ))}
    </span>
  );
}
