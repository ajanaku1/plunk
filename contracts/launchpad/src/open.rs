//! Open: clear, then create the coin, the Rhea pool and the locked LP (FR-008–015).
//! Each async step records its result on the box, so `retry_open` resumes where it stopped.
use crate::bids::{reveal_end, BidKind};
use crate::clearing::{clear, BidIn, TOKENS_FOR_BIDDERS, ONE_COIN};
use crate::ref_ext::{ext_ft, ext_ref, DEPOSIT_MSG};
use crate::types::{LaunchBox, Mirror, Phase};
use crate::{events, Launchpad, LaunchpadExt};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId, CryptoHash, Gas, NearToken, Promise, PromiseError};

/// FR-014: a box still Opening this long after Reveal ended may be failed by anyone.
pub const STUCK_NS: u64 = 24 * 3_600 * 1_000_000_000;
/// Storage the launchpad pays out of the creation fee. Measured on testnet before launch.
const COIN_ACCOUNT_DEPOSIT: NearToken = NearToken::from_millinear(50);
const REF_ACCOUNT_DEPOSIT: NearToken = NearToken::from_millinear(10);
const REF_POOL_DEPOSIT: NearToken = NearToken::from_millinear(100);
const REF_LP_DEPOSIT: NearToken = NearToken::from_millinear(10);
const GAS_STEP: Gas = Gas::from_tgas(30);
const GAS_DEPOSIT: Gas = Gas::from_tgas(50);
const GAS_CALLBACK: Gas = Gas::from_tgas(20);
/// A callback starts the next step itself only when this much gas is left; otherwise the
/// next `retry_open` (from the app or keeper) carries on (FR-014).
const GAS_NEXT_STEP: Gas = Gas::from_tgas(140);

/// Clearing result and how far the coin + pool setup got (FR-014 retry).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct Opening {
    pub price: U128,
    pub accepted_total: U128,
    pub coin_ready: bool,
    pub pool_id: Option<u64>,
    /// [wNEAR, coin] deposited into the exchange.
    pub deposited: [bool; 2],
    pub shares: U128,
}

impl Opening {
    /// wNEAR that goes into the pool: the accepted NEAR minus the 1% raise fee (FR-012).
    pub fn pool_near(&self) -> u128 {
        self.accepted_total.0 - raise_fee(self.accepted_total.0)
    }
}

pub fn raise_fee(accepted: u128) -> u128 {
    accepted / 100
}

pub const POOL_COINS: u128 = TOKENS_FOR_BIDDERS * ONE_COIN;

/// The Solana mirror's part of an LP-half amount (solana-mirror.md D3). Rounds toward Rhea.
pub fn mirror_part(total: u128, share_bps: u16) -> u128 {
    total * share_bps as u128 / 10_000
}

impl LaunchBox {
    /// What goes into the Rhea pool: [wNEAR, coins], the LP half minus the Solana leg.
    pub fn rhea_seed(&self) -> [u128; 2] {
        let near = self.opening.as_ref().map_or(0, Opening::pool_near);
        let m = self.mirror.clone().unwrap_or_default();
        [near - m.wnear.0, POOL_COINS - m.coins.0]
    }
}

#[near]
impl Launchpad {
    /// FR-011: anyone, once Reveal is over (or at close when there were no sealed bids).
    pub fn open(&mut self, box_id: u64) -> Option<Promise> {
        let b = self.boxes.get(&box_id).expect("no such box").clone();
        require!(b.phase == Phase::Bidding, "already opened");
        require!(env::block_timestamp() >= reveal_end(&b), "reveal not over");
        let o = self.settle_bids(&b);
        let bx = self.boxes.get_mut(&box_id).unwrap();
        if o.accepted_total < bx.min_raise || o.accepted_total.0 == 0 {
            bx.phase = Phase::Failed;
            events::emit("box_failed", &json!({ "box_id": box_id, "total_in": bx.total_in, "min_raise": bx.min_raise }));
            return None;
        }
        bx.phase = Phase::Opening;
        if bx.solana_share_bps > 0 {
            bx.mirror = Some(Mirror { coins: U128(mirror_part(POOL_COINS, bx.solana_share_bps)), wnear: U128(mirror_part(o.pool_near(), bx.solana_share_bps)), sent: false });
        }
        bx.opening = Some(o);
        Some(self.next_open_step(box_id))
    }

    /// FR-014: resumes a stuck Opening from its last completed step.
    pub fn retry_open(&mut self, box_id: u64) -> Promise {
        let b = self.boxes.get(&box_id).expect("no such box");
        require!(b.phase == Phase::Opening, "not opening");
        self.next_open_step(box_id)
    }

