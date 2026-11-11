//! Dev escrow, dev tax and treasury (FR-019, FR-022–FR-026, data-model DevEscrow / TreasuryDeposit).
//! The dev's own fills never leave the launchpad except through `dev_withdraw`; a share decided
//! by the linear 90% → 0% tax goes to the coin's holder pot instead.
use crate::ref_ext::ext_ft;
use crate::types::{LaunchBox, Phase, Split, TAX_WINDOW_SECS};
use crate::{events, Launchpad, LaunchpadExt};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, Promise, PromiseError};

pub const MAX_TAX_BPS: u128 = 9_000;
const BPS: u128 = 10_000;
pub const TREASURY_WINDOW_NS: u64 = 7 * 86_400 * 1_000_000_000;
const GAS_FT: Gas = Gas::from_tgas(15);
const GAS_CALLBACK: Gas = Gas::from_tgas(10);

/// Coins the dev won in their own box, released only through the tax (FR-022).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DevEscrow {
    pub balance: U128,
    pub window_start: u64,
    pub window_end: u64,
}

/// Kept buyback coins. Each deposit runs its own 7-day curve from `deposited_at` (FR-025).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TreasuryDeposit {
    pub remaining: U128,
    pub deposited_at: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Withdrawal {
    pub to_dev: U128,
    pub to_holders: U128,
    pub rate_bps: u16,
}

/// Where a failed payout puts the coins back.
#[near(serializers = [json])]
#[derive(Clone, Copy, Debug)]
pub enum Restore {
    Escrow,
    Treasury { deposited_at: u64 },
}

fn remaining_ns(now: u64, start: u64, end: u64) -> (u128, u128) {
    let window = end.saturating_sub(start) as u128;
    let left = end.saturating_sub(now.max(start)) as u128;
    (left.min(window), window)
}

/// The displayed rate: floor(9000 × remaining / window) bps, 0 after the window.
pub fn rate_bps(now: u64, start: u64, end: u64) -> u16 {
    let (left, window) = remaining_ns(now, start, end);
    if window == 0 { 0 } else { (MAX_TAX_BPS * left / window) as u16 }
}

/// FR-023 / SC-003: holders get ceil(W × 0.9 × remaining / window), the dev the rest.
pub fn split_withdrawal(amount: u128, now: u64, start: u64, end: u64) -> Withdrawal {
    let (left, window) = remaining_ns(now, start, end);
    let to_holders = if window == 0 || left == 0 { 0 } else { plunk_math::mul_div_ceil(amount, MAX_TAX_BPS * left, BPS * window) };
    Withdrawal { to_dev: U128(amount - to_holders), to_holders: U128(to_holders), rate_bps: rate_bps(now, start, end) }
}

/// Draws `amount` from the oldest deposits first, each taxed on its own curve. Returns the split
/// and the `deposited_at` of the oldest deposit touched (for a restore on failure).
pub fn draw_treasury(deposits: &mut Vec<TreasuryDeposit>, amount: u128, now: u64) -> (Withdrawal, u64) {
    let mut left = amount;
    let (mut holders, mut oldest) = (0u128, u64::MAX);
    while left > 0 {
        let d = deposits.first_mut().expect("not enough in treasury");
        let take = left.min(d.remaining.0);
        holders += split_withdrawal(take, now, d.deposited_at, d.deposited_at + TREASURY_WINDOW_NS).to_holders.0;
        oldest = oldest.min(d.deposited_at);
        d.remaining = U128(d.remaining.0 - take);
        left -= take;
        if d.remaining.0 == 0 {
            deposits.remove(0);
        }
    }
    let rate = if amount == 0 { 0 } else { (holders * BPS / amount) as u16 };
    (Withdrawal { to_dev: U128(amount - holders), to_holders: U128(holders), rate_bps: rate }, oldest)
}

#[near]
impl Launchpad {
    /// FR-023: the dev takes `amount` from escrow; holders get the taxed part as coins. Attach
    /// 1 yocto, or the coin's storage deposit if the dev is not registered with it yet.
    #[payable]
    pub fn dev_withdraw(&mut self, box_id: u64, amount: U128) -> Promise {
        let b = self.assert_dev_open(box_id);
        require!(amount.0 > 0 && amount.0 <= b.escrow.balance.0, "amount exceeds escrow");
        let w = split_withdrawal(amount.0, env::block_timestamp(), b.escrow.window_start, b.escrow.window_end);
        let bx = self.boxes.get_mut(&box_id).unwrap();
        bx.escrow.balance = U128(bx.escrow.balance.0 - amount.0);
        self.plunked(box_id, "escrow", amount, &w);
        self.pay_split(box_id, &w, Restore::Escrow)
    }

    /// FR-024: only after the window ended; the new one restarts at 90%.
    #[payable]
    pub fn dev_extend(&mut self, box_id: u64, secs: u32) {
        near_sdk::assert_one_yocto();
        let b = self.assert_dev_open(box_id);
        let now = env::block_timestamp();
        require!(now >= b.escrow.window_end, "window still running");
        require!((TAX_WINDOW_SECS.0..=TAX_WINDOW_SECS.1).contains(&secs), "window must be 24h-7d");
        let bx = self.boxes.get_mut(&box_id).unwrap();
        bx.escrow.window_start = now;
        bx.escrow.window_end = now + secs as u64 * 1_000_000_000;
        events::emit("dev_extended", &json!({ "box_id": box_id, "window_start": now, "window_end": bx.escrow.window_end }));
    }

