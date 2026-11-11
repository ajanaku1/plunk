//! Solana mirror phase A (specs/001-plunk-launchpad/solana-mirror.md): the dev's Solana share is
//! validated at creation and, at Open, that share of the LP half is held back from the Rhea seed.
mod common;
use common::*;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use plunk_launchpad::open::{mirror_part, POOL_COINS};
use plunk_launchpad::types::BoxArgs;
use plunk_launchpad::Launchpad;

const CLOSE: u64 = T0 + 300 * SEC;
const REVEAL_END: u64 = CLOSE + 60 * SEC;

fn args_with_share(ticker: &str, bps: u16) -> BoxArgs {
    BoxArgs { solana_share_bps: Some(bps), ..args(ticker) }
}

fn with_share(bps: u16) -> Launchpad {
    let mut l = lp();
    ctx_at("dev.testnet", FEE, T0);
    l.create_box(args_with_share("plunk", bps));
    l
}

/// Two market bids of 100 NEAR: accepted 200, net 198 after the 1% raise fee.
fn open_market_box(l: &mut Launchpad) {
    for who in ["a.testnet", "b.testnet"] {
        ctx_at(WNEAR, 0, T0 + SEC);
        let _ = l.ft_on_transfer(id(who), U128(100 * NEAR), r#"{"box_id":0,"kind":"market"}"#.to_string());
    }
    ctx_at("anyone.testnet", 0, REVEAL_END);
    l.open(0);
}

#[test]
fn share_is_stored() {
    assert_eq!(with_share(3000).get_box(0).unwrap().solana_share_bps, 3000);
}

#[test]
fn share_defaults_to_zero() {
    assert_eq!(with_box().get_box(0).unwrap().solana_share_bps, 0);
}

#[test]
#[should_panic(expected = "solana share must be 0-5000 bps")]
fn share_above_half_is_rejected() {
    with_share(5001);
}

#[test]
fn half_is_the_ceiling() {
    assert_eq!(with_share(5000).get_box(0).unwrap().solana_share_bps, 5000);
}

#[test]
fn open_holds_the_share_back_from_the_rhea_seed() {
    let mut l = with_share(3000);
    open_market_box(&mut l);
    let b = l.get_box(0).unwrap();
    let m = b.mirror.clone().expect("mirror leg set at open");
    assert_eq!(m.wnear.0, 198 * NEAR * 3 / 10, "30% of the net raise");
    assert_eq!(m.coins.0, POOL_COINS * 3 / 10, "30% of the LP coins");
    assert!(!m.sent);
    assert_eq!(b.rhea_seed(), [198 * NEAR * 7 / 10, POOL_COINS * 7 / 10], "Rhea gets the rest");
    assert_eq!(b.opening.as_ref().unwrap().accepted_total.0, 200 * NEAR, "clearing is untouched");
}

#[test]
fn zero_share_leaves_the_seed_whole() {
    let mut l = with_box();
    open_market_box(&mut l);
    let b = l.get_box(0).unwrap();
    assert!(b.mirror.is_none());
    assert_eq!(b.rhea_seed(), [198 * NEAR, POOL_COINS]);
}

#[test]
fn mirror_part_rounds_toward_rhea() {
    assert_eq!(mirror_part(10, 3333), 3);
    assert_eq!(mirror_part(0, 5000), 0);
    assert_eq!(mirror_part(POOL_COINS, 10_000), POOL_COINS);
}
