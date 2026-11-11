//! K1 kill-test: a NEP-141 receiver that only logs what 1Click delivers.
//! Never rejects (always returns "0" = keep everything), mirroring FR-028.
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, Gas, NearToken, Promise, PromiseOrValue};

#[near(contract_state)]
#[derive(Default)]
pub struct Stub {}

#[near]
impl Stub {
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        env::log_str(&format!(
            "K1 token={} sender={} signer={} amount={} msg={}",
            env::predecessor_account_id(),
            sender_id,
            env::signer_account_id(),
            amount.0,
            msg
        ));
        PromiseOrValue::Value(U128(0))
    }

    /// Return test funds after K1. Only the stub account itself may call it.
    pub fn sweep(&mut self, token: AccountId, receiver_id: AccountId, amount: U128) -> Promise {
        assert_eq!(env::predecessor_account_id(), env::current_account_id(), "owner only");
        let args = near_sdk::serde_json::json!({ "receiver_id": receiver_id, "amount": amount }).to_string();
        Promise::new(token).function_call("ft_transfer", args.into_bytes(), NearToken::from_yoctonear(1), Gas::from_tgas(15))
    }
}
