import { describe, expect, it } from 'vitest';
import { bidBlock, type Guard } from '@/lib/guard';

const off: Guard = { paused: false, max_raise: '0', mirror_off: false };

describe('bidBlock', () => {
  it('lets bids through when nothing is set or the launchpad predates the guard', () => {
    expect(bidBlock(undefined, 5n, 5n)).toBeNull();
    expect(bidBlock(off, 5n, 5n)).toBeNull();
  });
  it('blocks every bid while paused', () => {
    expect(bidBlock({ ...off, paused: true }, 0n, 1n)).toMatch(/paused/);
  });
  it('blocks only the bid that would pass the cap', () => {
    const capped = { ...off, max_raise: '10' };
    expect(bidBlock(capped, 4n, 6n)).toBeNull();
    expect(bidBlock(capped, 4n, 7n)).toMatch(/Bid less/);
    expect(bidBlock(capped, 10n, null)).toMatch(/reached the raise cap/);
  });
});
