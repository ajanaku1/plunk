import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { problem, type WatchedBox } from './health.ts';

const MIN = 60_000_000_000;
const HOUR = 60 * MIN;
const CLOSE = 500_000 * HOUR;
const box: WatchedBox = { id: 4, phase: 'Bidding', close_at: CLOSE, open_at: 0, sealed_count: 0, last_harvest_epoch: 0 };

describe('problem', () => {
  it('is quiet for a live room and for a just-closed one', () => {
    assert.equal(problem(box, CLOSE - MIN), null);
    assert.equal(problem(box, CLOSE + 9 * MIN), null);
  });
  it('flags a closed room nobody opened, counting the reveal minute for sealed rooms', () => {
    assert.match(problem(box, CLOSE + 11 * MIN) ?? '', /box 4: closed 11 min ago/);
    assert.equal(problem({ ...box, sealed_count: 1 }, CLOSE + 10.5 * MIN), null);
  });
  it('flags a box stuck opening', () => {
    assert.equal(problem({ ...box, phase: 'Opening' }, CLOSE + 29 * MIN), null);
    assert.match(problem({ ...box, phase: 'Opening' }, CLOSE + 31 * MIN) ?? '', /retry_open/);
  });
  it('flags an open box the keeper has not harvested for more than 3 hours', () => {
    const open = { ...box, phase: 'Open', open_at: CLOSE, last_harvest_epoch: 500_000 };
    assert.equal(problem(open, CLOSE + 3 * HOUR), null);
    assert.match(problem(open, CLOSE + 4 * HOUR) ?? '', /no harvest for 4 hours/);
    assert.equal(problem({ ...open, last_harvest_epoch: 0 }, CLOSE + 2 * HOUR), null, 'a new box counts from open');
  });
  it('ignores failed boxes', () => {
    assert.equal(problem({ ...box, phase: 'Failed' }, CLOSE + 99 * HOUR), null);
  });
});
