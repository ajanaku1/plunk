//! Claims and box listings (FR-009, FR-010, FR-015, FR-028).
use crate::bids::reveal_end;
use crate::ref_ext::ext_ft;
use crate::types::{LaunchBox, Phase};
use crate::{Launchpad, LaunchpadExt};
use near_sdk::json_types::U128;
use near_sdk::{env, ext_contract, near, require, AccountId, Gas, NearToken, Promise, PromiseError};

const GAS_FT: Gas = Gas::from_tgas(15);
const GAS_UNWRAP: Gas = Gas::from_tgas(10);
const GAS_CALLBACK: Gas = Gas::from_tgas(15);

#[allow(dead_code)]
#[ext_contract(ext_wnear)]
trait WNear {
    fn near_withdraw(&mut self, amount: U128);
}

/// What to put back if a payout fails, so nothing is ever lost.
#[near(serializers = [json])]
pub enum Undo {
    Coins { box_id: u64, bid_id: u32 },
    Refund { box_id: u64, bid_id: u32 },
    Late,
}

#[near]
impl Launchpad {
    /// Anyone may trigger it; coins and NEAR always go to the bid's recipient. An Open box pays
    /// the fill and the refund; a Failed box refunds the whole budget (FR-009/010). Coins and NEAR
    /// are paid independently, so one failing never blocks or repeats the other. Attach the coin's
    /// storage deposit if the recipient isn't registered with the coin yet.
    #[payable]
    pub fn claim_bid(&mut self, box_id: u64, bid_id: u32) -> Promise {
        let b = self.boxes.get(&box_id).expect("no such box");
        let (phase, coin) = (b.phase, b.coin_id.clone());
        require!(matches!(phase, Phase::Open | Phase::Failed), "box not settled");
        let mut bid = self.bids.get(&(box_id, bid_id)).cloned().expect("no such bid");
        let (tokens, refund) = if phase == Phase::Failed { (0, bid.budget.0) } else { (bid.tokens.0, bid.refund.0) };
        let pay_coins = tokens > 0 && !bid.coins_paid;
        let pay_refund = refund > 0 && !bid.refund_paid;
        require!(pay_coins || pay_refund, "nothing to claim");
        bid.coins_paid |= pay_coins;
        bid.refund_paid |= pay_refund;
        self.bids.insert((box_id, bid_id), bid.clone());
        let coins = pay_coins.then(|| self.send_coins(coin, bid.recipient.clone(), tokens, box_id, bid_id));
        let near = pay_refund.then(|| self.pay_near(bid.recipient, refund, Undo::Refund { box_id, bid_id }));
        // A joint promise cannot be returned from a method, so the coin leg runs detached.
        match (coins, near) {
            (Some(c), Some(n)) => {
                c.detach();
                n
            }
            (Some(p), None) | (None, Some(p)) => p,
            (None, None) => unreachable!(),
        }
    }

    /// FR-028: pays out every late credit of the caller in NEAR.
    pub fn claim_late(&mut self) -> Promise {
        let me = env::predecessor_account_id();
        let amount = self.late.remove(&me).expect("nothing to claim");
        self.pay_near(me, amount, Undo::Late)
    }

    #[private]
    pub fn on_coins_sent(&mut self, box_id: u64, bid_id: u32, #[callback_result] r: Result<(), PromiseError>) {
        if r.is_err() {
            self.undo(Undo::Coins { box_id, bid_id }, None, 0);
        }
    }

    #[private]
    pub fn on_unwrapped(&mut self, to: AccountId, amount: U128, undo: Undo, #[callback_result] r: Result<(), PromiseError>) {
        if r.is_ok() {
            Promise::new(to).transfer(NearToken::from_yoctonear(amount.0)).detach();
        } else {
            self.undo(undo, Some(to), amount.0);
        }
    }

    pub fn list_boxes(&self, from: u64, limit: u64) -> Vec<LaunchBox> {
        (from..self.next_id.min(from.saturating_add(limit))).filter_map(|i| self.boxes.get(&i).cloned()).collect()
    }

    /// The oldest box that `open` (or `retry_open`) can move forward now, for the app and keeper.
    pub fn next_to_open(&self) -> Option<u64> {
        let now = env::block_timestamp();
        self.boxes.iter().find(|(_, b)| (b.phase == Phase::Bidding && now >= reveal_end(b)) || b.phase == Phase::Opening).map(|(i, _)| *i)
    }
}

impl Launchpad {
    /// Registers the recipient with the coin when a storage deposit is attached, then sends the fill.
    fn send_coins(&self, coin: AccountId, to: AccountId, tokens: u128, box_id: u64, bid_id: u32) -> Promise {
        let storage = env::attached_deposit();
        let send = ext_ft::ext(coin.clone()).with_attached_deposit(NearToken::from_yoctonear(1)).with_static_gas(GAS_FT).ft_transfer(
            to.clone(),
            U128(tokens),
            Some(format!("plunk box {box_id} fill")),
        );
        let send = if storage.is_zero() {
            send
        } else {
            ext_ft::ext(coin).with_attached_deposit(storage).with_static_gas(GAS_FT).storage_deposit(Some(to), Some(true)).then(send)
        };
        send.then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_coins_sent(box_id, bid_id))
    }

    /// Unwraps `amount` wNEAR and sends it as NEAR; restores the claim if unwrapping fails.
    pub(crate) fn pay_near(&self, to: AccountId, amount: u128, undo: Undo) -> Promise {
        ext_wnear::ext(self.config.wnear.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_UNWRAP)
            .near_withdraw(U128(amount))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_unwrapped(to, U128(amount), undo))
    }

    fn undo(&mut self, undo: Undo, to: Option<AccountId>, amount: u128) {
        match undo {
            Undo::Coins { box_id, bid_id } | Undo::Refund { box_id, bid_id } => {
                if let Some(mut b) = self.bids.get(&(box_id, bid_id)).cloned() {
                    match undo {
                        Undo::Coins { .. } => b.coins_paid = false,
                        _ => b.refund_paid = false,
                    }
                    self.bids.insert((box_id, bid_id), b);
                }
            }
            Undo::Late => {
                let to = to.expect("late payout has a recipient");
                let prev = self.late.get(&to).copied().unwrap_or(0);
                self.late.insert(to, prev + amount);
            }
        }
    }
}
