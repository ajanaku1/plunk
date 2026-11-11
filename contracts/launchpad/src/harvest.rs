//! Hourly fee harvest (FR-016, FR-017, FR-018; data-model Harvest; research R3).
//! Fees are the growth of sqrt(k) per LP share. Each harvest removes exactly the launchpad's
//! accrued share, withdraws both tokens, nets the coin side against the buyback first, swaps
//! only the imbalance, then pays protocol / dev / holders in wNEAR and burns or keeps coins.
//! Every async step records its result on `box.harvest`, so a later `harvest` call resumes it.
use crate::claims::Undo;
use crate::ref_ext::{ext_ft, ext_ref, PoolInfo, SwapAction, DEPOSIT_MSG};
use crate::types::{LaunchBox, Phase};
use crate::{events, Launchpad, LaunchpadExt};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, ext_contract, near, require, Gas, NearToken, Promise, PromiseError};
use plunk_math::{isqrt_mul, mul_div};

pub const SCALE: u128 = 1_000_000_000_000_000_000;
pub const EPOCH_NS: u64 = 3_600 * 1_000_000_000;
const BPS: u128 = 10_000;
/// Swaps below this many yocto of value are not worth a transaction; the dust goes to holders.
const MIN_SWAP: u128 = 10_000_000_000_000_000_000; // 0.00001 NEAR
const GAS_VIEW: Gas = Gas::from_tgas(10);
const GAS_STEP: Gas = Gas::from_tgas(30);
const GAS_SWAP: Gas = Gas::from_tgas(60);
const GAS_CALLBACK: Gas = Gas::from_tgas(25);
const GAS_NEXT_STEP: Gas = Gas::from_tgas(100);
/// The pay step attaches ~225 Tgas of static gas (reward, distribute, burn, dev, callbacks), so it
/// only starts from a call that has that much left: a fresh keeper call, never a 25 Tgas callback
/// topped up with the parent's unused gas.
const GAS_PAY_STEP: Gas = Gas::from_tgas(260);
const ONE: NearToken = NearToken::from_yoctonear(1);
/// NEP-145 registration on wNEAR (0.00125 NEAR).
const WNEAR_STORAGE: NearToken = NearToken::from_yoctonear(1_250_000_000_000_000_000_000);

#[allow(dead_code)]
#[ext_contract(ext_coin)]
trait PlunkCoin {
    fn distribute(&mut self, epoch: u64, coin_amount: U128, min: (U128, U128));
    fn burn(&mut self, amount: U128);
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Swap {
    /// 0 = sell wNEAR for coin, 1 = sell coin for wNEAR.
    pub side: u8,
    pub amount_in: U128,
    pub min_out: U128,
    pub sent: bool,
    pub out: Option<U128>,
    pub withdrawn: bool,
}

/// One harvest in flight. `None` fields are steps not reached yet.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Harvest {
    pub epoch: u64,
    pub remove: U128,
    pub per_share: U128,
    /// Pool reserves [wNEAR, coin] seen at the start.
    pub reserves: [U128; 2],
    /// Tokens returned by `remove_liquidity`, then adjusted by the swap.
    pub got: Option<[U128; 2]>,
    pub withdrawn: [bool; 2],
    pub swap: Option<Swap>,
    pub paid: bool,
}

/// Pool reserves [wNEAR, coin] at a harvest: the hourly price series every client can read.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Snapshot {
    pub ts: u64,
    pub reserves: [U128; 2],
}
pub const MAX_SNAPSHOTS: usize = 24 * 7;

/// Amounts of one harvest's payout, in wNEAR yocto and coin units.
#[near(serializers = [json])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Payout {
    pub protocol: U128,
    pub dev: U128,
    pub holders_near: U128,
    pub burn: U128,
    pub keep: U128,
}

pub fn epoch_of(ts: u64) -> u64 {
    ts / EPOCH_NS
}

/// sqrt(x·y) / shares, scaled by 1e18.
pub fn per_share(x: u128, y: u128, shares: u128) -> u128 {
    // Saturates instead of panicking: this also runs inside the Open callback, which must never fail.
    if shares == 0 { 0 } else { plunk_math::checked_mul_div(isqrt_mul(x, y), SCALE, shares).unwrap_or(u128::MAX) }
}

/// Shares to remove so the launchpad takes exactly its fee growth: ours × (1 − last/now) (R3).
pub fn shares_to_remove(ours: u128, per_share_last: u128, per_share_now: u128) -> u128 {
    if per_share_now <= per_share_last || per_share_now == 0 { 0 } else { ours - mul_div(ours, per_share_last, per_share_now) }
}

