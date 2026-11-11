//! NEP-141 / NEP-145 / NEP-148 surface, each balance-changing call wrapped in the reward hook.
use crate::{Coin, CoinExt};
use near_contract_standards::fungible_token::metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider};
use near_contract_standards::fungible_token::{FungibleTokenCore, FungibleTokenResolver};
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, NearToken, PromiseOrValue};

#[near]
impl FungibleTokenCore for Coin {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        let sender = env::predecessor_account_id();
        let receiver = receiver_id.clone();
        self.with_hook(&[&sender, &receiver], |t| t.ft_transfer(receiver_id, amount, memo))
    }

    #[payable]
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128> {
        let sender = env::predecessor_account_id();
        let receiver = receiver_id.clone();
        self.with_hook(&[&sender, &receiver], |t| t.ft_transfer_call(receiver_id, amount, memo, msg))
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Coin {
    #[private]
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let (s, r) = (sender_id.clone(), receiver_id.clone());
        self.with_hook(&[&s, &r], |t| t.ft_resolve_transfer(sender_id, receiver_id, amount))
    }
}

#[near]
impl StorageManagement for Coin {
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    /// Unregistering forfeits nothing: it fails while rewards are unclaimed.
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        let id = env::predecessor_account_id();
        let done = self.with_hook(&[&id], |t| t.storage_unregister(force));
        if done {
            let owed = self.accounts.get(&id).map_or([0, 0], |a| a.owed);
            require!(owed == [0, 0], "claim rewards first");
            self.accounts.remove(&id);
        }
        done
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Coin {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }
}
