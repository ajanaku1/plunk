//! Box types and creation rules (data-model.md, FR-001).
use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

pub const ROOM_SECS: (u32, u32) = (120, 600);
pub const FEE_BPS: (u16, u16) = (50, 300);
pub const TAX_WINDOW_SECS: (u32, u32) = (86_400, 604_800);
pub const TICKER_LEN: (usize, usize) = (2, 10);
/// Share of the LP half (coins and net raise) set aside for the Solana mirror (solana-mirror.md).
pub const SOLANA_SHARE_BPS: (u16, u16) = (0, 5_000);

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Meta {
    pub name: String,
    pub ticker: String,
    pub image: String,
    pub description: String,
}

/// Basis points of the dev's 75% share. Sums to 10000.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Split {
    pub dev: u16,
    pub holders: u16,
    pub buyback_burn: u16,
    pub buyback_keep: u16,
}

impl Split {
    pub fn all_dev() -> Self {
        Split { dev: 10_000, holders: 0, buyback_burn: 0, buyback_keep: 0 }
    }

    pub fn is_valid(&self) -> bool {
        [self.dev, self.holders, self.buyback_burn, self.buyback_keep].iter().map(|&v| v as u32).sum::<u32>() == 10_000
    }
}

/// Closed and Reveal are derived from time while a box is `Bidding`.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Bidding,
    Opening,
    Open,
    Failed,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct BoxArgs {
    pub meta: Meta,
    pub room_secs: u32,
    pub min_raise: U128,
    pub fee_bps: u16,
    pub split: Option<Split>,
    pub tax_window_secs: u32,
    /// Basis points of the LP half held for the Solana mirror. 0 when omitted.
    #[serde(default)]
    pub solana_share_bps: Option<u16>,
}

/// The Solana leg set aside at Open, held by the launchpad until it is sent (solana-mirror.md phase B).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Mirror {
    pub coins: U128,
    pub wnear: U128,
    pub sent: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct LaunchBox {
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
    pub solana_share_bps: u16,
    pub phase: Phase,
    pub total_in: U128,
    pub bidder_count: u32,
    pub bid_count: u32,
    pub sealed_count: u32,
    /// Set when Open starts (FR-008/014).
    pub opening: Option<crate::open::Opening>,
    pub open_at: u64,
    /// The dev's own fills, released only through the tax (FR-022).
    pub escrow: crate::escrow::DevEscrow,
    /// Kept buyback coins, oldest first (FR-025).
    pub treasury: Vec<crate::escrow::TreasuryDeposit>,
    /// Holder coins already sent to the coin contract and waiting for the next harvest to distribute.
    pub coin_pot: U128,
    /// An hourly harvest in progress (FR-016); `None` between harvests.
    pub harvest: Option<crate::harvest::Harvest>,
    pub last_harvest_epoch: u64,
    /// sqrt(k) per LP share × 1e18 after the last harvest (research R3 fee isolation).
    pub per_share_last: U128,
    /// Holder NEAR that failed to reach the coin contract, retried at the next harvest.
    pub carry_near: U128,
    /// Pool reserves seen at each harvest, newest last, one week kept (research R7 chart fallback).
    pub snapshots: Vec<crate::harvest::Snapshot>,
    /// Coins and wNEAR kept out of the Rhea seed for the Solana mirror; `None` when the share is 0.
    pub mirror: Option<Mirror>,
}

fn in_range<T: PartialOrd>(v: T, (lo, hi): (T, T)) -> bool {
    lo <= v && v <= hi
}

pub fn valid_ticker(t: &str) -> bool {
    in_range(t.len(), TICKER_LEN) && t.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}

/// Range checks for FR-001 / FR-010. Returns the first rule broken.
pub fn validate(a: &BoxArgs, floor: u128) -> Result<(), &'static str> {
    if !valid_ticker(&a.meta.ticker) {
        return Err("ticker must be 2-10 chars of a-z0-9");
    }
    if !in_range(a.room_secs, ROOM_SECS) {
        return Err("room must be 120-600 s");
    }
    if !in_range(a.fee_bps, FEE_BPS) {
        return Err("fee must be 50-300 bps");
    }
    if !in_range(a.tax_window_secs, TAX_WINDOW_SECS) {
        return Err("tax window must be 24h-7d");
    }
    if !in_range(a.solana_share_bps.unwrap_or(0), SOLANA_SHARE_BPS) {
        return Err("solana share must be 0-5000 bps");
    }
    if a.min_raise.0 < floor {
        return Err("min raise below the floor");
    }
    if a.split.as_ref().is_some_and(|s| !s.is_valid()) {
        return Err("split must sum to 10000");
    }
    Ok(())
}
