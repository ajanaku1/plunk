//! Reward pots, distribution, claims and burns (FR-018, FR-023, contracts/coin.md).
use crate::epochs::{Account, Pair};
use crate::{epoch_now, Coin, CoinExt};
use near_contract_standards::fungible_token::events::FtBurn;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::{env, ext_contract, near, require, AccountId, Gas, NearToken, Promise, PromiseOrValue};

const GAS_UNWRAP: Gas = Gas::from_tgas(10);
const GAS_AFTER_UNWRAP: Gas = Gas::from_tgas(10);

#[allow(dead_code)]
#[ext_contract(ext_wnear)]
trait WNear {
    fn near_withdraw(&mut self, amount: U128);
}

#[near(serializers = [json])]
pub struct Claimable {
    pub near: U128,
    pub coin: U128,
}

#[near]
impl FungibleTokenReceiver for Coin {
    /// wNEAR from the launchpad joins the pending NEAR pot. Anything else is refunded.
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let _ = msg;
        if env::predecessor_account_id() != self.wnear || sender_id != self.launchpad {
            return PromiseOrValue::Value(amount);
        }
        self.global.pending[0] += amount.0;
        PromiseOrValue::Value(U128(0))
    }
}

#[near]
impl Coin {
    /// Launchpad only. Adds `coin_amount` (already transferred here) to the coin pot, then closes
    /// both pots into `epoch`, which must be the one that just ended. Pots below `min` roll over.
    pub fn distribute(&mut self, epoch: u64, coin_amount: U128, min: (U128, U128)) {
        self.assert_launchpad();
        require!(epoch + 1 == epoch_now(), "only the previous epoch");
        let (min_near, min_coin) = min;
        let min: Pair = [min_near.0, min_coin.0];
        if let Some((x, delta)) = self.global.distribute(epoch_now(), [0, coin_amount.0], min) {
            self.dist.insert(x, delta);
        }
    }

    /// Launchpad only. Burns from the launchpad's own balance (buyback-burn).
    pub fn burn(&mut self, amount: U128) {
        self.assert_launchpad();
        let lp = self.launchpad.clone();
        self.token.internal_withdraw(&lp, amount.0);
        FtBurn { owner_id: &lp, amount, memo: Some("buyback") }.emit();
    }

    /// Settles the caller and pays both rewards: coins directly, wNEAR unwrapped to NEAR.
    pub fn claim(&mut self) -> Option<Promise> {
        let id = env::predecessor_account_id();
        self.accounts.get(&id)?;
        let bal = self.balance(&id);
        self.touch(&id, bal, bal);
        let mut a = self.accounts.get(&id).cloned()?;
        let [near, coin] = std::mem::take(&mut a.owed);
        self.accounts.insert(id.clone(), a);
        if coin > 0 {
            let me = env::current_account_id();
            self.with_hook(&[&id], |t| t.internal_transfer(&me, &id, coin, Some("reward".into())));
        }
        (near > 0).then(|| {
            ext_wnear::ext(self.wnear.clone())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(GAS_UNWRAP)
                .near_withdraw(U128(near))
                .then(Self::ext(env::current_account_id()).with_static_gas(GAS_AFTER_UNWRAP).on_unwrapped(id, U128(near)))
        })
    }

    /// Sends the unwrapped NEAR, or restores the claim if unwrapping failed.
    #[private]
    pub fn on_unwrapped(&mut self, id: AccountId, amount: U128, #[callback_result] r: Result<(), near_sdk::PromiseError>) {
        if r.is_ok() {
            Promise::new(id).transfer(NearToken::from_yoctonear(amount.0)).detach();
        } else if let Some(mut a) = self.accounts.get(&id).cloned() {
            a.owed[0] += amount.0;
            self.accounts.insert(id, a);
        }
    }

    pub fn get_claimable(&self, account_id: AccountId) -> Claimable {
        let Some(a) = self.accounts.get(&account_id) else { return Claimable { near: U128(0), coin: U128(0) } };
        let owed = self.preview(a, self.balance(&account_id));
        Claimable { near: U128(owed[0]), coin: U128(owed[1]) }
    }
}

impl Coin {
    fn assert_launchpad(&self) {
        require!(env::predecessor_account_id() == self.launchpad, "launchpad only");
    }

    fn preview(&self, a: &Account, bal: u128) -> Pair {
        let (mut a, mut g) = (a.clone(), self.global.clone());
        g.advance(epoch_now());
        a.settle(bal, epoch_now(), &g, |x| self.dist.get(&x).copied());
        a.owed
    }
}
