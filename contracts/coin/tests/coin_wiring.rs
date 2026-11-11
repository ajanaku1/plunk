//! T012: the contract routes transfers and wNEAR pots through the epoch hook.
use near_contract_standards::fungible_token::metadata::{FungibleTokenMetadata, FT_METADATA_SPEC};
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::fungible_token::FungibleTokenCore;
use near_contract_standards::storage_management::StorageManagement;
use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken};
use plunk_coin::Coin;

const HOUR: u64 = 3_600_000_000_000;

fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn at(epoch: u64, caller: &str, deposit: u128) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(id("coin.plunk.near"))
        .predecessor_account_id(id(caller))
        .block_timestamp(epoch * HOUR + 1)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .build());
}

fn setup() -> Coin {
    at(9, "plunk.near", 0);
    let meta = FungibleTokenMetadata {
        spec: FT_METADATA_SPEC.into(),
        name: "Plunk".into(),
        symbol: "PLUNK".into(),
        icon: None,
        reference: None,
        reference_hash: None,
        decimals: 24,
    };
    let mut c = Coin::new(id("plunk.near"), id("v2.ref-finance.near"), id("wrap.near"), meta);
    at(9, "plunk.near", NearToken::from_near(1).as_yoctonear());
    c.storage_deposit(Some(id("alice.near")), None);
    c.storage_deposit(Some(id("bob.near")), None);
    c
}

#[test]
fn epoch_contract_wiring_in_hour_buyer_earns_zero() {
    let mut c = setup();
    at(9, "plunk.near", 1);
    c.ft_transfer(id("alice.near"), U128(100), None);
    at(10, "plunk.near", 1);
    c.ft_transfer(id("bob.near"), U128(50), None);
    at(11, "wrap.near", 0);
    c.ft_on_transfer(id("plunk.near"), U128(30), String::new());
    at(11, "plunk.near", 0);
    c.distribute(10, U128(0), (U128(0), U128(0)));
    assert_eq!(c.get_claimable(id("alice.near")).near, U128(30));
    assert_eq!(c.get_claimable(id("bob.near")).near, U128(0));
    // Moving coins afterwards does not change what was earned.
    at(11, "alice.near", 1);
    c.ft_transfer(id("bob.near"), U128(100), None);
    assert_eq!(c.get_claimable(id("alice.near")).near, U128(30));
}

#[test]
fn epoch_contract_rejects_foreign_pots() {
    let mut c = setup();
    at(9, "evil.near", 0);
    let back = c.ft_on_transfer(id("plunk.near"), U128(30), String::new());
    assert!(matches!(back, near_sdk::PromiseOrValue::Value(U128(30))));
    assert_eq!(c.get_global().pending, [0, 0]);
}

#[test]
#[should_panic(expected = "launchpad only")]
fn epoch_contract_distribute_launchpad_only() {
    let mut c = setup();
    at(11, "alice.near", 0);
    c.distribute(10, U128(0), (U128(0), U128(0)));
}
