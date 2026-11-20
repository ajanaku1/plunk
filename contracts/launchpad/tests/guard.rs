//! Owner safety switches: pause, raise cap and the Solana-share switch. A blocked bid is never
//! bounced or lost; it becomes a late credit the bidder can claim back (FR-028).
mod common;
use common::*;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use plunk_launchpad::guard::Guard;
use plunk_launchpad::types::BoxArgs;
use plunk_launchpad::Launchpad;

const MARKET: &str = r#"{"box_id":0,"kind":"market"}"#;

fn set(l: &mut Launchpad, guard: Guard) {
    ctx_at("owner.testnet", 1, T0);
    l.set_guard(guard);
}

fn bid(l: &mut Launchpad, who: &str, amount: u128) {
    ctx_at(WNEAR, 0, T0 + SEC);
    let _ = l.ft_on_transfer(id(who), U128(amount), MARKET.into());
}

#[test]
fn everything_is_off_by_default() {
    assert_eq!(lp().get_guard(), Guard::default());
}

#[test]
#[should_panic(expected = "owner only")]
fn only_the_owner_sets_it() {
    let mut l = lp();
    ctx_at("dev.testnet", 1, T0);
    l.set_guard(Guard { paused: true, ..Guard::default() });
}

#[test]
#[should_panic(expected = "paused: no new boxes")]
fn pause_stops_new_boxes() {
    let mut l = lp();
    set(&mut l, Guard { paused: true, ..Guard::default() });
    ctx_at("dev.testnet", FEE, T0);
    l.create_box(args("plunk"));
}

#[test]
fn pause_turns_bids_into_late_credit_and_lifts() {
    let mut l = with_box();
    set(&mut l, Guard { paused: true, ..Guard::default() });
    bid(&mut l, "a.testnet", NEAR);
    assert_eq!(l.get_box(0).unwrap().total_in.0, 0);
    assert_eq!(l.get_late(id("a.testnet")), U128(NEAR));
    set(&mut l, Guard::default());
    bid(&mut l, "a.testnet", NEAR);
    assert_eq!(l.get_box(0).unwrap().total_in.0, NEAR);
}

#[test]
fn raise_cap_fills_to_the_cap_and_credits_the_rest() {
    let mut l = with_box();
    set(&mut l, Guard { max_raise: U128(3 * NEAR), ..Guard::default() });
    bid(&mut l, "a.testnet", 2 * NEAR);
    bid(&mut l, "b.testnet", 2 * NEAR);
    bid(&mut l, "c.testnet", NEAR);
    assert_eq!(l.get_box(0).unwrap().total_in.0, 3 * NEAR, "a and c fit, b would pass the cap");
    assert_eq!(l.get_late(id("b.testnet")), U128(2 * NEAR));
    assert_eq!(l.get_late(id("c.testnet")), U128(0));
}

#[test]
#[should_panic(expected = "solana share is switched off")]
fn mirror_switch_blocks_a_solana_share() {
    let mut l = lp();
    set(&mut l, Guard { mirror_off: true, ..Guard::default() });
    ctx_at("dev.testnet", FEE, T0);
    l.create_box(BoxArgs { solana_share_bps: Some(3000), ..args("plunk") });
}

#[test]
fn mirror_switch_still_allows_plain_boxes() {
    let mut l = lp();
    set(&mut l, Guard { mirror_off: true, ..Guard::default() });
    ctx_at("dev.testnet", FEE, T0);
    assert_eq!(l.create_box(args("plunk")), 0);
}
