//! T014 (FR-001, FR-002, FR-010): create_box validation, storage and the creation fee.
use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken};
use plunk_launchpad::types::{BoxArgs, Meta, Phase, Split};
use plunk_launchpad::Launchpad;

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const FEE: u128 = NEAR / 10;
const SEC: u64 = 1_000_000_000;
const T0: u64 = 1_800_000_000 * SEC;

fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(caller: &str, deposit: u128) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(id("plunk.testnet"))
        .predecessor_account_id(id(caller))
        .block_timestamp(T0)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .build());
}

fn lp() -> Launchpad {
    ctx("owner.testnet", 0);
    Launchpad::new(
        id("owner.testnet"),
        "11111111111111111111111111111111".parse().unwrap(),
        id("ref-finance-101.testnet"),
        id("wrap.testnet"),
        U128(FEE),
    )
}

fn args(ticker: &str) -> BoxArgs {
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

fn create(l: &mut Launchpad, a: BoxArgs) -> u64 {
    ctx("dev.testnet", FEE);
    l.create_box(a)
}

#[test]
fn create_box_stores_and_numbers_boxes() {
    let mut l = lp();
    assert_eq!(create(&mut l, args("plunk")), 0);
    assert_eq!(create(&mut l, args("cat2")), 1);
    let b = l.get_box(0).unwrap();
    assert_eq!(b.dev, id("dev.testnet"));
    assert_eq!(b.coin_id, id("plunk.plunk.testnet"));
    assert_eq!(b.close_at, T0 + 300 * SEC);
    assert_eq!(b.phase, Phase::Bidding);
    assert_eq!(b.split, Split::all_dev());
    assert_eq!(b.total_in, U128(0));
}

#[test]
#[should_panic(expected = "ticker taken")]
fn create_box_rejects_duplicate_ticker() {
    let mut l = lp();
    create(&mut l, args("plunk"));
    create(&mut l, args("plunk"));
}

#[test]
#[should_panic(expected = "creation fee")]
fn create_box_requires_creation_fee() {
    let mut l = lp();
    ctx("dev.testnet", FEE - 1);
    l.create_box(args("plunk"));
}

fn rejects(f: impl FnOnce(&mut BoxArgs), msg: &str) {
    let mut a = args("plunk");
    f(&mut a);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| create(&mut lp(), a)));
    let err = r.expect_err(msg);
    let text = err.downcast_ref::<String>().cloned().unwrap_or_default();
    assert!(text.contains(msg), "expected {msg:?}, got {text:?}");
}

#[test]
fn create_box_validates_ranges() {
    rejects(|a| a.room_secs = 119, "room");
    rejects(|a| a.room_secs = 601, "room");
    rejects(|a| a.fee_bps = 49, "fee");
    rejects(|a| a.fee_bps = 301, "fee");
    rejects(|a| a.tax_window_secs = 86_399, "tax window");
    rejects(|a| a.tax_window_secs = 604_801, "tax window");
    rejects(|a| a.min_raise = U128(NEAR - 1), "min raise");
    rejects(|a| a.split = Some(Split { dev: 5000, holders: 4000, buyback_burn: 0, buyback_keep: 0 }), "split");
    for bad in ["a", "abcdefghijk", "Plunk", "plu-nk", "plu.nk"] {
        rejects(|a| a.meta.ticker = bad.into(), "ticker");
    }
}

#[test]
fn create_box_floor_change_spares_existing_boxes() {
    let mut l = lp();
    create(&mut l, args("plunk"));
    ctx("owner.testnet", 1);
    l.set_floor(U128(5 * NEAR));
    assert_eq!(l.get_box(0).unwrap().min_raise, U128(NEAR));
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| create(&mut l, args("cat2"))));
    assert!(r.is_err());
}