/// Pool price of one coin unit in wNEAR, applied to `coins`.
fn coin_value(coins: u128, reserves: [u128; 2]) -> u128 {
    if reserves[1] == 0 { 0 } else { mul_div(coins, reserves[0], reserves[1]) }
}

/// FR-017: how much of which token to swap so the coin side exactly covers the buyback share.
/// `got` = [wNEAR, coin] received; returns (side, amount_in, min_out) or None when balanced.
pub fn plan_swap(got: [u128; 2], reserves: [u128; 2], buy_bps: u128, fee_bps: u128) -> Option<(u8, u128, u128)> {
    let coin_v = coin_value(got[1], reserves);
    let value = got[0] + coin_v;
    let buy_v = mul_div(value, 75 * buy_bps, 80 * BPS);
    let (side, amount_in) = if coin_v > buy_v {
        (1u8, mul_div(coin_v - buy_v, reserves[1], reserves[0].max(1)))
    } else {
        (0u8, buy_v - coin_v)
    };
    let in_value = if side == 0 { amount_in } else { coin_value(amount_in, reserves) };
    if amount_in == 0 || in_value < MIN_SWAP {
        return None;
    }
    let (rin, rout) = if side == 0 { (reserves[0], reserves[1]) } else { (reserves[1], reserves[0]) };
    let net_in = mul_div(amount_in, BPS - fee_bps, BPS);
    let expected = mul_div(net_in, rout, rin + net_in);
    Some((side, amount_in, expected * 95 / 100))
}

/// Splits what the harvest finally holds: wNEAR by the protocol / dev / holders value targets
/// (dust to holders, FR-016), coins by burn : keep.
pub fn payout(got: [u128; 2], reserves: [u128; 2], split: &crate::types::Split, carry_near: u128) -> Payout {
    let value = got[0] + coin_value(got[1], reserves);
    let dev_share = |bps: u16| mul_div(value, 75 * bps as u128, 80 * BPS);
    let targets = [mul_div(value, 5, 80), dev_share(split.dev), dev_share(split.holders)];
    let near_total: u128 = targets.iter().sum();
    let scale = |t: u128| if near_total == 0 { 0 } else { mul_div(got[0], t, near_total) };
    let (protocol, dev) = (scale(targets[0]), scale(targets[1]));
    let holders_near = got[0] - protocol - dev + carry_near;
    let buy_bps = split.buyback_burn as u128 + split.buyback_keep as u128;
    let burn = if buy_bps == 0 { 0 } else { mul_div(got[1], split.buyback_burn as u128, buy_bps) };
    let keep = if buy_bps == 0 { 0 } else { got[1] - burn };
    Payout { protocol: U128(protocol), dev: U128(dev), holders_near: U128(holders_near), burn: U128(burn), keep: U128(keep) }
}

