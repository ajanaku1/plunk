//! K4 / K2 kill-test contract: proves a rustc-1.97 wasm runs on the NEAR VM
//! and can be published as a global contract.
use near_sdk::{env, near};

#[near(contract_state)]
#[derive(Default)]
pub struct Hello {
    greeting: String,
}

#[near]
impl Hello {
    pub fn get_greeting(&self) -> String {
        if self.greeting.is_empty() { "hello from plunk".into() } else { self.greeting.clone() }
    }

    pub fn set_greeting(&mut self, greeting: String) {
        env::log_str(&format!("greeting set by {}", env::predecessor_account_id()));
        self.greeting = greeting;
    }
}
