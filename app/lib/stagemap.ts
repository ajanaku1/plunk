import { type BoxState, REVEAL_NS } from '@/lib/launchpad';

/**
 * Which moment of the 22 s film the stage shows for a real box state. The film is a story; the chain keeps its own clock (a bidding room of 2 to 10 min,
 * a fixed 60 s Reveal, an Opening of unknown length), so each act is held, stretched or released by what is really happening. Nothing here invents a number.
 */
export const REST_T = 21.9;
/** Where the live flip to Open joins the film: just before the seal cracks. */
export const FLIP_FROM = 11.2;
/** The held pose while the box is shut and waiting to be opened: seal on, light leaking, not yet cracked. */
export const OPENING_T = 11.35;

export type StageInput = { state: BoxState; nowNs: number; closeAt: number };

/** Scene time for a box that is not mid-flip. Bidding holds the lid just ajar (bids arrive as orbs); Reveal runs the shut-seal-tremor beats across the real 60 s. */
export function stageTime({ state, nowNs, closeAt }: StageInput): number {
  switch (state) {
    case 'bidding':
      return 0.4;
    case 'reveal': {
      const elapsed = Math.min(60, Math.max(0, (nowNs - closeAt) / 1e9));
      // first 2 s: the lid shuts and the seal goes on (6.4 to 7.9); the rest: the tremor builds (7.9 to 11.3)
      return elapsed < 2 ? 6.4 + elapsed * 0.75 : 7.9 + ((elapsed - 2) / (REVEAL_NS / 1e9 - 2)) * 3.4;
    }
    case 'opening':
      return OPENING_T;
    case 'failed':
      return 6.9;
    case 'open':
      return REST_T;
  }
}
