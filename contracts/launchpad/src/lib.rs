//! Plunk launchpad: sealed boxes that open at one price (contracts/launchpad.md).
pub mod bids;
pub mod claims;
pub mod clearing;
pub mod escrow;
pub mod harvest;
pub mod migrate;
pub mod open;
mod events;
pub mod ref_ext;
pub mod types;

use near_sdk::json_types::{Base58CryptoHash, U128};
use near_sdk::store::{IterableMap, LookupMap, LookupSet};
use near_sdk::{assert_one_yocto, env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};
use types::{validate, BoxArgs, LaunchBox, Phase, Split};

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

#[near]
#[derive(BorshStorageKey)]
pub(crate) enum Key {
    Boxes,
    Tickers,
    Bids,
    BidsByRecipient,
    Late,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Config {
    pub owner: AccountId,
    pub coin_code_hash: Base58CryptoHash,
    pub exchange: AccountId,
    pub wnear: AccountId,
    pub creation_fee: U128,
    pub min_raise_floor: U128,
    /// [NEAR pot, coin pot] minimums below which an epoch rolls over (FR-018).
    pub min_distributable: (U128, U128),
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Launchpad {
    config: Config,
    boxes: IterableMap<u64, LaunchBox>,
    tickers: LookupSet<String>,
    next_id: u64,
    bids: LookupMap<(u64, u32), bids::Bid>,
    bids_by_recipient: LookupMap<(u64, AccountId), Vec<u32>>,
    /// FR-028: deposits that could not become bids, claimable by this account.
    late: LookupMap<AccountId, u128>,
    /// 1% raise fees taken at Open (FR-012), held as wNEAR for the owner.
    protocol_fees: u128,
}

#[near]
impl Launchpad {
    #[init]
    pub fn new(owner: AccountId, coin_code_hash: Base58CryptoHash, exchange: AccountId, wnear: AccountId, creation_fee: U128) -> Self {
        let config = Config {
            owner,
            coin_code_hash,
            exchange,
            wnear,
            creation_fee,
            min_raise_floor: U128(NEAR),
            min_distributable: (U128(NEAR / 100), U128(NEAR)),
        };
        Self {
            config,
            boxes: IterableMap::new(Key::Boxes),
            tickers: LookupSet::new(Key::Tickers),
            next_id: 0,
            bids: LookupMap::new(Key::Bids),
            bids_by_recipient: LookupMap::new(Key::BidsByRecipient),
            late: LookupMap::new(Key::Late),
            protocol_fees: 0,
        }
    }

    /// FR-001/002: validates the ranges, reserves the ticker and keeps the creation fee, which later
    /// funds the coin account's storage. Any deposit above the fee is returned.
    #[payable]
    pub fn create_box(&mut self, args: BoxArgs) -> u64 {
        let fee = self.config.creation_fee.0;
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= fee, "creation fee required");
        validate(&args, self.config.min_raise_floor.0).unwrap_or_else(|e| env::panic_str(e));
        require!(self.tickers.insert(args.meta.ticker.clone()), "ticker taken");
        let dev = env::predecessor_account_id();
        let b = self.new_box(dev.clone(), args);
        events::emit("box_created", &b);
        self.boxes.insert(b.id, b.clone());
        if deposit > fee {
            Promise::new(dev).transfer(NearToken::from_yoctonear(deposit - fee)).detach();
        }
        b.id
    }

    /// Owner only. Applies to boxes created afterwards (FR-010).
    #[payable]
    pub fn set_floor(&mut self, floor: U128) {
        assert_one_yocto();
        self.assert_owner();
        self.config.min_raise_floor = floor;
    }

    pub fn get_box(&self, id: u64) -> Option<LaunchBox> {
        self.boxes.get(&id).cloned()
    }

    pub fn get_config(&self) -> &Config {
        &self.config
    }

    /// 1% raise fees collected so far, held as wNEAR (FR-012).
    pub fn get_protocol_fees(&self) -> U128 {
        U128(self.protocol_fees)
    }
}

impl Launchpad {
    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.config.owner, "owner only");
    }

    fn new_box(&mut self, dev: AccountId, a: BoxArgs) -> LaunchBox {
        let id = self.next_id;
        self.next_id += 1;
        let coin_id = format!("{}.{}", a.meta.ticker, env::current_account_id()).parse().expect("coin account id");
        LaunchBox {
            id,
            dev,
            meta: a.meta,
            coin_id,
            room_secs: a.room_secs,
            close_at: env::block_timestamp() + a.room_secs as u64 * 1_000_000_000,
            min_raise: a.min_raise,
            fee_bps: a.fee_bps,
            split: a.split.unwrap_or_else(Split::all_dev),
            tax_window_secs: a.tax_window_secs,
            solana_share_bps: a.solana_share_bps.unwrap_or(0),
            phase: Phase::Bidding,
            total_in: U128(0),
            bidder_count: 0,
            bid_count: 0,
            sealed_count: 0,
            opening: None,
            open_at: 0,
            escrow: Default::default(),
            treasury: Vec::new(),
            coin_pot: U128(0),
            harvest: None,
            last_harvest_epoch: 0,
            per_share_last: U128(0),
            carry_near: U128(0),
            snapshots: Vec::new(),
            mirror: None,
        }
    }
}
