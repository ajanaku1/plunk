//! Shared unit-test harness for the launchpad (host-side, near-sdk `unit-testing`).
#![allow(dead_code)]
use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken};
use plunk_launchpad::types::{BoxArgs, Meta};
use plunk_launchpad::Launchpad;

pub const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const FEE: u128 = NEAR / 10;
pub const SEC: u64 = 1_000_000_000;
pub const T0: u64 = 1_800_000_000 * SEC;
pub const WNEAR: &str = "wrap.testnet";

pub fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}

pub fn ctx_at(caller: &str, deposit: u128, ts: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(id("plunk.testnet"))
        .predecessor_account_id(id(caller))
        .block_timestamp(ts)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .build());
}

pub fn lp() -> Launchpad {
    ctx_at("owner.testnet", 0, T0);
    Launchpad::new(
        id("owner.testnet"),
        "11111111111111111111111111111111".parse().unwrap(),
        id("ref-finance-101.testnet"),
        id(WNEAR),
        U128(FEE),
    )
}

pub fn args(ticker: &str) -> BoxArgs {
    BoxArgs {
        meta: Meta { name: "Plunk".into(), ticker: ticker.into(), image: String::new(), description: String::new() },
        room_secs: 300,
        min_raise: U128(NEAR),
        fee_bps: 300,
        split: None,
        tax_window_secs: 86_400,
        solana_share_bps: None,
    }
}

/// A box created at T0 with a 300 s room, so it closes at T0 + 300 s.
pub fn with_box() -> Launchpad {
    let mut l = lp();
    ctx_at("dev.testnet", FEE, T0);
    l.create_box(args("plunk"));
    l
}
