import { describe, expect, it } from 'vitest';
import clearingCases from '../../contracts/fixtures/clearing.json';
import taxCases from '../../contracts/fixtures/tax.json';
import { clear, devWithdraw, MAX_BIDS, type BidIn } from './math';

type RawBid = { id: number; budget: string; max_price: string | null };

function toBid(b: RawBid): BidIn {
  return { id: b.id, budget: BigInt(b.budget), maxPrice: b.max_price === null ? null : BigInt(b.max_price) };
}

describe('clearing mirrors the Rust fixtures (FR-008)', () => {
  it.each(clearingCases)('$name', ({ bids, expected }) => {
    const r = clear((bids as RawBid[]).map(toBid));
    expect(r.price.toString()).toBe(expected.price);
    expect(r.acceptedTotal.toString()).toBe(expected.accepted_total);
    expect(r.fills.map((f) => ({ id: f.id, paid: `${f.paid}`, tokens: `${f.tokens}`, refund: `${f.refund}` }))).toEqual(
      expected.fills,
    );
  });

  it('rejects more than 200 bids', () => {
    const bids = Array.from({ length: MAX_BIDS + 1 }, (_, id) => ({ id, budget: 1n, maxPrice: null }));
    expect(() => clear(bids)).toThrow('too many bids');
  });
});

describe('dev tax mirrors the data-model formula (FR-023)', () => {
  it.each(taxCases)('$name', ({ amount, now, window_start, window_end, expected }) => {
    const w = devWithdraw(BigInt(amount), BigInt(now), { start: BigInt(window_start), end: BigInt(window_end) });
    expect({ to_holders: `${w.toHolders}`, to_dev: `${w.toDev}`, rate_bps: `${w.rateBps}` }).toEqual(expected);
  });
});
