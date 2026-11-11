//! T022 (FR-019, FR-022–FR-025, SC-003): dev escrow, the linear tax, extend, treasury, split shifts.
mod common;
use common::*;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, Value};
use plunk_launchpad::clearing::ONE_COIN;
use plunk_launchpad::escrow::{draw_treasury, split_withdrawal, TreasuryDeposit, TREASURY_WINDOW_NS};
use plunk_launchpad::types::{Phase, Split};
use plunk_launchpad::Launchpad;

const CLOSE: u64 = T0 + 300 * SEC;
const OPEN_AT: u64 = CLOSE + SEC;
const DAY: u64 = 86_400 * SEC;
const M: u128 = 1_000_000 * ONE_COIN;

fn market(l: &mut Launchpad, who: &str, near: u128) {
    ctx_at(WNEAR, 0, T0 + SEC);
    let _ = l.ft_on_transfer(id(who), U128(near * NEAR), r#"{"box_id":0,"kind":"market"}"#.into());
}

/// dev.testnet bids 100 of the 200 NEAR in its own box, so it wins 250M coins, all escrowed.
fn open_box() -> Launchpad {
    let mut l = with_box();
    market(&mut l, "dev.testnet", 100);
    market(&mut l, "a.testnet", 100);
    ctx_at("anyone.testnet", 0, CLOSE);
    l.open(0);
    ctx_at("plunk.testnet", 0, OPEN_AT);
    l.on_liquidity(0, Ok(U128(1)));
    assert_eq!(l.get_box(0).unwrap().phase, Phase::Open);
    l
}

fn num(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}

#[test]
fn escrow_tax_matches_shared_fixtures() {
    let cases: Vec<Value> = serde_json::from_str(include_str!("../../fixtures/tax.json")).unwrap();
    assert!(!cases.is_empty());
    for c in &cases {
        let w = split_withdrawal(num(&c["amount"]), num(&c["now"]) as u64, num(&c["window_start"]) as u64, num(&c["window_end"]) as u64);
        let want = &c["expected"];
        assert_eq!((w.to_holders.0, w.to_dev.0, w.rate_bps as u128), (num(&want["to_holders"]), num(&want["to_dev"]), num(&want["rate_bps"])), "{}", c["name"]);
    }
}

#[test]
fn escrow_tax_dev_fills_are_escrowed_not_claimable() {
    let l = open_box();
    let b = l.get_box(0).unwrap();
    assert_eq!((b.escrow.balance, b.escrow.window_start, b.escrow.window_end), (U128(250 * M), OPEN_AT, OPEN_AT + DAY));
    let dev_bid = &l.get_bids(0, id("dev.testnet"))[0];
    assert_eq!((dev_bid.tokens, dev_bid.coins_paid), (U128(0), true), "nothing to claim as coins");
    let a = &l.get_bids(0, id("a.testnet"))[0];
    assert_eq!(a.tokens, U128(250 * M), "other bidders are untouched");
}

#[test]
fn escrow_tax_withdraw_at_0h_and_12h() {
    let mut l = open_box();
    ctx_at("dev.testnet", 1, OPEN_AT);
    assert_eq!(l.preview_withdraw(0, U128(100 * M)).rate_bps, 9000);
    let _ = l.dev_withdraw(0, U128(100 * M));
    let b = l.get_box(0).unwrap();
    assert_eq!((b.escrow.balance, b.coin_pot), (U128(150 * M), U128(90 * M)), "90% to holders at 0h (SC-003)");

    ctx_at("dev.testnet", 1, OPEN_AT + DAY / 2);
    let w = l.preview_withdraw(0, U128(100 * M));
    assert_eq!((w.to_holders, w.to_dev, w.rate_bps), (U128(45 * M), U128(55 * M), 4500));
    let _ = l.dev_withdraw(0, U128(100 * M));
    let b = l.get_box(0).unwrap();
    assert_eq!((b.escrow.balance, b.coin_pot), (U128(50 * M), U128(135 * M)));

    ctx_at("dev.testnet", 1, OPEN_AT + DAY);
    assert_eq!(l.preview_withdraw(0, U128(50 * M)).to_holders, U128(0), "tax is 0 once the window ends");
}

#[test]
#[should_panic(expected = "amount exceeds escrow")]
fn escrow_tax_cannot_overdraw() {
    let mut l = open_box();
    ctx_at("dev.testnet", 1, OPEN_AT);
    let _ = l.dev_withdraw(0, U128(251 * M));
}

#[test]
#[should_panic(expected = "dev only")]
fn escrow_tax_dev_only() {
    let mut l = open_box();
    ctx_at("a.testnet", 1, OPEN_AT);
    let _ = l.dev_withdraw(0, U128(M));
}

#[test]
#[should_panic(expected = "window still running")]
fn escrow_extend_rejected_mid_window() {
    let mut l = open_box();
    ctx_at("dev.testnet", 1, OPEN_AT + DAY - SEC);
    l.dev_extend(0, 2 * 86_400);
}

#[test]
fn escrow_extend_restarts_at_90_after_the_window() {
    let mut l = open_box();
    let t = OPEN_AT + DAY + 3600 * SEC;
    ctx_at("dev.testnet", 1, t);
    assert_eq!(l.preview_withdraw(0, U128(M)).rate_bps, 0);
    l.dev_extend(0, 2 * 86_400);
    let e = l.get_box(0).unwrap().escrow;
    assert_eq!((e.window_start, e.window_end), (t, t + 2 * DAY));
    assert_eq!(l.preview_withdraw(0, U128(M)).rate_bps, 9000, "a new window restarts at 90% (FR-024)");
    ctx_at("dev.testnet", 1, t + DAY);
    assert_eq!(l.preview_withdraw(0, U128(M)).rate_bps, 4500);
}

#[test]
fn escrow_treasury_oldest_first_on_its_own_7d_curve() {
    let old = TreasuryDeposit { remaining: U128(100 * M), deposited_at: T0 };
    let new = TreasuryDeposit { remaining: U128(100 * M), deposited_at: T0 + TREASURY_WINDOW_NS / 2 };
    let mut deposits = vec![old.clone(), new.clone()];
    // At T0 + 3.5 d the old deposit is half-taxed (45%) and the new one is at 90%.
    let now = T0 + TREASURY_WINDOW_NS / 2;
    let (w, oldest) = draw_treasury(&mut deposits, 150 * M, now);
    assert_eq!(w.to_holders, U128(45 * M + 45 * M), "100M old @45% + 50M new @90%");
    assert_eq!((w.to_dev, oldest), (U128(60 * M), T0));
    assert_eq!(deposits, vec![TreasuryDeposit { remaining: U128(50 * M), deposited_at: new.deposited_at }], "old deposit is consumed first");
    // After 7 days the old deposit is tax-free.
    let mut fresh = vec![old];
    assert_eq!(draw_treasury(&mut fresh, 100 * M, T0 + TREASURY_WINDOW_NS).0.to_holders, U128(0));
}

#[test]
fn escrow_treasury_withdraw_through_the_contract() {
    let mut l = open_box();
    ctx_at("plunk.testnet", 0, OPEN_AT);
    l.add_treasury(0, 10 * M);
    ctx_at("dev.testnet", 1, OPEN_AT);
    assert_eq!(l.preview_treasury_withdraw(0, U128(10 * M)).to_holders, U128(9 * M));
    let _ = l.treasury_withdraw(0, U128(4 * M));
    let b = l.get_box(0).unwrap();
    assert_eq!((b.treasury[0].remaining, b.coin_pot), (U128(6 * M), U128(36 * M / 10)));
}

#[test]
#[should_panic(expected = "amount exceeds treasury")]
fn escrow_treasury_cannot_overdraw() {
    let mut l = open_box();
    ctx_at("dev.testnet", 1, OPEN_AT);
    let _ = l.treasury_withdraw(0, U128(M));
}

#[test]
fn shift_split_moves_dev_share_one_way() {
    let mut l = open_box();
    ctx_at("dev.testnet", 1, OPEN_AT);
    l.shift_split(0, Split { dev: 6_000, holders: 3_000, buyback_burn: 500, buyback_keep: 500 });
    assert_eq!(l.get_box(0).unwrap().split.dev, 6_000);
    l.shift_split(0, Split { dev: 6_000, holders: 0, buyback_burn: 4_000, buyback_keep: 0 });
    assert_eq!(l.get_box(0).unwrap().split.buyback_burn, 4_000, "the other buckets may move freely");
}

#[test]
#[should_panic(expected = "dev share can only decrease")]
fn shift_split_rejects_a_raise() {
    let mut l = open_box();
    ctx_at("dev.testnet", 1, OPEN_AT);
    l.shift_split(0, Split { dev: 6_000, holders: 4_000, buyback_burn: 0, buyback_keep: 0 });
    l.shift_split(0, Split { dev: 7_000, holders: 3_000, buyback_burn: 0, buyback_keep: 0 });
}

#[test]
#[should_panic(expected = "split must sum to 10000")]
fn shift_split_rejects_bad_sum() {
    let mut l = open_box();
    ctx_at("dev.testnet", 1, OPEN_AT);
    l.shift_split(0, Split { dev: 5_000, holders: 4_000, buyback_burn: 0, buyback_keep: 0 });
}
