import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inRevealWindow, parsePayload, readU128le, REVEAL_NS, revealArgs, type SealedBox } from './sealed.ts';

const CLOSE = 1_800_000_000_000_000_000;
// Block times in ns exceed Number's exact range (~256 ns resolution here), so edges are tested at 1 s.
const SEC = 1_000_000_000;
const box: SealedBox = { id: 3, phase: 'Bidding', close_at: CLOSE, sealed_count: 2 };

describe('inRevealWindow', () => {
  it('is open from close for 60 s', () => {
    assert.equal(inRevealWindow(box, CLOSE - SEC), false);
    assert.equal(inRevealWindow(box, CLOSE), true);
    assert.equal(inRevealWindow(box, CLOSE + REVEAL_NS - SEC), true);
    assert.equal(inRevealWindow(box, CLOSE + REVEAL_NS), false);
  });
  it('skips boxes with nothing sealed or already opening', () => {
    assert.equal(inRevealWindow({ ...box, sealed_count: 0 }, CLOSE), false);
    assert.equal(inRevealWindow({ ...box, phase: 'Opening' }, CLOSE), false);
  });
});

describe('payload', () => {
  it('reads max_price u128 LE and a 32-byte salt', () => {
    const plain = new Uint8Array(48);
    new DataView(plain.buffer).setBigUint64(0, 400_000_000_000_000_000n, true);
    plain.fill(3, 16);
    const r = parsePayload(plain);
    assert.equal(r.maxPrice, 400_000_000_000_000_000n);
    assert.equal(r.saltHex, '03'.repeat(32));
    assert.deepEqual(revealArgs(3, 7, r), { box_id: 3, bid_id: 7, max_price: '400000000000000000', salt: '03'.repeat(32) });
  });
  it('reads the high 64 bits', () => {
    const b = new Uint8Array(16).fill(255);
    assert.equal(readU128le(b), 2n ** 128n - 1n);
  });
  it('rejects a payload of the wrong length (junk ciphertext)', () => {
    assert.throws(() => parsePayload(new Uint8Array(47)), /unexpected payload length/);
  });
});
