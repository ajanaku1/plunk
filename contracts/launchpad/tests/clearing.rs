//! T009 (SC-001, FR-008). Written red-first against a stub `clear`.
use plunk_launchpad::clearing::{clear, BidIn, Fill, MAX_BIDS, ONE_COIN, TOKENS_FOR_BIDDERS};

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const M: u128 = 1_000_000 * ONE_COIN; // one million coins, in smallest units

/// NEAR per 1M coins (in tenths) → yocto per whole coin.
fn per_m(tenths: u128) -> u128 {
    tenths * NEAR / 10 / 1_000_000
}
fn market(id: u64, near: u128) -> BidIn {
    BidIn { id, budget: near * NEAR, max_price: None }
}
fn sealed(id: u64, near: u128, tenths: u128) -> BidIn {
    BidIn { id, budget: near * NEAR, max_price: Some(per_m(tenths)) }
}
fn fill(r: &[Fill], id: u64) -> Fill {
    *r.iter().find(|f| f.id == id).unwrap()
}
fn assert_conserves(bids: &[BidIn], r: &[Fill]) {
    let tokens: u128 = r.iter().map(|f| f.tokens).sum();
    assert!(tokens <= TOKENS_FOR_BIDDERS * ONE_COIN, "oversold");
    for (b, f) in bids.iter().zip(r) {
        assert_eq!(b.id, f.id);
        assert_eq!(f.paid + f.refund, b.budget);
    }
}

#[test]
fn clearing_worked_example() {
    // C market 100, A 100 @ 0.4, B 200 @ 0.3, D 50 @ 0.1
    let bids = [sealed(1, 100, 4), sealed(2, 200, 3), market(3, 100), sealed(4, 50, 1)];
    let r = clear(&bids);
    assert_eq!(r.price, per_m(4));
    assert_eq!(r.accepted_total, 200 * NEAR);
    assert_eq!(fill(&r.fills, 1), Fill { id: 1, paid: 100 * NEAR, tokens: 250 * M, refund: 0 });
    assert_eq!(fill(&r.fills, 3), Fill { id: 3, paid: 100 * NEAR, tokens: 250 * M, refund: 0 });
    assert_eq!(fill(&r.fills, 2), Fill { id: 2, paid: 0, tokens: 0, refund: 200 * NEAR });
    assert_eq!(fill(&r.fills, 4), Fill { id: 4, paid: 0, tokens: 0, refund: 50 * NEAR });
    assert_conserves(&bids, &r.fills);
}

#[test]
fn clearing_all_market() {
    let bids = [market(1, 30), market(2, 70)];
    let r = clear(&bids);
    assert_eq!(r.price, per_m(2)); // 100 NEAR / 500M = 0.2 per 1M
    assert_eq!(fill(&r.fills, 1).tokens, 150 * M);
    assert_eq!(fill(&r.fills, 2).tokens, 350 * M);
    assert_conserves(&bids, &r.fills);
}

#[test]
fn clearing_tie_pro_rata() {
    // Both at 0.4; together 250 NEAR would price at 0.5, so the tie fills 200 NEAR pro-rata.
    let bids = [sealed(1, 150, 4), sealed(2, 100, 4)];
    let r = clear(&bids);
    assert_eq!(r.price, per_m(4));
    assert_eq!(fill(&r.fills, 1), Fill { id: 1, paid: 120 * NEAR, tokens: 300 * M, refund: 30 * NEAR });
    assert_eq!(fill(&r.fills, 2), Fill { id: 2, paid: 80 * NEAR, tokens: 200 * M, refund: 20 * NEAR });
    assert_conserves(&bids, &r.fills);
}

#[test]
fn clearing_stops_at_first_rejection() {
    // B overshoots at 0.3, so it fills only to price 0.3 (50 NEAR) and clearing stops:
    // the cheaper D is never considered.
    let bids = [sealed(1, 100, 4), sealed(2, 200, 3), sealed(4, 1, 1)];
    let r = clear(&bids);
    assert_eq!(r.price, per_m(3));
    assert_eq!(fill(&r.fills, 2).paid, 50 * NEAR);
    assert_eq!(fill(&r.fills, 4).paid, 0);
}

#[test]
fn clearing_no_bids_or_none_accepted() {
    assert_eq!(clear(&[]).price, 0);
    // 300 NEAR alone would price at 0.6 > 0.4: the margin fills 200 NEAR pro-rata.
    let r = clear(&[sealed(1, 300, 4)]);
    assert_eq!(fill(&r.fills, 1).paid, 200 * NEAR);
}

#[test]
fn clearing_price_rounds_up() {
    // 1 yocto + 100 NEAR: exact price is fractional, so it must round up.
    let bids = [BidIn { id: 1, budget: 100 * NEAR + 1, max_price: None }];
    let r = clear(&bids);
    assert_eq!(r.price, per_m(2) + 1);
    assert_conserves(&bids, &r.fills);
}

#[test]
fn clearing_cap_200_bids() {
    let bids: Vec<BidIn> = (0..MAX_BIDS as u64).map(|i| sealed(i, 1 + i as u128 % 7, 1 + i as u128 % 9)).collect();
    let r = clear(&bids);
    assert_eq!(r.fills.len(), MAX_BIDS);
    assert_conserves(&bids, &r.fills);
    for (b, f) in bids.iter().zip(&r.fills) {
        if f.paid > 0 {
            assert!(r.price <= b.max_price.unwrap(), "accepted above its max");
        }
    }
}

#[test]
#[should_panic(expected = "too many bids")]
fn clearing_cap_rejects_201() {
    let bids: Vec<BidIn> = (0..=MAX_BIDS as u64).map(|i| market(i, 1)).collect();
    clear(&bids);
}
