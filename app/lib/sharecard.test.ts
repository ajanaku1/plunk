import { describe, expect, it } from 'vitest';
import type { LaunchBox } from '@/lib/launchpad';
import { cardCopy } from '@/lib/sharecard';

const box = { min_raise: '2000000000000000000000000000', opening: { price: '4000000000000000000' } } as unknown as LaunchBox;

describe('cardCopy', () => {
  it('shows the one price for an open box', () => {
    const c = cardCopy(box, 'open');
    expect(c.kicker).toBe('OPEN');
    expect(c.value).toBe('4.0000');
    expect(c.unit).toBe('NEAR per 1M');
    expect(c.tone).toBe('open');
  });
  it('states the minimum for a live box and never a countdown', () => {
    const c = cardCopy(box, 'bidding');
    expect(c.value).toBe('2,000');
    expect(c.unit).toBe('NEAR');
    expect(c.sub).toMatch(/sealed/);
    expect(c.value + c.sub).not.toMatch(/\d:\d\d/);
  });
  it('says refunded for a failed box', () => {
    expect(cardCopy(box, 'failed').kicker).toBe('REFUNDED');
  });
  it('falls back to the live card when an open box has no opening yet', () => {
    expect(cardCopy({ ...box, opening: null } as unknown as LaunchBox, 'open').kicker).toBe('OPENING');
  });
});
