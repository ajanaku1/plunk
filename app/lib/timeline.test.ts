import { describe, expect, it } from 'vitest';
import { EASE, LIVE_START, TOTAL, captionAt, phaseAt, poseAt, priceAt, valueAt } from '@/lib/timeline';

describe('easing', () => {
  it('starts at 0 and ends at 1', () => {
    for (const e of Object.values(EASE)) {
      expect(e(0)).toBeCloseTo(0, 5);
      expect(e(1)).toBeCloseTo(1, 5);
    }
  });
});

describe('valueAt', () => {
  it('holds the start value before the first step and the end value after the last', () => {
    const track = { init: 5, steps: [{ t: 1, to: 9, dur: 2, ease: 'none' as const }] };
    expect(valueAt(track, 0)).toBe(5);
    expect(valueAt(track, 2)).toBeCloseTo(7);
    expect(valueAt(track, 10)).toBe(9);
  });
  it('lets a later overlapping step start from where the earlier one had got to', () => {
    const track = { init: 0, steps: [{ t: 0, to: 10, dur: 10, ease: 'none' as const }, { t: 5, to: 0, dur: 5, ease: 'none' as const }] };
    expect(valueAt(track, 5)).toBeCloseTo(5);
    expect(valueAt(track, 10)).toBeCloseTo(0);
  });
});

describe('poseAt', () => {
  it('has the lid shut after 7 s and swung open after 13 s', () => {
    expect(poseAt(7).lid).toBeCloseTo(0, 2);
    expect(poseAt(13).lid).toBeGreaterThan(1.5);
  });
  it('shakes only during the tremor, cracks the seal at 11.75 s', () => {
    expect(poseAt(5).shake).toBe(0);
    expect(poseAt(11).shake).toBeGreaterThan(0.5);
    expect(poseAt(12).shake).toBe(0);
    expect(poseAt(11.7).crack).toBe(0);
    expect(poseAt(11.8).crack).toBe(1);
  });
  it('drops the seal onto the lid and starts live openings with it already on', () => {
    expect(poseAt(7).sealY).toBeCloseTo(0.6);
    expect(poseAt(8).sealY).toBeCloseTo(0, 2);
    expect(LIVE_START).toBeLessThan(8);
    expect(TOTAL).toBe(22);
  });
});

describe('captions and phases', () => {
  it('follows the story', () => {
    expect(captionAt(0)).toMatch(/Bids go in/);
    expect(captionAt(12)).toMatch(/seal breaks/);
    expect(captionAt(20)).toMatch(/One price/);
    expect(phaseAt(0)).toBe(0);
    expect(phaseAt(21)).toBe(6);
  });
});

describe('priceAt', () => {
  it('is hidden early, flickers while unlocking, and ends on exactly the real price', () => {
    expect(priceAt('0.0040', 5).visible).toBe(false);
    const mid = priceAt('0.0040', 13.3);
    expect(mid.locked).toBeGreaterThan(0);
    expect(mid.done).toBe(false);
    expect(mid.text.startsWith('0.')).toBe(true);
    const end = priceAt('0.0040', 16);
    expect(end.done).toBe(true);
    expect(end.text).toBe('0.0040');
  });
  it('locks digits left to right', () => {
    const a = priceAt('0.0123', 13.0);
    expect(a.locked).toBe(1);
    expect(a.text[0]).toBe('0');
  });
  it('handles prices with more digits', () => {
    expect(priceAt('0.000012', 20).text).toBe('0.000012');
  });
});
