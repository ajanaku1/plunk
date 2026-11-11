//! State upgrade for the Solana-mirror fields (solana-mirror.md phase A): every stored box gains
//! `solana_share_bps = 0` and `mirror = None`. Run once with `--init-function migrate` on deploy.
use crate::types::{LaunchBox, Meta, Phase, Split};
use crate::{bids, Config, Key, Launchpad, LaunchpadExt};
use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, LookupMap, LookupSet};
use near_sdk::{env, near, AccountId};

/// `LaunchBox` as stored before 2026-11-11.
#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct OldLaunchBox {
    pub id: u64,
    pub dev: AccountId,
    pub meta: Meta,
    pub coin_id: AccountId,
    pub room_secs: u32,
    pub close_at: u64,
    pub min_raise: U128,
    pub fee_bps: u16,
    pub split: Split,
    pub tax_window_secs: u32,
    pub phase: Phase,
    pub total_in: U128,
    pub bidder_count: u32,
    pub bid_count: u32,
    pub sealed_count: u32,
    pub opening: Option<crate::open::Opening>,
    pub open_at: u64,
    pub escrow: crate::escrow::DevEscrow,
    pub treasury: Vec<crate::escrow::TreasuryDeposit>,
    pub coin_pot: U128,
    pub harvest: Option<crate::harvest::Harvest>,
    pub last_harvest_epoch: u64,
    pub per_share_last: U128,
    pub carry_near: U128,
    pub snapshots: Vec<crate::harvest::Snapshot>,
}

impl OldLaunchBox {
    fn upgrade(self) -> LaunchBox {
        LaunchBox {
            id: self.id,
            dev: self.dev,
            meta: self.meta,
            coin_id: self.coin_id,
            room_secs: self.room_secs,
            close_at: self.close_at,
            min_raise: self.min_raise,
            fee_bps: self.fee_bps,
            split: self.split,
            tax_window_secs: self.tax_window_secs,
            solana_share_bps: 0,
            phase: self.phase,
            total_in: self.total_in,
            bidder_count: self.bidder_count,
            bid_count: self.bid_count,
            sealed_count: self.sealed_count,
            opening: self.opening,
            open_at: self.open_at,
            escrow: self.escrow,
            treasury: self.treasury,
            coin_pot: self.coin_pot,
            harvest: self.harvest,
            last_harvest_epoch: self.last_harvest_epoch,
            per_share_last: self.per_share_last,
            carry_near: self.carry_near,
            snapshots: self.snapshots,
            mirror: None,
        }
    }
}

/// The contract root as stored before 2026-11-11 (only the box value type differs).
#[near(serializers = [borsh])]
pub struct OldLaunchpad {
    config: Config,
    boxes: IterableMap<u64, OldLaunchBox>,
    tickers: LookupSet<String>,
    next_id: u64,
    bids: LookupMap<(u64, u32), bids::Bid>,
    bids_by_recipient: LookupMap<(u64, AccountId), Vec<u32>>,
    late: LookupMap<AccountId, u128>,
    protocol_fees: u128,
}

#[near]
impl Launchpad {
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let OldLaunchpad { config, boxes: mut old_boxes, tickers, next_id, bids, bids_by_recipient, late, protocol_fees } =
            env::state_read().expect("no state to migrate");
        let upgraded: Vec<(u64, LaunchBox)> = old_boxes.iter().map(|(id, b)| (*id, b.clone().upgrade())).collect();
        // Clear and flush the old map before the new one writes under the same prefix.
        old_boxes.clear();
        drop(old_boxes);
        let mut boxes = IterableMap::new(Key::Boxes);
        for (id, b) in upgraded {
            boxes.insert(id, b);
        }
        Self { config, boxes, tickers, next_id, bids, bids_by_recipient, late, protocol_fees }
    }
}