#[near]
impl Launchpad {
    /// FR-016: anyone, once per hour per box. Returns None when there is nothing to do this
    /// epoch. A harvest that ran short of gas is resumed by the next call (the keeper loops).
    pub fn harvest(&mut self, box_id: u64) -> Option<Promise> {
        let b = self.boxes.get(&box_id).expect("no such box").clone();
        require!(b.phase == Phase::Open, "box not open");
        if b.harvest.is_some() {
            return Some(self.next_harvest_step(box_id));
        }
        let epoch = epoch_of(env::block_timestamp());
        if b.last_harvest_epoch >= epoch {
            return None;
        }
        let pool_id = b.opening.as_ref().and_then(|o| o.pool_id).expect("no pool");
        Some(
            ext_ref::ext(self.config.exchange.clone())
                .with_static_gas(GAS_VIEW)
                .with_unused_gas_weight(0)
                .get_pool(pool_id)
                .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_harvest_pool(box_id, epoch)),
        )
    }

    #[private]
    pub fn on_harvest_pool(&mut self, box_id: u64, epoch: u64, #[callback_result] r: Result<PoolInfo, PromiseError>) -> Option<Promise> {
        let pool = r.ok()?;
        let b = self.boxes.get_mut(&box_id)?;
        let ours = b.opening.as_ref().map_or(0, |o| o.shares.0);
        let (x, y) = (pool.amounts[0].0, pool.amounts[1].0);
        let now = per_share(x, y, pool.shares_total_supply.0);
        let remove = shares_to_remove(ours, b.per_share_last.0, now);
        b.snapshots.push(Snapshot { ts: env::block_timestamp(), reserves: [U128(x), U128(y)] });
        if b.snapshots.len() > MAX_SNAPSHOTS {
            b.snapshots.remove(0);
        }
        let mut h = Harvest { epoch, remove: U128(remove), per_share: U128(now), reserves: [U128(x), U128(y)], ..Default::default() };
        if remove == 0 {
            h.got = Some([U128(0), U128(0)]);
            h.withdrawn = [true, true];
        }
        b.harvest = Some(h);
        self.continue_harvest(box_id)
    }

    #[private]
    pub fn on_removed(&mut self, box_id: u64, #[callback_result] r: Result<Vec<U128>, PromiseError>) -> Option<Promise> {
        let got = r.ok()?;
        let b = self.boxes.get_mut(&box_id)?;
        let h = b.harvest.as_mut()?;
        h.got = Some([got[0], got[1]]);
        h.withdrawn = [got[0].0 == 0, got[1].0 == 0];
        if let Some(o) = b.opening.as_mut() {
            o.shares = U128(o.shares.0 - h.remove.0);
        }
        self.continue_harvest(box_id)
    }

    #[private]
    pub fn on_withdrawn(&mut self, box_id: u64, side: u8, #[callback_result] r: Result<U128, PromiseError>) -> Option<Promise> {
        r.ok()?;
        self.update_harvest(box_id, |h| h.withdrawn[side as usize] = true)?;
        self.continue_harvest(box_id)
    }

    /// Step 1 of the swap: the deposit `ft_transfer_call` answers with the amount the exchange kept.
    #[private]
    pub fn on_swapped(&mut self, box_id: u64, #[callback_result] r: Result<U128, PromiseError>) -> Option<Promise> {
        let used = r.ok()?;
        let s = self.boxes.get(&box_id)?.harvest.as_ref()?.swap.as_ref()?.clone();
        if used != s.amount_in {
            // The exchange took nothing (or only part); refunds land back in our balance, so skip the swap.
            self.update_harvest(box_id, |h| h.swap = Some(Swap { sent: true, out: Some(U128(0)), withdrawn: true, amount_in: U128(0), ..s }));
            return self.continue_harvest(box_id);
        }
        self.update_harvest(box_id, |h| {
            let s = h.swap.as_mut().unwrap();
            s.sent = true;
            let g = h.got.as_mut().unwrap();
            g[s.side as usize] = U128(g[s.side as usize].0 - s.amount_in.0);
        });
        self.continue_harvest(box_id)
    }

    /// Step 2: `swap` returns the output amount, which now sits in our exchange deposit.
    /// A failed swap (slippage) leaves the input in that deposit and the harvest moves on.
    #[private]
    pub fn on_swap_done(&mut self, box_id: u64, #[callback_result] r: Result<U128, PromiseError>) -> Option<Promise> {
        let out = r.unwrap_or(U128(0));
        self.update_harvest(box_id, |h| {
            let s = h.swap.as_mut().unwrap();
            s.out = Some(out);
            if out.0 == 0 {
                s.withdrawn = true;
            }
        })?;
        self.continue_harvest(box_id)
    }

    #[private]
    pub fn on_swap_withdrawn(&mut self, box_id: u64, #[callback_result] r: Result<U128, PromiseError>) -> Option<Promise> {
        r.ok()?;
        self.update_harvest(box_id, |h| {
            let s = h.swap.as_mut().unwrap();
            s.withdrawn = true;
            let g = h.got.as_mut().unwrap();
            let side_out = 1 - s.side as usize;
            g[side_out] = U128(g[side_out].0 + s.out.unwrap_or(U128(0)).0);
        })?;
        self.continue_harvest(box_id)
    }

    /// Holder wNEAR is delivered by `ft_transfer_call`; whatever the coin did not accept is carried
    /// to the next harvest instead of being lost.
    #[private]
    pub fn on_reward_sent(&mut self, box_id: u64, amount: U128, #[callback_result] r: Result<U128, PromiseError>) {
        let used = r.unwrap_or(U128(0)).0;
        if let Some(b) = self.boxes.get_mut(&box_id) {
            b.carry_near = U128(b.carry_near.0 + amount.0 - used.min(amount.0));
        }
    }

    #[private]
    pub fn on_distributed(&mut self, box_id: u64, coin_amount: U128, #[callback_result] r: Result<(), PromiseError>) {
        if r.is_ok() {
            if let Some(b) = self.boxes.get_mut(&box_id) {
                b.coin_pot = U128(b.coin_pot.0 - coin_amount.0.min(b.coin_pot.0));
            }
        }
    }
}

