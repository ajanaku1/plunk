//! Cross-contract interfaces to Rhea / Ref v2 (`v2.ref-finance.near`, testnet `ref-finance-101.testnet`).
//! Signatures from DevOfCredit/ref-contracts main (ref-exchange/src), checked 2026-11-05 (R3).
#![allow(dead_code)]
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{ext_contract, near, serde_json, AccountId, PromiseOrValue};

#[ext_contract(ext_ref)]
pub trait RefExchange {
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>);
    /// 1 yocto. Needed before depositing a token that isn't whitelisted.
    fn register_tokens(&mut self, token_ids: Vec<AccountId>);
    /// `fee` in bps, immutable. Attach ~0.05 NEAR storage; the excess is refunded.
    fn add_simple_pool(&mut self, tokens: Vec<AccountId>, fee: u32) -> u64;
    fn add_liquidity(&mut self, pool_id: u64, amounts: Vec<U128>, min_amounts: Option<Vec<U128>>) -> U128;
    /// 1 yocto. Tokens land in the internal deposit, then need `withdraw`.
    fn remove_liquidity(&mut self, pool_id: u64, shares: U128, min_amounts: Vec<U128>) -> Vec<U128>;
    /// 1 yocto.
    fn withdraw(&mut self, token_id: AccountId, amount: U128, unregister: Option<bool>, skip_unwrap_near: Option<bool>);
    /// Swaps from the caller's internal deposits.
    fn swap(&mut self, actions: Vec<SwapAction>, referral_id: Option<AccountId>, skip_degen_price_sync: Option<bool>) -> U128;
    fn get_pool(&self, pool_id: u64) -> PoolInfo;
    fn get_pool_shares(&self, pool_id: u64, account_id: AccountId) -> U128;
    fn get_deposit(&self, account_id: AccountId, token_id: AccountId) -> U128;
}

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String) -> PromiseOrValue<U128>;
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>);
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(crate = "near_sdk::serde")]
pub struct SwapAction {
    pub pool_id: u64,
    pub token_in: AccountId,
    pub amount_in: Option<U128>,
    pub token_out: AccountId,
    pub min_amount_out: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PoolInfo {
    pub pool_kind: String,
    pub token_account_ids: Vec<AccountId>,
    pub amounts: Vec<U128>,
    pub total_fee: u32,
    pub shares_total_supply: U128,
    pub amp: u64,
}

/// `ft_transfer_call` msg for a plain deposit into the exchange.
pub const DEPOSIT_MSG: &str = "";

/// `ft_transfer_call` msg that deposits and swaps in one call (TokenReceiverMessage::Execute).
pub fn swap_msg(action: SwapAction) -> String {
    serde_json::json!({ "actions": [action] }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ref_swap_msg_shape() {
        let a = SwapAction {
            pool_id: 7,
            token_in: "wrap.near".parse().unwrap(),
            amount_in: Some(U128(5)),
            token_out: "plunk.plunk.near".parse().unwrap(),
            min_amount_out: U128(1),
        };
        let got: serde_json::Value = serde_json::from_str(&swap_msg(a)).unwrap();
        let want = serde_json::json!({"actions":[{"pool_id":7,"token_in":"wrap.near","amount_in":"5","token_out":"plunk.plunk.near","min_amount_out":"1"}]});
        assert_eq!(got, want);
    }
}
