//! T017 (FR-004/005/006/007/028): deposits never bounce, and anyone can reveal a sealed bid.
mod common;
use common::*;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::{env, PromiseOrValue};
use plunk_launchpad::bids::{commit_hash, BidKind};
use plunk_launchpad::Launchpad;

const CLOSE: u64 = T0 + 300 * SEC;
const SALT: [u8; 32] = [7; 32];

fn deposit(l: &mut Launchpad, sender: &str, amount: u128, msg: &str, ts: u64) -> U128 {
    ctx_at(WNEAR, 0, ts);
    match l.ft_on_transfer(id(sender), U128(amount), msg.to_string()) {
        PromiseOrValue::Value(v) => v,
        PromiseOrValue::Promise(_) => panic!("ft_on_transfer must answer synchronously"),
    }
}

fn sealed_msg(bidder: &str, max_price: u128) -> String {
    let commit = hex(&commit_hash(0, &id(bidder), max_price, &SALT));
    format!(r#"{{"box_id":0,"kind":"sealed","commit":"{commit}","tlock":"age-encryption.org/v1 test"}}"#)
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

const MARKET: &str = r#"{"box_id":0,"kind":"market"}"#;

#[test]
fn never_rejects_valid_bids() {
    let mut l = with_box();
    assert_eq!(deposit(&mut l, "a.testnet", 5 * NEAR, MARKET, T0 + SEC), U128(0));
    assert_eq!(deposit(&mut l, "b.testnet", 3 * NEAR, &sealed_msg("b.testnet", 42), T0 + SEC), U128(0));
    let xchain = r#"{"box_id":0,"kind":"xchain","recipient":"c.testnet"}"#;
    assert_eq!(deposit(&mut l, "intents.testnet", 2 * NEAR, xchain, T0 + SEC), U128(0));
    let t = l.get_public_totals(0).unwrap();
    assert_eq!((t.total_in, t.bidder_count, t.reveal_end), (U128(10 * NEAR), 3, CLOSE + 60 * SEC));
    let c = l.get_bids(0, id("c.testnet"));
    assert_eq!((c.len(), c[0].budget, c[0].bidder.as_str()), (1, U128(2 * NEAR), "intents.testnet"));
}

#[test]
fn never_rejects_bad_or_late_input() {
    let mut l = with_box();
    let cases = [
        ("a.testnet", "not json", T0 + SEC),
        ("a.testnet", r#"{"box_id":9,"kind":"market"}"#, T0 + SEC),
        ("a.testnet", r#"{"box_id":0,"kind":"sealed","commit":"zz"}"#, T0 + SEC),
        ("a.testnet", MARKET, CLOSE),
    ];
    for (sender, msg, ts) in cases {
        assert_eq!(deposit(&mut l, sender, NEAR, msg, ts), U128(0), "{msg}");
    }
    assert_eq!(l.get_late(id("a.testnet")), U128(4 * NEAR));
    let late_xchain = r#"{"box_id":0,"kind":"xchain","recipient":"c.testnet"}"#;
    assert_eq!(deposit(&mut l, "intents.testnet", NEAR, late_xchain, CLOSE + SEC), U128(0));
    assert_eq!(l.get_late(id("c.testnet")), U128(NEAR), "late cross-chain credit goes to the named recipient");
    assert_eq!(l.get_public_totals(0).unwrap().total_in, U128(0));
}

#[test]
fn never_rejects_past_200_bids() {
    let mut l = with_box();
    for _ in 0..200 {
        deposit(&mut l, "a.testnet", NEAR, MARKET, T0 + SEC);
    }
    assert_eq!(deposit(&mut l, "b.testnet", NEAR, MARKET, T0 + SEC), U128(0));
    assert_eq!(l.get_late(id("b.testnet")), U128(NEAR));
    assert_eq!(l.get_public_totals(0).unwrap().bidder_count, 1);
}

#[test]
fn foreign_tokens_are_returned() {
    let mut l = with_box();
    ctx_at("usdc.testnet", 0, T0 + SEC);
    match l.ft_on_transfer(id("a.testnet"), U128(NEAR), MARKET.into()) {
        PromiseOrValue::Value(v) => assert_eq!(v, U128(NEAR)),
        PromiseOrValue::Promise(_) => panic!(),
    }
}

#[test]
fn reveal_skipped_without_sealed_bids() {
    let mut l = with_box();
    deposit(&mut l, "a.testnet", NEAR, MARKET, T0 + SEC);
    assert_eq!(l.get_public_totals(0).unwrap().reveal_end, CLOSE);
}

#[test]
fn reveal_by_anyone_checks_commit() {
    let mut l = with_box();
    deposit(&mut l, "b.testnet", 3 * NEAR, &sealed_msg("b.testnet", 42), T0 + SEC);
    assert_eq!(l.get_sealed(0, 0, 10).len(), 1, "ciphertexts are listed for revealers");
    ctx_at("keeper.testnet", 0, CLOSE + SEC);
    l.reveal(0, 0, U128(42), hex(&SALT));
    match &l.get_bids(0, id("b.testnet"))[0].kind {
        BidKind::Sealed { revealed_price, tlock, .. } => assert_eq!((*revealed_price, tlock.is_none()), (Some(U128(42)), true)),
        k => panic!("unexpected {k:?}"),
    }
    assert!(l.get_sealed(0, 0, 10).is_empty(), "revealed bids leave the list");
}

#[test]
#[should_panic(expected = "commit mismatch")]
fn reveal_rejects_wrong_price() {
    let mut l = with_box();
    deposit(&mut l, "b.testnet", 3 * NEAR, &sealed_msg("b.testnet", 42), T0 + SEC);
    ctx_at("keeper.testnet", 0, CLOSE + SEC);
    l.reveal(0, 0, U128(43), hex(&SALT));
}

#[test]
#[should_panic(expected = "not in reveal")]
fn reveal_rejects_before_close() {
    let mut l = with_box();
    deposit(&mut l, "b.testnet", 3 * NEAR, &sealed_msg("b.testnet", 42), T0 + SEC);
    ctx_at("keeper.testnet", 0, CLOSE - SEC);
    l.reveal(0, 0, U128(42), hex(&SALT));
}

#[test]
fn commit_preimage_layout() {
    // R10: sha256("plunk:v1" ‖ box_id u64 LE ‖ len(account) u32 LE ‖ account ‖ max_price u128 LE ‖ salt[32])
    let mut pre = b"plunk:v1".to_vec();
    pre.extend(5u64.to_le_bytes());
    pre.extend(9u32.to_le_bytes());
    pre.extend(b"b.testnet");
    pre.extend(42u128.to_le_bytes());
    pre.extend(SALT);
    ctx_at("x.testnet", 0, T0);
    assert_eq!(commit_hash(5, &id("b.testnet"), 42, &SALT).to_vec(), env::sha256(&pre));
}