impl Launchpad {
    fn continue_harvest(&mut self, box_id: u64) -> Option<Promise> {
        let left = env::prepaid_gas().saturating_sub(env::used_gas());
        let need = if self.pay_is_next(box_id) { GAS_PAY_STEP } else { GAS_NEXT_STEP };
        (left >= need).then(|| self.next_harvest_step(box_id))
    }

    /// True once both withdrawals are done and no swap is pending: the next step pays out.
    fn pay_is_next(&self, box_id: u64) -> bool {
        let Some(h) = self.boxes.get(&box_id).and_then(|b| b.harvest.as_ref()) else { return false };
        h.got.is_some() && h.withdrawn.iter().all(|w| *w) && h.swap.as_ref().is_none_or(|s| s.withdrawn)
    }

    fn update_harvest(&mut self, box_id: u64, f: impl FnOnce(&mut Harvest)) -> Option<()> {
        let h = self.boxes.get_mut(&box_id)?.harvest.as_mut()?;
        f(h);
        Some(())
    }

    fn me(&self) -> LaunchpadExt {
        Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK)
    }

    /// Steps: remove → withdraw both → plan swap → send swap → withdraw output → pay. External calls
    /// take only their static gas (weight 0) so the leftover flows to our callback and the chain keeps
    /// going within one transaction; the gate in `continue_harvest` parks it when that runs out.
    fn next_harvest_step(&mut self, box_id: u64) -> Promise {
        let b = self.boxes.get(&box_id).unwrap().clone();
        let h = b.harvest.clone().expect("harvest state");
        let Some(got) = h.got else { return self.remove_step(box_id, &b, &h) };
        if let Some(side) = (0..2).find(|&i| !h.withdrawn[i]) {
            return self.withdraw_step(box_id, &b, side, got[side], None);
        }
        let reserves = [h.reserves[0].0 - got[0].0, h.reserves[1].0 - got[1].0];
        match h.swap.clone() {
            None => {
                self.plan_swap_step(box_id, &b, got, reserves);
                self.next_harvest_step(box_id)
            }
            Some(s) if !s.sent => self.deposit_swap_step(box_id, &b, &s),
            Some(s) if s.out.is_none() => self.swap_call_step(box_id, &b, &s),
            Some(s) if !s.withdrawn => self.withdraw_step(box_id, &b, 1 - s.side as usize, s.out.unwrap_or(U128(0)), Some(())),
            Some(_) => self.pay_harvest(box_id, &b, &h, got, reserves),
        }
    }

    fn tokens(&self, b: &LaunchBox) -> [near_sdk::AccountId; 2] {
        [self.config.wnear.clone(), b.coin_id.clone()]
    }

    fn pool_id(b: &LaunchBox) -> u64 {
        b.opening.as_ref().and_then(|o| o.pool_id).expect("pool")
    }

    fn remove_step(&self, box_id: u64, b: &LaunchBox, h: &Harvest) -> Promise {
        ext_ref::ext(self.config.exchange.clone())
            .with_attached_deposit(ONE)
            .with_static_gas(GAS_STEP)
            .with_unused_gas_weight(0)
            .remove_liquidity(Self::pool_id(b), h.remove, vec![U128(0), U128(0)])
            .then(self.me().on_removed(box_id))
    }

    /// Withdraws one token from our exchange deposit; `after_swap` picks the swap-output callback.
    fn withdraw_step(&self, box_id: u64, b: &LaunchBox, side: usize, amount: U128, after_swap: Option<()>) -> Promise {
        let token = self.tokens(b)[side].clone();
        let call = ext_ref::ext(self.config.exchange.clone()).with_attached_deposit(ONE).with_static_gas(GAS_STEP).with_unused_gas_weight(0).withdraw(token, amount, None, Some(true));
        match after_swap {
            Some(()) => call.then(self.me().on_swap_withdrawn(box_id)),
            None => call.then(self.me().on_withdrawn(box_id, side as u8)),
        }
    }

    fn plan_swap_step(&mut self, box_id: u64, b: &LaunchBox, got: [U128; 2], reserves: [u128; 2]) {
        let buy_bps = b.split.buyback_burn as u128 + b.split.buyback_keep as u128;
        let swap = match plan_swap([got[0].0, got[1].0], reserves, buy_bps, b.fee_bps as u128) {
            Some((side, amount_in, min_out)) => Swap { side, amount_in: U128(amount_in), min_out: U128(min_out), ..Default::default() },
            None => Swap { sent: true, out: Some(U128(0)), withdrawn: true, ..Default::default() },
        };
        self.update_harvest(box_id, |h| h.swap = Some(swap));
    }

    fn swap_action(&self, b: &LaunchBox, s: &Swap) -> SwapAction {
        let tokens = self.tokens(b);
        SwapAction {
            pool_id: Self::pool_id(b),
            token_in: tokens[s.side as usize].clone(),
            amount_in: Some(s.amount_in),
            token_out: tokens[1 - s.side as usize].clone(),
            min_amount_out: s.min_out,
        }
    }

    /// Plain deposit into the exchange (empty msg); the swap itself is the next step.
    fn deposit_swap_step(&self, box_id: u64, b: &LaunchBox, s: &Swap) -> Promise {
        let token_in = self.tokens(b)[s.side as usize].clone();
        ext_ft::ext(token_in)
            .with_attached_deposit(ONE)
            .with_static_gas(GAS_SWAP)
            .with_unused_gas_weight(0)
            .ft_transfer_call(self.config.exchange.clone(), s.amount_in, None, DEPOSIT_MSG.to_string())
            .then(self.me().on_swapped(box_id))
    }

    fn swap_call_step(&self, box_id: u64, b: &LaunchBox, s: &Swap) -> Promise {
        ext_ref::ext(self.config.exchange.clone())
            .with_attached_deposit(ONE)
            .with_static_gas(GAS_SWAP)
            .with_unused_gas_weight(0)
            .swap(vec![self.swap_action(b, s)], None, None)
            .then(self.me().on_swap_done(box_id))
    }

    /// The last step: book the protocol fee, pay the dev and holders, burn and keep coins,
    /// then close the previous epoch on the coin so holders can claim (FR-018).
    fn pay_harvest(&mut self, box_id: u64, b: &LaunchBox, h: &Harvest, got: [U128; 2], reserves: [u128; 2]) -> Promise {
        let p = payout([got[0].0, got[1].0], reserves, &b.split, b.carry_near.0);
        self.protocol_fees += p.protocol.0;
        let coin_pot = b.coin_pot;
        {
            let bx = self.boxes.get_mut(&box_id).unwrap();
            bx.carry_near = U128(0);
            bx.last_harvest_epoch = h.epoch;
            bx.per_share_last = h.per_share;
            bx.harvest = None;
        }
        if p.keep.0 > 0 {
            self.add_treasury(box_id, p.keep.0);
        }
        let swapped = h.swap.as_ref().filter(|s| s.amount_in.0 > 0).map(|s| json!({ "side": s.side, "amount_in": s.amount_in, "out": s.out }));
        events::emit("harvested", &json!({ "box_id": box_id, "epoch": h.epoch, "near_to_holders": p.holders_near, "burned": p.burn, "kept": p.keep, "protocol": p.protocol, "dev": p.dev, "coin_pot": coin_pot, "swapped": swapped }));
        let coin = b.coin_id.clone();
        let cb = || Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK);
        let min = self.config.min_distributable;
        let distribute = ext_coin::ext(coin.clone()).with_static_gas(GAS_STEP).distribute(h.epoch - 1, coin_pot, min);
        // Side legs run detached: a joint promise cannot be returned from a method.
        if p.dev.0 > 0 {
            self.pay_near(b.dev.clone(), p.dev.0, Undo::Late).detach();
        }
        if p.burn.0 > 0 {
            ext_coin::ext(coin.clone()).with_static_gas(GAS_STEP).burn(p.burn).detach();
        }
        // Holder wNEAR must land before the epoch closes, so the chain is reward → distribute → callback.
        let chain = if p.holders_near.0 > 0 {
            // The coin must be registered with wNEAR before it can receive; registration_only refunds when it already is.
            ext_ft::ext(self.config.wnear.clone())
                .with_attached_deposit(WNEAR_STORAGE)
                .with_static_gas(GAS_STEP)
                .storage_deposit(Some(coin.clone()), Some(true))
                .then(
                    ext_ft::ext(self.config.wnear.clone())
                        .with_attached_deposit(ONE)
                        .with_static_gas(GAS_SWAP)
                        .ft_transfer_call(coin, p.holders_near, None, format!("{{\"reward_near\":{}}}", h.epoch - 1)),
                )
                .then(cb().on_reward_sent(box_id, p.holders_near))
                .then(distribute)
        } else {
            distribute
        };
        chain.then(cb().on_distributed(box_id, coin_pot))
    }
}
