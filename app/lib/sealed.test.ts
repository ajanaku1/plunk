import { describe, expect, it } from 'vitest';
import { commitHash, readU128le, roundForClose, u128le } from './sealed';
import { breakdown, pct, splitIsValid } from './fees';
import { parseNear, parsePricePerMillion, pricePerMillion } from './format';

// Vector computed independently in Python (sha256 of the R10 preimage) for the same inputs
// as contracts/launchpad/src/bids.rs::commit_hash. Changing either side must break this test.
describe('commit (R10)', () => {
  it('matches the reference vector', async () => {
    const commit = await commitHash({
      boxId: 12,
      account: 'ribbit.testnet',
      maxPrice: 400_000_000_000_000_000n,
      salt: new Uint8Array(32).fill(3),
    });
    expect(commit).toBe('ed9191305521a897f68a87ae03e0638651b0bafb2ab269c5c81218a5a1f82146');
  });

  it('u128 little-endian round-trips at the extremes', () => {
    for (const v of [0n, 1n, 2n ** 64n - 1n, 2n ** 64n, 2n ** 128n - 1n]) {
      expect(readU128le(u128le(v))).toBe(v);
    }
  });

  it('timelock round is after the close', () => {
    const closeMs = Date.UTC(2026, 10, 14, 12, 0, 0);
    const round = roundForClose(closeMs * 1e6);
    // quicknet: genesis 1692803367, period 3s
    expect(round * 3 + 1692803367).toBeGreaterThanOrEqual(closeMs / 1000 - 3);
  });
});

describe('prices', () => {
  it('1 NEAR per 1M coins is 1e18 yocto per coin', () => {
    expect(parsePricePerMillion('1')).toBe(10n ** 18n);
    expect(parsePricePerMillion('0.4')).toBe(4n * 10n ** 17n);
    expect(pricePerMillion(4n * 10n ** 17n)).toBe(0.4);
  });
  it('parses NEAR amounts without float error', () => {
    expect(parseNear('12.5')).toBe(125n * 10n ** 23n);
    expect(parseNear('0.000000000000000000000001')).toBe(1n);
    expect(parseNear('abc')).toBeNull();
  });
});

describe('fees (FR-021)', () => {
  it('splits 3% gross into 0.6 Rhea / 0.15 protocol / 2.25 dev', () => {
    const b = breakdown(300, { dev: 10_000, holders: 0, buyback_burn: 0, buyback_keep: 0 });
    expect([b.rheaBps, b.protocolBps, b.devShareBps]).toEqual([60, 15, 225]);
    expect(b.buckets.dev).toBe(225);
  });
  it('divides the dev share by the split', () => {
    const b = breakdown(300, { dev: 4_000, holders: 4_000, buyback_burn: 1_000, buyback_keep: 1_000 });
    expect(b.buckets).toEqual({ dev: 90, holders: 90, buyback_burn: 22.5, buyback_keep: 22.5 });
  });
  it('validates splits and formats bps', () => {
    expect(splitIsValid({ dev: 5_000, holders: 5_000, buyback_burn: 0, buyback_keep: 0 })).toBe(true);
    expect(splitIsValid({ dev: 5_000, holders: 4_999, buyback_burn: 0, buyback_keep: 0 })).toBe(false);
    expect(pct(225)).toBe('2.25%');
    expect(pct(300)).toBe('3%');
  });
});
