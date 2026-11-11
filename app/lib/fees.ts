/**
 * What a box's trading fee turns into, per data-model.md: Rhea keeps 20% of the gross,
 * the protocol 5%, the dev 75%; the dev's part is divided by `split` (bps, sums to 10000).
 * Figures are in bps of each trade so the UI can show them net of the DEX share (FR-021).
 */
import type { Split } from '@/lib/launchpad';

export const ALL_DEV: Split = { dev: 10_000, holders: 0, buyback_burn: 0, buyback_keep: 0 };

export type FeeBreakdown = {
  grossBps: number;
  rheaBps: number;
  protocolBps: number;
  devShareBps: number;
  buckets: { dev: number; holders: number; buyback_burn: number; buyback_keep: number };
};

export function breakdown(grossBps: number, split: Split): FeeBreakdown {
  const devShareBps = (grossBps * 75) / 100;
  const part = (bps: number) => (devShareBps * bps) / 10_000;
  return {
    grossBps,
    rheaBps: (grossBps * 20) / 100,
    protocolBps: (grossBps * 5) / 100,
    devShareBps,
    buckets: {
      dev: part(split.dev),
      holders: part(split.holders),
      buyback_burn: part(split.buyback_burn),
      buyback_keep: part(split.buyback_keep),
    },
  };
}

export function splitIsValid(s: Split): boolean {
  const vals = [s.dev, s.holders, s.buyback_burn, s.buyback_keep];
  return vals.every((v) => Number.isInteger(v) && v >= 0) && vals.reduce((a, b) => a + b, 0) === 10_000;
}

export function pct(bps: number, digits = 2): string {
  return `${(bps / 100).toFixed(digits).replace(/\.?0+$/, '')}%`;
}
