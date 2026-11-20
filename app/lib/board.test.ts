import { describe, expect, it } from 'vitest';
import { ageLabel, changeVsClose, meterSegments, priceText, stackCount, tickerHue } from '@/lib/board';

const NS = 1e9;

describe('ageLabel', () => {
  it('reads minutes, hours and days', () => {
    expect(ageLabel(0, 90 * NS)).toBe('1M');
    expect(ageLabel(0, 7200 * NS)).toBe('2H');
    expect(ageLabel(0, 3 * 86_400 * NS)).toBe('3D');
  });
  it('never goes below one minute or below zero', () => {
    expect(ageLabel(10 * NS, 5 * NS)).toBe('1M');
  });
});

describe('meterSegments', () => {
  it('lights part of the meter and puts the minimum inside it', () => {
    const m = meterSegments(3240, 2000, 22);
    expect(m.lit).toBeGreaterThan(m.marker);
    expect(m.lit).toBeLessThanOrEqual(22);
  });
  it('is empty with nothing raised', () => {
    expect(meterSegments(0, 2000).lit).toBe(0);
  });
  it('keeps headroom: even a huge raise leaves the last segments dark', () => {
    expect(meterSegments(1e9, 10, 22).lit).toBe(20);
  });
});

describe('changeVsClose', () => {
  it('signs the move', () => {
    expect(changeVsClose(0.004, 0.0046)?.label).toBe('+15.0%');
    expect(changeVsClose(0.004, 0.0036)?.tone).toBe('down');
  });
  it('treats a tiny move as flat', () => {
    expect(changeVsClose(0.004, 0.0040001)?.tone).toBe('flat');
  });
  it('is null without both prices', () => {
    expect(changeVsClose(0.004, undefined)).toBeNull();
    expect(changeVsClose(0, 0.004)).toBeNull();
  });
});

describe('stackCount', () => {
  it('stays between 1 and 6', () => {
    expect(stackCount(0)).toBe(1);
    expect(stackCount(0.5)).toBe(6);
    expect(stackCount(0.1)).toBe(2);
  });
});

describe('tickerHue', () => {
  it('is stable and within a colour wheel', () => {
    expect(tickerHue('fon')).toBe(tickerHue('fon'));
    expect(tickerHue('peek')).toBeGreaterThanOrEqual(0);
    expect(tickerHue('peek')).toBeLessThan(360);
  });
});

describe('priceText', () => {
  it('keeps 4 decimals for ordinary prices and zero', () => {
    expect(priceText(0.4)).toBe('0.4000');
    expect(priceText(0.0001)).toBe('0.0001');
    expect(priceText(0)).toBe('0.0000');
  });
  it('shows two significant digits instead of 0.0000 for tiny prices', () => {
    expect(priceText(0.000034)).toBe('0.000034');
    expect(priceText(0.00000051)).toBe('0.00000051');
  });
});