    /// FR-019: the dev may only move their own share toward holders and buybacks, never back.
    #[payable]
    pub fn shift_split(&mut self, box_id: u64, split: Split) {
        near_sdk::assert_one_yocto();
        let b = self.boxes.get(&box_id).expect("no such box");
        require!(env::predecessor_account_id() == b.dev, "dev only");
        require!(split.is_valid(), "split must sum to 10000");
        require!(split.dev <= b.split.dev, "dev share can only decrease");
        self.boxes.get_mut(&box_id).unwrap().split = split.clone();
        events::emit("split_shifted", &json!({ "box_id": box_id, "split": split }));
    }

    /// FR-025: kept buyback coins leave only through the tax, oldest deposit first.
    #[payable]
    pub fn treasury_withdraw(&mut self, box_id: u64, amount: U128) -> Promise {
        self.assert_dev_open(box_id);
        require!(amount.0 > 0, "amount must be positive");
        let bx = self.boxes.get_mut(&box_id).unwrap();
        require!(amount.0 <= bx.treasury.iter().map(|d| d.remaining.0).sum::<u128>(), "amount exceeds treasury");
        let (w, oldest) = draw_treasury(&mut bx.treasury, amount.0, env::block_timestamp());
        self.plunked(box_id, "treasury", amount, &w);
        self.pay_split(box_id, &w, Restore::Treasury { deposited_at: oldest })
    }

    pub fn preview_withdraw(&self, box_id: u64, amount: U128) -> Withdrawal {
        let b = self.boxes.get(&box_id).expect("no such box");
        split_withdrawal(amount.0, env::block_timestamp(), b.escrow.window_start, b.escrow.window_end)
    }

    pub fn preview_treasury_withdraw(&self, box_id: u64, amount: U128) -> Withdrawal {
        let mut deposits = self.boxes.get(&box_id).expect("no such box").treasury.clone();
        draw_treasury(&mut deposits, amount.0, env::block_timestamp()).0
    }

    /// Puts coins back where they came from if a transfer failed; holder coins also leave the pot.
    #[private]
    pub fn on_tax_paid(&mut self, box_id: u64, amount: U128, to_holders: bool, restore: Restore, #[callback_result] r: Result<(), PromiseError>) {
        if r.is_ok() {
            return;
        }
        let bx = self.boxes.get_mut(&box_id).unwrap();
        if to_holders {
            bx.coin_pot = U128(bx.coin_pot.0 - amount.0);
        }
        match restore {
            Restore::Escrow => bx.escrow.balance = U128(bx.escrow.balance.0 + amount.0),
            Restore::Treasury { deposited_at } => bx.treasury.insert(0, TreasuryDeposit { remaining: amount, deposited_at }),
        }
    }
}

impl Launchpad {
    /// Harvest (T026) parks kept buyback coins here; also the seam the unit tests use.
    pub fn add_treasury(&mut self, box_id: u64, amount: u128) {
        let bx = self.boxes.get_mut(&box_id).expect("no such box");
        bx.treasury.push(TreasuryDeposit { remaining: U128(amount), deposited_at: env::block_timestamp() });
    }

    fn assert_dev_open(&self, box_id: u64) -> LaunchBox {
        let b = self.boxes.get(&box_id).expect("no such box").clone();
        require!(env::attached_deposit() >= NearToken::from_yoctonear(1), "attach 1 yocto");
        require!(env::predecessor_account_id() == b.dev, "dev only");
        require!(b.phase == Phase::Open, "box not open");
        b
    }

    fn plunked(&self, box_id: u64, source: &str, amount: U128, w: &Withdrawal) {
        let data = json!({ "box_id": box_id, "source": source, "amount": amount, "to_holders": w.to_holders, "to_dev": w.to_dev, "rate_bps": w.rate_bps });
        events::emit("dev_plunked", &data);
    }

    /// Holder coins go to the coin contract (its own balance is the pot); the rest to the dev.
    /// Each transfer undoes itself on failure, so one failing never blocks the other.
    fn pay_split(&mut self, box_id: u64, w: &Withdrawal, restore: Restore) -> Promise {
        let bx = self.boxes.get_mut(&box_id).unwrap();
        bx.coin_pot = U128(bx.coin_pot.0 + w.to_holders.0);
        let (coin, dev) = (bx.coin_id.clone(), bx.dev.clone());
        let holders = (w.to_holders.0 > 0).then(|| self.send(coin.clone(), coin.clone(), w.to_holders, "dev tax to holders", box_id, true, restore));
        let to_dev = (w.to_dev.0 > 0).then(|| self.send(coin, dev, w.to_dev, "dev withdrawal", box_id, false, restore));
        // A joint promise cannot be returned from a method, so the holder leg runs detached.
        match (holders, to_dev) {
            (Some(h), Some(d)) => {
                h.detach();
                d
            }
            (Some(p), None) | (None, Some(p)) => p,
            (None, None) => unreachable!("amount is positive"),
        }
    }

    fn send(&self, coin: AccountId, to: AccountId, amount: U128, memo: &str, box_id: u64, to_holders: bool, restore: Restore) -> Promise {
        let storage = env::attached_deposit();
        let transfer = ext_ft::ext(coin.clone()).with_attached_deposit(NearToken::from_yoctonear(1)).with_static_gas(GAS_FT).ft_transfer(to.clone(), amount, Some(memo.into()));
        let transfer = if to_holders || storage <= NearToken::from_yoctonear(1) {
            transfer
        } else {
            ext_ft::ext(coin).with_attached_deposit(storage).with_static_gas(GAS_FT).storage_deposit(Some(to), Some(true)).then(transfer)
        };
        transfer.then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_tax_paid(box_id, amount, to_holders, restore))
    }
}
