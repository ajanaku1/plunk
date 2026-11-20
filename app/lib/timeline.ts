/**
 * The opening ceremony's choreography as plain functions of time, so it can be checked without a GPU.
 * Every animated value is a track of "go to X over D seconds from T" steps; a later step starts from wherever the earlier one had got to.
 */
export type Ease = 'none' | 'p1io' | 'p2io' | 'p2in' | 'p2out' | 'p3in' | 'bounce' | 'back';
export type Step = { t: number; to: number; dur: number; ease?: Ease };
export type Track = { init: number; steps: Step[] };

const bounceOut = (k: number): number => {
  const n = 7.5625;
  const d = 2.75;
  if (k < 1 / d) return n * k * k;
  if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
  if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
  return n * (k -= 2.625 / d) * k + 0.984375;
};

export const EASE: Record<Ease, (k: number) => number> = {
  none: (k) => k,
  p1io: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  p2io: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  p2in: (k) => k * k * k,
  p2out: (k) => 1 - Math.pow(1 - k, 3),
  p3in: (k) => k * k * k * k,
  bounce: bounceOut,
  back: (k) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
};

export function valueAt(track: Track, t: number): number {
  let v = track.init;
  for (let i = 0; i < track.steps.length; i++) {
    const s = track.steps[i]!;
    if (t < s.t) break;
    const from = i === 0 ? track.init : valueAt({ init: track.init, steps: track.steps.slice(0, i) }, s.t);
    const k = s.dur === 0 ? 1 : Math.min(1, (t - s.t) / s.dur);
    v = from + (s.to - from) * EASE[s.ease ?? 'p2io'](k);
  }
  return v;
}

export const TOTAL = 22;
/** Where a live opening joins the sequence: the seal has just been pressed on. */
export const LIVE_START = 7.3;

const T = (init: number, ...steps: Step[]): Track => ({ init, steps });
const s = (t: number, to: number, dur: number, ease: Ease = 'p2io'): Step => ({ t, to, dur, ease });

/** Camera, lid, seal, light and shake over the 22 s. Times match the approved prototype (ceremony.html). */
export const TRACKS = {
  orbit: T(0.55, s(0, 0.38, 6.4, 'none'), s(7.4, 0.25, 4.2, 'p1io'), s(11.2, 0.1, 1.1), s(12.8, -0.3, 5.2), s(18, -0.45, 4, 'none')),
  camD: T(3.3, s(0, 3.0, 6.4, 'none'), s(7.4, 2.2, 4.2, 'p1io'), s(11.2, 3.7, 1.1), s(12.8, 4.0, 5.2), s(18, 3.5, 4, 'none')),
  camY: T(1.5, s(7.4, 1.0, 4.2, 'p1io'), s(11.2, 1.55, 1.1), s(12.8, 1.9, 5.2), s(18, 1.75, 4, 'none')),
  camTY: T(-0.12, s(7.4, -0.05, 4.2, 'p1io'), s(11.2, 0.32, 1.1), s(12.8, 0.1, 5.2), s(18, 0.12, 4, 'none')),
  lid: T(0.16, s(6.4, 0, 0.55, 'p2in'), s(11.8, 1.85, 0.9, 'back')),
  hop: T(0, s(6.95, 1, 0), s(6.95, 0, 0.5, 'p2out')),
  sealY: T(0.6, s(7.3, 0, 0.45, 'bounce')),
  shake: T(0, s(7.8, 1, 3.6, 'p2in'), s(11.75, 0, 0)),
  leak: T(0, s(7.8, 0.9, 3.6, 'p2in'), s(11.2, 1.6, 0.5, 'p3in'), s(12.2, 0, 1.6, 'p2out')),
  inner: T(0, s(7.8, 1, 3.6, 'p2in'), s(12.2, 0.35, 1.6, 'p2out')),
  bloom: T(0, s(7.8, 0.55, 3.6, 'p2in'), s(11.2, 1.1, 0.5, 'p3in'), s(12.2, 0.25, 1.6, 'p2out')),
} as const;

export type Pose = { [K in keyof typeof TRACKS]: number } & { crack: number };

export function poseAt(t: number): Pose {
  const p = {} as Record<string, number>;
  for (const k of Object.keys(TRACKS) as (keyof typeof TRACKS)[]) p[k] = valueAt(TRACKS[k], t);
  p.crack = t >= 11.75 ? 1 : 0;
  return p as Pose;
}

export const SEAL_ON = 7.3;
export const SEAL_CRACK = 11.75;
export const COINS_AT = 12.35;
export const PRICE_AT = 12.9;
export const LOCK_EVERY = 0.32;

export const CAPTIONS: [number, string][] = [
  [0, 'Bids go in. Nobody can see a price.'],
  [6.4, 'The box shuts.'],
  [7.5, 'Sealed. Nothing moves.'],
  [9.4, 'Every sealed price is unlocking.'],
  [11.8, 'The seal breaks.'],
  [13.2, 'One price, found.'],
];
export const PHASES: [string, number][] = [['Bids in', 0], ['Shut', 6.4], ['Sealed', 7.3], ['Tremor', 8.4], ['Open', 11.75], ['Coins', 12.4], ['Price', 13.2]];

export function captionAt(t: number): string {
  let out = CAPTIONS[0]![1];
  for (const [ct, text] of CAPTIONS) if (t >= ct) out = text;
  return out;
}

/** Which phase is lit at time t. */
export function phaseAt(t: number): number {
  let idx = 0;
  PHASES.forEach(([, pt], i) => {
    if (t >= pt) idx = i;
  });
  return idx;
}

const noise = (i: number, frame: number): number => {
  const x = Math.sin((i + 1) * 12.9898 + frame * 78.233) * 43758.5453;
  return ((x % 1) + 1) % 1;
};

/** The price while it unlocks: digits not yet locked flicker, then settle left to right, one every 0.32 s from 12.9 s. Before 8.2 s nothing shows. */
export function priceAt(final: string, t: number): { text: string; locked: number; done: boolean; visible: boolean } {
  const digits = final.replace('.', '').length;
  const locked = t < PRICE_AT ? 0 : Math.min(digits, Math.floor((t - PRICE_AT) / LOCK_EVERY) + 1);
  let seen = 0;
  let text = '';
  for (let i = 0; i < final.length; i++) {
    const ch = final[i]!;
    if (ch === '.') {
      text += '.';
      continue;
    }
    text += seen < locked ? ch : String(Math.floor(noise(i, Math.floor(t * 4)) * 10));
    seen++;
  }
  return { text, locked, done: locked >= digits, visible: t >= 8.2 };
}
