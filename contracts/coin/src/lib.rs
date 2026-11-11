//! Plunk coin: NEP-141 published once as a global contract, one instance per box.
//! Every balance change of a non-excluded account runs the hourly reward hook (FR-018).
pub mod epochs;
mod ft;
mod rewards;

use epochs::{on_balance_change, Account, Global, Pair};
use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::FungibleTokenMetadata;
use near_contract_standards::fungible_token::FungibleToken;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};

/// 1B whole coins, 24 decimals.
pub const TOTAL_SUPPLY: u128 = 1_000_000_000 * 1_000_000_000_000_000_000_000_000;
/// Storage per holder for the reward record, on top of the token balance entry.
const REWARD_RECORD_BYTES: u64 = 250;
const EPOCH_NS: u64 = 3_600_000_000_000;

#[near]
#[derive(BorshStorageKey)]
enum Key {
    Token,
    Accounts,
    Dist,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Coin {
    token: FungibleToken,
    metadata: FungibleTokenMetadata,
    launchpad: AccountId,
    wnear: AccountId,
    /// Pool exchange, launchpad and this contract never earn rewards.
    excluded: Vec<AccountId>,
    global: Global,
    accounts: LookupMap<AccountId, Account>,
    dist: LookupMap<u64, Pair>,
}

pub fn epoch_now() -> u64 {
    env::block_timestamp() / EPOCH_NS
}

#[near]
impl Coin {
    #[init]
    pub fn new(launchpad: AccountId, exchange: AccountId, wnear: AccountId, metadata: FungibleTokenMetadata) -> Self {
        metadata.assert_valid();
        let me = env::current_account_id();
        let mut token = FungibleToken::new(Key::Token);
        token.account_storage_usage += REWARD_RECORD_BYTES;
        for id in [&launchpad, &exchange, &me] {
            token.internal_register_account(id);
        }
        token.internal_deposit(&launchpad, TOTAL_SUPPLY);
        FtMint { owner_id: &launchpad, amount: TOTAL_SUPPLY.into(), memo: Some("supply") }.emit();
        Self {
            token,
            metadata,
            excluded: vec![launchpad.clone(), exchange, me],
            launchpad,
            wnear,
            global: Global::new(epoch_now()),
            accounts: LookupMap::new(Key::Accounts),
            dist: LookupMap::new(Key::Dist),
        }
    }

    pub fn current_epoch(&self) -> u64 {
        epoch_now()
    }

    pub fn get_global(&self) -> &Global {
        &self.global
    }
}

impl Coin {
    fn balance(&self, id: &AccountId) -> u128 {
        self.token.accounts.get(id).unwrap_or(0)
    }

    /// Run `f` on the token, then pass each listed account's balance change through the hook.
    fn with_hook<R>(&mut self, ids: &[&AccountId], f: impl FnOnce(&mut FungibleToken) -> R) -> R {
        let before: Vec<u128> = ids.iter().map(|id| self.balance(id)).collect();
        let r = f(&mut self.token);
        for (id, old) in ids.iter().zip(before) {
            let new = self.balance(id);
            self.touch(id, old, new);
        }
        r
    }

    /// Settle `id` and record its new balance. Excluded accounts are skipped.
    fn touch(&mut self, id: &AccountId, old: u128, new: u128) {
        if self.excluded.contains(id) {
            return;
        }
        let acct = self.accounts.get(id).cloned();
        let dist = &self.dist;
        let a = on_balance_change(&mut self.global, acct, old, new, epoch_now(), |x| dist.get(&x).copied());
        self.accounts.insert(id.clone(), a);
    }
}
