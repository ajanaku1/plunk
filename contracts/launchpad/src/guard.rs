//! Owner safety switches: a pause, a cap on what one box may raise, and a switch for the Solana share.
//! Stored under its own key, outside the root struct, so adding it needed no state migration.
use crate::{events, Launchpad, LaunchpadExt};
use near_sdk::json_types::U128;
use near_sdk::{assert_one_yocto, borsh, env, near};

const GUARD_KEY: &[u8] = b"guard";

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Guard {
    /// No new boxes and no new bids. Open, reveal, claims, refunds and harvests keep working.
    pub paused: bool,
    /// The most wNEAR one box may take in; 0 means no cap.
    pub max_raise: U128,
    /// New boxes may not set a Solana share (the mirror has no send or recovery path yet).
    pub mirror_off: bool,
}

/// The stored guard; everything off until the owner sets it.
pub fn load() -> Guard {
    env::storage_read(GUARD_KEY).map(|b| borsh::from_slice(&b).expect("guard state")).unwrap_or_default()
}

#[near]
impl Launchpad {
    /// Owner only. Replaces all three switches at once.
    #[payable]
    pub fn set_guard(&mut self, guard: Guard) {
        assert_one_yocto();
        self.assert_owner();
        env::storage_write(GUARD_KEY, &borsh::to_vec(&guard).expect("guard state"));
        events::emit("guard_set", &guard);
    }

    pub fn get_guard(&self) -> Guard {
        load()
    }
}
