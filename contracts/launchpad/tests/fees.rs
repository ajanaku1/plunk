//! Protocol fees (FR-012, FR-016): the owner can withdraw what the launchpad has booked, and a failed
//! transfer puts the amount back.
mod common;
use common::*;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::PromiseError;
use plunk_launchpad::Launchpad;

const CLOSE: u64 = T0 + 300 * SEC;
const MARKET: &str = r#"{"box_id":0,"kind":"market"}"#;
const TREASURY: &str = "treasury.testnet";

/// A box with 4 NEAR of market bids, opened as if the pool chain succeeded: 0.04 NEAR raise fee booked.
fn with_fees() -> Launchpad {
    let mut l = with_box();
    for (who, amount) in [("a.testnet", 3 * NEAR), ("b.testnet", NEAR)] {
        ctx_at(WNEAR, 0, T0 + SEC);
        let _ = l.ft_on_transfer(id(who), U128(amount), MARKET.into());
    }
    ctx_at("anyone.testnet", 0, CLOSE);
    let _ = l.open(0);
    ctx_at("plunk.testnet", 0, CLOSE);
    l.on_liquidity(0, Ok(U128(1)));
    l
}

#[test]
fn raise_fee_is_booked_at_open() {
    let l = with_fees();
    assert_eq!(l.get_protocol_fees().0, 4 * NEAR / 100);
}

#[test]
fn owner_withdraws_everything_by_default() {
    let mut l = with_fees();
    ctx_at("owner.testnet", 1, CLOSE + SEC);
    let _ = l.withdraw_protocol_fees(id(TREASURY), None);
    assert_eq!(l.get_protocol_fees().0, 0);
}

#[test]
fn owner_withdraws_part() {
    let mut l = with_fees();
    ctx_at("owner.testnet", 1, CLOSE + SEC);
    let _ = l.withdraw_protocol_fees(id(TREASURY), Some(U128(NEAR / 100)));
    assert_eq!(l.get_protocol_fees().0, 3 * NEAR / 100);
}

#[test]
#[should_panic(expected = "owner only")]
fn others_cannot_withdraw() {
    let mut l = with_fees();
    ctx_at("dev.testnet", 1, CLOSE + SEC);
    let _ = l.withdraw_protocol_fees(id("dev.testnet"), None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn withdraw_needs_one_yocto() {
    let mut l = with_fees();
    ctx_at("owner.testnet", 0, CLOSE + SEC);
    let _ = l.withdraw_protocol_fees(id(TREASURY), None);
}

#[test]
#[should_panic(expected = "more than the protocol fees")]
fn cannot_withdraw_more_than_booked() {
    let mut l = with_fees();
    ctx_at("owner.testnet", 1, CLOSE + SEC);
    let _ = l.withdraw_protocol_fees(id(TREASURY), Some(U128(NEAR)));
}

#[test]
#[should_panic(expected = "nothing to withdraw")]
fn nothing_to_withdraw() {
    let mut l = with_box();
    ctx_at("owner.testnet", 1, T0 + SEC);
    let _ = l.withdraw_protocol_fees(id(TREASURY), None);
}

#[test]
#[should_panic(expected = "receiver must not be the launchpad")]
fn cannot_send_to_itself() {
    let mut l = with_fees();
    ctx_at("owner.testnet", 1, CLOSE + SEC);
    let _ = l.withdraw_protocol_fees(id("plunk.testnet"), None);
}

#[test]
fn failed_transfer_restores_the_fees() {
    let mut l = with_fees();
    ctx_at("owner.testnet", 1, CLOSE + SEC);
    let _ = l.withdraw_protocol_fees(id(TREASURY), None);
    ctx_at("plunk.testnet", 0, CLOSE + SEC);
    l.on_fees_withdrawn(U128(4 * NEAR / 100), Err(PromiseError::Failed));
    assert_eq!(l.get_protocol_fees().0, 4 * NEAR / 100);
}

#[test]
fn successful_transfer_keeps_the_counter_down() {
    let mut l = with_fees();
    ctx_at("owner.testnet", 1, CLOSE + SEC);
    let _ = l.withdraw_protocol_fees(id(TREASURY), None);
    ctx_at("plunk.testnet", 0, CLOSE + SEC);
    l.on_fees_withdrawn(U128(4 * NEAR / 100), Ok(()));
    assert_eq!(l.get_protocol_fees().0, 0);
}
