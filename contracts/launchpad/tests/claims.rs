//! T019 (FR-009/010/015/028): claims pay each part once, failed boxes refund 100%, payouts undo on failure.
mod common;
use common::*;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::PromiseError;
use plunk_launchpad::claims::Undo;
use plunk_launchpad::types::Phase;
use plunk_launchpad::Launchpad;

const CLOSE: u64 = T0 + 300 * SEC;
const MARKET: &str = r#"{"box_id":0,"kind":"market"}"#;

fn bid(l: &mut Launchpad, who: &str, amount: u128) {
    ctx_at(WNEAR, 0, T0 + SEC);
    let _ = l.ft_on_transfer(id(who), U128(amount), MARKET.into());
}

fn as_self(ts: u64) {
    ctx_at("plunk.testnet", 0, ts);
}

/// Two market bids (3 + 1 NEAR), opened and marked Open as if the pool chain succeeded.
fn opened() -> Launchpad {
    let mut l = with_box();
    bid(&mut l, "a.testnet", 3 * NEAR);
    bid(&mut l, "b.testnet", NEAR);
    ctx_at("anyone.testnet", 0, CLOSE);
    let _ = l.open(0);
    as_self(CLOSE);
    l.on_liquidity(0, Ok(U128(1)));
    l
}

#[test]
fn claim_pays_coins_once() {
    let mut l = opened();
    assert_eq!(l.get_box(0).unwrap().phase, Phase::Open);
    ctx_at("anyone.testnet", 0, CLOSE + SEC);
    let _ = l.claim_bid(0, 0);
    let a = &l.get_bids(0, id("a.testnet"))[0];
    assert!(a.coins_paid && !a.refund_paid, "an all-market fill has no refund");
}

#[test]
#[should_panic(expected = "nothing to claim")]
fn claim_twice_is_rejected() {
    let mut l = opened();
    ctx_at("anyone.testnet", 0, CLOSE + SEC);
    let _ = l.claim_bid(0, 0);
    let _ = l.claim_bid(0, 0);
}

#[test]
#[should_panic(expected = "box not settled")]
fn claim_waits_for_open() {
    let mut l = with_box();
    bid(&mut l, "a.testnet", 3 * NEAR);
    ctx_at("anyone.testnet", 0, T0 + 2 * SEC);
    let _ = l.claim_bid(0, 0);
}

#[test]
fn failed_box_refunds_full_budget() {
    let mut l = with_box();
    bid(&mut l, "a.testnet", NEAR / 2); // below the 1 NEAR min raise
    ctx_at("anyone.testnet", 0, CLOSE);
    let _ = l.open(0);
    assert_eq!(l.get_box(0).unwrap().phase, Phase::Failed);
    let _ = l.claim_bid(0, 0);
    let a = &l.get_bids(0, id("a.testnet"))[0];
    assert!(a.refund_paid && !a.coins_paid);
}

#[test]
fn failed_unwrap_restores_the_refund() {
    let mut l = with_box();
    bid(&mut l, "a.testnet", NEAR / 2);
    ctx_at("anyone.testnet", 0, CLOSE);
    let _ = l.open(0);
    let _ = l.claim_bid(0, 0);
    as_self(CLOSE);
    l.on_unwrapped(id("a.testnet"), U128(NEAR / 2), Undo::Refund { box_id: 0, bid_id: 0 }, Err(PromiseError::Failed));
    assert!(!l.get_bids(0, id("a.testnet"))[0].refund_paid, "claimable again");
}

#[test]
fn late_credit_claim_and_restore() {
    let mut l = with_box();
    ctx_at(WNEAR, 0, CLOSE + SEC);
    let _ = l.ft_on_transfer(id("a.testnet"), U128(NEAR), MARKET.into());
    ctx_at("a.testnet", 0, CLOSE + SEC);
    let _ = l.claim_late();
    assert_eq!(l.get_late(id("a.testnet")), U128(0));
    as_self(CLOSE);
    l.on_unwrapped(id("a.testnet"), U128(NEAR), Undo::Late, Err(PromiseError::Failed));
    assert_eq!(l.get_late(id("a.testnet")), U128(NEAR));
}

#[test]
fn next_to_open_and_listing() {
    let mut l = with_box();
    ctx_at("dev.testnet", FEE, T0);
    l.create_box(args("two"));
    bid(&mut l, "a.testnet", 2 * NEAR);
    ctx_at("anyone.testnet", 0, CLOSE - SEC);
    assert_eq!(l.next_to_open(), None);
    ctx_at("anyone.testnet", 0, CLOSE);
    assert_eq!(l.next_to_open(), Some(0));
    assert_eq!(l.list_boxes(1, 10).len(), 1);
}
