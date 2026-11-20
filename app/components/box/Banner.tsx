import type { ReactNode } from 'react';
import { Tiles } from '@/components/board/Flap';
import { PeekBox } from '@/components/board/PeekBox';
import { clock } from '@/lib/format';
import { type BoxState, type LaunchBox, revealEnd } from '@/lib/launchpad';

type BannerProps = { box: LaunchBox; state: BoxState; nowNs: number; extra?: ReactNode };

const COPY: Record<BoxState, [string, string]> = {
  bidding: ['Bidding is open.', 'Everyone who gets in pays the same clearing price. No price is visible to anyone until the box shuts.'],
  reveal: ['Box shut.', 'Sealed bids are unlocking automatically. Nothing to do on your side.'],
  opening: ['Opening.', 'Clearing, coin, pool and liquidity take a few transactions.'],
  open: ['Open.', 'Cleared at one price. Liquidity is locked forever. Claims are live.'],
  failed: ['Failed.', 'The minimum was not reached. Every bid is refunded in full. No coin, no pool.'],
};

export function openingStep(box: LaunchBox): number {
  const o = box.opening;
  if (!o) return 1;
  if (BigInt(o.shares) > 0n) return 4;
  if (o.pool_id !== null) return 3;
  if (o.coin_ready) return 2;
  return 1;
}

export function Banner({ box, state, nowNs, extra }: BannerProps) {
  const [head, rest] = COPY[state];
  const target = state === 'bidding' ? box.close_at : revealEnd(box);
  const left = Math.ceil((target - nowNs) / 1e9);
  const step = openingStep(box);
  return (
    <div className="banner gutter" data-state={state}>
      <div className="in">
        <PeekBox state={state} size={88} pulse={box.bid_count} />
        <div className="msg">
          <b>{head}</b> <span>{rest}</span>
        </div>
        {(state === 'bidding' || state === 'reveal') && (
          <div className="count" role="timer">
            <Tiles text={clock(left)} />
            <small>{state === 'bidding' ? 'to close' : 'to open'}</small>
          </div>
        )}
        {extra}
        {state === 'opening' && box.phase === 'Opening' && (
          <div className="stepper" aria-label={`step ${step} of 4`}>
            {[1, 2, 3, 4].map((n) => (
              <i key={n} className={n <= step ? 'done' : undefined} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
