import { describe, expect, it } from 'vitest';
import { poseAt } from '@/lib/timeline';
import { FLIP_FROM, OPENING_T, REST_T, openingTime, stageTime } from '@/lib/stagemap';

const closeAt = 1_000e9;
const at = (secAfterClose: number) => stageTime({ state: 'reveal', nowNs: closeAt + secAfterClose * 1e9, closeAt });

describe('stageTime', () => {
  it('holds the lid ajar while bidding', () => {
    expect(stageTime({ state: 'bidding', nowNs: 0, closeAt })).toBeLessThan(1);
    expect(poseAt(stageTime({ state: 'bidding', nowNs: 0, closeAt })).lid).toBeGreaterThan(0.1);
  });
  it('runs the reveal forward with real time and never reaches the crack', () => {
    let prev = at(0);
    for (const s of [0.5, 1, 2, 10, 30, 59.9, 60]) {
      const t = at(s);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t).toBeLessThan(11.75);
      prev = t;
    }
    expect(at(0)).toBeCloseTo(6.4);
    expect(at(60)).toBeCloseTo(11.3, 1);
  });
  it('shuts the lid and presses the seal at the start of the reveal', () => {
    expect(poseAt(at(0)).lid).toBeGreaterThan(poseAt(at(2)).lid - 1e-9);
    expect(poseAt(at(2)).lid).toBeCloseTo(0, 2);
  });
  it('holds the shut box, unopened, while the chain opens it', () => {
    const t = stageTime({ state: 'opening', nowNs: 0, closeAt, step: 1 });
    expect(t).toBeCloseTo(OPENING_T - 0.075, 5);
    expect(poseAt(t).crack).toBe(0);
    expect(poseAt(t).leak).toBeGreaterThan(0.5);
  });
  it('lifts the light with each real opening step and never reaches the crack', () => {
    const ts = [1, 2, 3, 4].map((s) => openingTime(s));
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    expect(Math.max(...ts)).toBeLessThan(11.75);
    expect(poseAt(ts[3]!).leak).toBeGreaterThan(poseAt(ts[0]!).leak);
  });
  it('rests on the open frame, and the live flip starts before the crack', () => {
    expect(stageTime({ state: 'open', nowNs: 0, closeAt })).toBe(REST_T);
    expect(poseAt(REST_T).lid).toBeGreaterThan(1.5);
    expect(poseAt(FLIP_FROM).crack).toBe(0);
  });
});
