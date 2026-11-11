//! NEP-297 events, standard `plunk` 1.0.0 (contracts/launchpad.md).
use near_sdk::serde::Serialize;
use near_sdk::{env, serde_json};

pub fn emit<T: Serialize>(event: &str, data: &T) {
    let body = serde_json::json!({ "standard": "plunk", "version": "1.0.0", "event": event, "data": [data] });
    env::log_str(&format!("EVENT_JSON:{body}"));
}
