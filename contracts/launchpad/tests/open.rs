//! T018 (FR-008–014): the synchronous half of Open. The coin + pool chain runs in the sandbox (T016).
mod common;
use common::*;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use plunk_launchpad::bids::commit_hash;
use plunk_launchpad::clearing::ONE_COIN;
use plunk_launchpad::types::Phase;
use plunk_launchpad::Launchpad;

const CLOSE: u64 = T0 + 300 * SEC;
const REVEAL_END: u64 = CLOSE + 60 * SEC;
const SALT: [u8; 32] = [9; 32];
const M: u128 = 1_000_000 * ONE_COIN;

fn per_m(tenths: u128) -> u128 {
    tenths * NEAR / 10 / 1_000_000
}

fn bid(l: &mut Launchpad, who: &str, near: u128, max_tenths: Option<u128>) {
    let msg = match max_tenths {
        None => r#"{"box_id":0,"kind":"market"}"#.to_string(),
        Some(t) => {
            let c: String = commit_hash(0, &id(who), per_m(t), &SALT).iter().map(|x| format!("{x:02x}")).collect();
            format!(r#"{{"box_id":0,"kind":"sealed","commit":"{c}","tlock":"ct"}}"#)
        }
    };
    ctx_at(WNEAR, 0, T0 + SEC);
    let _ = l.ft_on_transfer(id(who), U128(near * NEAR), msg);
}

fn reveal(l: &mut Launchpad, bid_id: u32, tenths: u128) {
    ctx_at("anyone.testnet", 0, CLOSE + SEC);
    l.reveal(0, bid_id, U128(per_m(tenths)), "09".repeat(32));
}

fn open_at(l: &mut Launchpad, ts: u64) {
    ctx_at("anyone.testnet", 0, ts);
    l.open(0);
}

/// The SC-001 worked example: A 100 @ 0.4, B 200 @ 0.3, C market 100, D 50 @ 0.1.
fn worked_example() -> Launchpad {
    let mut l = with_box();
    bid(&mut l, "a.testnet", 100, Some(4));
    bid(&mut l, "b.testnet", 200, Some(3));
    bid(&mut l, "c.testnet", 100, None);
    bid(&mut l, "d.testnet", 50, Some(1));
    for (i, t) in [(0, 4), (1, 3), (3, 1)] {
        reveal(&mut l, i, t);
    }
    l
}

#[test]
fn open_clears_and_records_fills() {
    let mut l = worked_example();
    open_at(&mut l, REVEAL_END);
    let b = l.get_box(0).unwrap();
    assert_eq!(b.phase, Phase::Opening);
    let o = b.opening.unwrap();
    assert_eq!((o.price, o.accepted_total), (U128(per_m(4)), U128(200 * NEAR)));
    assert_eq!(o.pool_near(), 198 * NEAR, "1% raise fee comes off the pool side (FR-012)");
    let a = &l.get_bids(0, id("a.testnet"))[0];
    assert_eq!((a.tokens, a.refund), (U128(250 * M), U128(0)));
    let bb = &l.get_bids(0, id("b.testnet"))[0];
    assert_eq!((bb.tokens, bb.refund), (U128(0), U128(200 * NEAR)));
}

#[test]
fn open_clears_unrevealed_sealed_as_market() {
    let mut l = with_box();
    bid(&mut l, "a.testnet", 100, Some(1)); // never revealed: its 0.1 limit is ignored (FR-009)
    bid(&mut l, "c.testnet", 100, None);
    open_at(&mut l, REVEAL_END);
    let a = &l.get_bids(0, id("a.testnet"))[0];
    assert_eq!((a.tokens, a.refund), (U128(250 * M), U128(0)));
    assert!(l.get_sealed(0, 0, 10).is_empty(), "ciphertexts are freed at open");
}

#[test]
fn open_fails_below_min_raise() {
    let mut l = with_box(); // min raise 1 NEAR
    ctx_at(WNEAR, 0, T0 + SEC);
    let _ = l.ft_on_transfer(id("a.testnet"), U128(NEAR / 2), r#"{"box_id":0,"kind":"market"}"#.into());
    open_at(&mut l, CLOSE);
    assert_eq!(l.get_box(0).unwrap().phase, Phase::Failed);
}

#[test]
fn open_at_close_when_no_sealed_bids() {
    let mut l = with_box();
    bid(&mut l, "c.testnet", 2, None);
    open_at(&mut l, CLOSE);
    assert_eq!(l.get_box(0).unwrap().phase, Phase::Opening);
}

#[test]
#[should_panic(expected = "reveal not over")]
fn open_waits_for_reveal() {
    let mut l = worked_example();
    open_at(&mut l, REVEAL_END - SEC);
}

#[test]
#[should_panic(expected = "already opened")]
fn open_only_once() {
    let mut l = worked_example();
    open_at(&mut l, REVEAL_END);
    open_at(&mut l, REVEAL_END);
}

#[test]
fn fail_stuck_after_24h_without_deposits() {
    let mut l = worked_example();
    open_at(&mut l, REVEAL_END);
    ctx_at("anyone.testnet", 0, REVEAL_END + 24 * 3_600 * SEC);
    assert!(l.fail_stuck(0).is_none(), "nothing in the exchange to withdraw yet");
    assert_eq!(l.get_box(0).unwrap().phase, Phase::Failed);
}

#[test]
#[should_panic(expected = "not stuck yet")]
fn fail_stuck_waits_24h() {
    let mut l = worked_example();
    open_at(&mut l, REVEAL_END);
    ctx_at("anyone.testnet", 0, REVEAL_END + 3_600 * SEC);
    l.fail_stuck(0);
}