    /// FR-014: after 24h in Opening every bid becomes refundable in full. Any wNEAR already
    /// deposited into the exchange is withdrawn first.
    pub fn fail_stuck(&mut self, box_id: u64) -> Option<Promise> {
        let b = self.boxes.get(&box_id).expect("no such box").clone();
        require!(b.phase == Phase::Opening, "not opening");
        require!(env::block_timestamp() >= reveal_end(&b) + STUCK_NS, "not stuck yet");
        let o = b.opening.clone().unwrap_or_default();
        if !o.deposited[0] {
            self.mark_failed(box_id);
            return None;
        }
        Some(
            ext_ref::ext(self.config.exchange.clone())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(GAS_DEPOSIT)
                .withdraw(self.config.wnear.clone(), U128(b.rhea_seed()[0]), None, Some(true))
                .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_stuck_withdrawn(box_id)),
        )
    }

    #[private]
    pub fn on_stuck_withdrawn(&mut self, box_id: u64, #[callback_result] r: Result<U128, PromiseError>) {
        if r.is_ok() {
            self.mark_failed(box_id);
        }
    }

    #[private]
    pub fn on_coin_ready(&mut self, box_id: u64, #[callback_result] r: Result<(), PromiseError>) -> Option<Promise> {
        let ok = r.is_ok();
        self.update_opening(box_id, |o| o.coin_ready = ok);
        if ok { self.continue_open(box_id) } else { None }
    }

    #[private]
    pub fn on_pool(&mut self, box_id: u64, #[callback_result] r: Result<u64, PromiseError>) -> Option<Promise> {
        let id = r.ok()?;
        self.update_opening(box_id, |o| o.pool_id = Some(id));
        self.continue_open(box_id)
    }

    /// The exchange returns how much of a deposit it kept (`ft_transfer_call` resolve).
    #[private]
    pub fn on_deposited(&mut self, box_id: u64, side: u8, want: U128, #[callback_result] r: Result<U128, PromiseError>) -> Option<Promise> {
        let ok = r.ok() == Some(want);
        self.update_opening(box_id, |o| o.deposited[side as usize] |= ok);
        if ok { self.continue_open(box_id) } else { None }
    }

    #[private]
    pub fn on_liquidity(&mut self, box_id: u64, #[callback_result] r: Result<U128, PromiseError>) {
        let Ok(shares) = r else { return };
        let fee = self.update_opening(box_id, |o| o.shares = shares).map(|o| raise_fee(o.accepted_total.0)).unwrap_or(0);
        self.protocol_fees += fee;
        let b = self.boxes.get_mut(&box_id).unwrap();
        b.phase = Phase::Open;
        b.open_at = env::block_timestamp();
        // FR-023: the dev-tax window starts the moment the box opens.
        b.escrow.window_start = b.open_at;
        b.escrow.window_end = b.open_at + b.tax_window_secs as u64 * 1_000_000_000;
        let [near, coins] = b.rhea_seed();
        b.per_share_last = U128(crate::harvest::per_share(near, coins, shares.0));
        let o = b.opening.as_ref().unwrap();
        b.last_harvest_epoch = crate::harvest::epoch_of(b.open_at);
        events::emit("box_opened", &json!({ "box_id": box_id, "price": o.price, "accepted_total": o.accepted_total, "pool_id": o.pool_id }));
    }
}

impl Launchpad {
    /// Runs clearing, writes each bid's fill, and drops the unneeded ciphertexts (FR-008/009).
    fn settle_bids(&mut self, b: &LaunchBox) -> Opening {
        let mut bids: Vec<_> = (0..b.bid_count).filter_map(|i| self.bids.get(&(b.id, i)).cloned()).collect();
        let input: Vec<BidIn> = bids
            .iter()
            .map(|x| BidIn {
                id: x.id as u64,
                budget: x.budget.0,
                // FR-009: a sealed bid never revealed clears as a market bid.
                max_price: match &x.kind {
                    BidKind::Sealed { revealed_price, .. } => revealed_price.map(|p| p.0),
                    _ => None,
                },
            })
            .collect();
        let c = clear(&input);
        let mut escrowed = 0u128;
        for (bid, f) in bids.iter_mut().zip(&c.fills) {
            bid.refund = U128(f.refund);
            if let BidKind::Sealed { tlock, .. } = &mut bid.kind {
                *tlock = None;
            }
            // FR-022: the dev's own fills stay in escrow instead of becoming claimable.
            if bid.recipient == b.dev {
                escrowed += f.tokens;
                bid.coins_paid = true;
            } else {
                bid.tokens = U128(f.tokens);
            }
            self.bids.insert((b.id, bid.id), bid.clone());
        }
        let bx = self.boxes.get_mut(&b.id).unwrap();
        bx.escrow.balance = U128(bx.escrow.balance.0 + escrowed);
        Opening { price: U128(c.price), accepted_total: U128(c.accepted_total), ..Default::default() }
    }

    fn continue_open(&mut self, box_id: u64) -> Option<Promise> {
        let left = env::prepaid_gas().saturating_sub(env::used_gas());
        (left >= GAS_NEXT_STEP).then(|| self.next_open_step(box_id))
    }

    fn update_opening(&mut self, box_id: u64, f: impl FnOnce(&mut Opening)) -> Option<Opening> {
        let o = self.boxes.get_mut(&box_id)?.opening.as_mut()?;
        f(o);
        Some(o.clone())
    }

    fn mark_failed(&mut self, box_id: u64) {
        let b = self.boxes.get_mut(&box_id).unwrap();
        b.phase = Phase::Failed;
        events::emit("box_failed", &json!({ "box_id": box_id, "stuck": true }));
    }

    fn next_open_step(&mut self, box_id: u64) -> Promise {
        let b = self.boxes.get(&box_id).unwrap().clone();
        let o = b.opening.clone().expect("opening state");
        // Callbacks get a small floor plus an equal share of the unused gas, since each one spawns the next step.
        let me = Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK);
        if !o.coin_ready {
            return self.deploy_coin(&b).then(me.on_coin_ready(box_id));
        }
        let ex = self.config.exchange.clone();
        let Some(pool_id) = o.pool_id else {
            let tokens = vec![self.config.wnear.clone(), b.coin_id.clone()];
            return ext_ref::ext(ex.clone())
                .with_attached_deposit(REF_ACCOUNT_DEPOSIT)
                .with_static_gas(GAS_STEP)
                .storage_deposit(None, Some(false))
                .then(ext_ref::ext(ex.clone()).with_attached_deposit(NearToken::from_yoctonear(1)).with_static_gas(GAS_STEP).register_tokens(vec![self.config.wnear.clone(), b.coin_id.clone()]))
                .then(ext_ref::ext(ex).with_attached_deposit(REF_POOL_DEPOSIT).with_static_gas(GAS_STEP).add_simple_pool(tokens, b.fee_bps as u32))
                .then(me.on_pool(box_id));
        };
        let seed = b.rhea_seed();
        if let Some(side) = o.deposited.iter().position(|d| !d) {
            let token = if side == 0 { self.config.wnear.clone() } else { b.coin_id.clone() };
            return self.deposit(&token, U128(seed[side])).then(me.on_deposited(box_id, side as u8, U128(seed[side])));
        }
        ext_ref::ext(ex)
            .with_attached_deposit(REF_LP_DEPOSIT)
            .with_static_gas(GAS_STEP)
            .add_liquidity(pool_id, vec![U128(seed[0]), U128(seed[1])], None)
            .then(me.on_liquidity(box_id))
    }

    /// One deposit into the exchange's internal balance for this launchpad.
    fn deposit(&self, token: &AccountId, amount: U128) -> Promise {
        ext_ft::ext(token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_DEPOSIT)
            .ft_transfer_call(self.config.exchange.clone(), amount, None, DEPOSIT_MSG.to_string())
    }

    /// FR-002: the coin account runs the shared (global) coin code; its whole supply mints here.
    fn deploy_coin(&self, b: &LaunchBox) -> Promise {
        let metadata = json!({
            "spec": "ft-1.0.0",
            "name": b.meta.name,
            "symbol": b.meta.ticker.to_uppercase(),
            "icon": (!b.meta.image.is_empty()).then_some(&b.meta.image),
            "reference": null,
            "reference_hash": null,
            "decimals": 24,
        });
        let args = json!({ "launchpad": env::current_account_id(), "exchange": self.config.exchange, "wnear": self.config.wnear, "metadata": metadata });
        Promise::new(b.coin_id.clone())
            .create_account()
            .transfer(COIN_ACCOUNT_DEPOSIT)
            .use_global_contract(CryptoHash::from(self.config.coin_code_hash))
            .function_call("new", args.to_string().into_bytes(), NearToken::from_yoctonear(0), GAS_STEP)
    }
}
