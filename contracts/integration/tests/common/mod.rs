//! Shared sandbox harness: real copies of wNEAR (`wrap.testnet`) and the Rhea/Ref exchange
//! (`ref-finance-101.testnet`), the coin published by hash, and an initialised launchpad.
#![allow(dead_code)]
use near_sdk::json_types::U128;
use near_workspaces::network::Sandbox;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract, Worker};
use serde_json::{json, Value};

pub const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const ONE_COIN: u128 = NEAR;
pub const SALT: [u8; 32] = [3; 32];
pub const TGAS_300: Gas = Gas::from_tgas(300);

pub type R<T> = Result<T, Box<dyn std::error::Error>>;

pub fn wasm(name: &str) -> R<Vec<u8>> {
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/near");
    Ok(std::fs::read(format!("{root}/{name}/{name}.wasm")).map_err(|e| format!("{name}.wasm missing (run cargo near build): {e}"))?)
}

pub fn per_m(tenths: u128) -> u128 {
    tenths * NEAR / 10 / 1_000_000
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

pub fn u(v: &Value) -> u128 {
    v.as_str().expect("u128 as string").parse().unwrap()
}

pub struct Env {
    pub worker: Worker<Sandbox>,
    pub root: Account,
    pub lp: Contract,
    pub wrap: AccountId,
    pub exchange: AccountId,
}

async fn import(worker: &Worker<Sandbox>, id: &str) -> R<Contract> {
    let testnet = near_workspaces::testnet().await?;
    Ok(worker.import_contract(&id.parse()?, &testnet).initial_balance(NearToken::from_near(2_000)).transact().await?)
}

/// wNEAR + Ref from testnet, the coin code published by hash, and an initialised launchpad.
pub async fn setup() -> R<Env> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let wrap = import(&worker, "wrap.testnet").await?;
    wrap.call("new").transact().await?.into_result()?;
    let ex = import(&worker, "ref-finance-101.testnet").await?;
    let r = root.id();
    ex.call("new").args_json(json!({ "owner_id": r, "boost_farm_id": r, "burrowland_id": r, "exchange_fee": 1600, "referral_fee": 400 })).transact().await?.into_result()?;

    let coin = wasm("plunk_coin")?;
    let publisher = root.create_subaccount("publisher").initial_balance(NearToken::from_near(60)).transact().await?.into_result()?;
    let publisher = publisher.deploy(&wasm("plunk_publisher")?).await?.into_result()?;
    publisher.call("publish").args_json(json!({ "code": near_sdk::json_types::Base64VecU8::from(coin.clone()) })).max_gas().transact().await?.into_result()?;
    let hash = near_sdk::bs58::encode(near_sdk::env::sha256(&coin)).into_string();

    let lp = root.create_subaccount("plunk").initial_balance(NearToken::from_near(50)).transact().await?.into_result()?;
    let lp = lp.deploy(&wasm("plunk_launchpad")?).await?.into_result()?;
    let init = json!({ "owner": r, "coin_code_hash": hash, "exchange": ex.id(), "wnear": wrap.id(), "creation_fee": U128(NEAR / 2) });
    lp.call("new").args_json(init).transact().await?.into_result()?;
    for acct in [lp.id(), ex.id()] {
        root.call(wrap.id(), "storage_deposit").args_json(json!({ "account_id": acct })).deposit(NearToken::from_millinear(125)).transact().await?.into_result()?;
    }
    Ok(Env { worker, root, lp, wrap: wrap.id().clone(), exchange: ex.id().clone() })
}

impl Env {
    pub async fn user(&self, name: &str, near: u128) -> R<Account> {
        let a = self.root.create_subaccount(name).initial_balance(NearToken::from_near(near + 5)).transact().await?.into_result()?;
        if near > 0 {
            // near_deposit keeps the 0.00125 NEAR storage fee out of the first deposit.
            let amount = NearToken::from_yoctonear(near * NEAR + NEAR / 800);
            a.call(&self.wrap, "near_deposit").deposit(amount).transact().await?.into_result()?;
        }
        Ok(a)
    }

    pub async fn create_box(&self, dev: &Account, ticker: &str, min_raise: u128) -> R<u64> {
        self.create_box_with(dev, ticker, min_raise, Value::Null).await
    }

    /// `split` is the JSON dev-share split (bps summing to 10000) or `null` for all-dev.
    pub async fn create_box_with(&self, dev: &Account, ticker: &str, min_raise: u128, split: Value) -> R<u64> {
        self.create_box_extra(dev, ticker, min_raise, json!({ "split": split })).await
    }

    /// `extra` overrides or adds `create_box` arg fields (`split`, `solana_share_bps`, …).
    pub async fn create_box_extra(&self, dev: &Account, ticker: &str, min_raise: u128, extra: Value) -> R<u64> {
        let mut a = json!({
            "meta": { "name": ticker, "ticker": ticker, "image": "", "description": "" },
            "room_secs": 120, "min_raise": U128(min_raise), "fee_bps": 300, "split": Value::Null, "tax_window_secs": 86_400 });
        if let (Some(dst), Some(src)) = (a.as_object_mut(), extra.as_object()) {
            dst.extend(src.iter().map(|(k, v)| (k.clone(), v.clone())));
        }
        Ok(dev.call(self.lp.id(), "create_box").args_json(json!({ "args": a })).deposit(NearToken::from_near(1)).max_gas().transact().await?.json()?)
    }

    pub async fn bid(&self, who: &Account, box_id: u64, near: u128, max_tenths: Option<u128>) -> R<()> {
        let msg = match max_tenths {
            None => json!({ "box_id": box_id, "kind": "market" }),
            Some(t) => {
                let c = plunk_launchpad::bids::commit_hash(box_id, who.id(), per_m(t), &SALT);
                json!({ "box_id": box_id, "kind": "sealed", "commit": hex(&c), "tlock": "test-ciphertext" })
            }
        };
        let args = json!({ "receiver_id": self.lp.id(), "amount": U128(near * NEAR), "msg": msg.to_string() });
        who.call(&self.wrap, "ft_transfer_call").args_json(args).deposit(NearToken::from_yoctonear(1)).gas(TGAS_300).transact().await?.into_result()?;
        Ok(())
    }

    pub async fn view(&self, method: &str, args: Value) -> R<Value> {
        Ok(self.lp.view(method).args_json(args).await?.json()?)
    }

    pub async fn call(&self, who: &Account, method: &str, args: Value) -> R<()> {
        who.call(self.lp.id(), method).args_json(args).gas(TGAS_300).transact().await?.into_result()?;
        Ok(())
    }

    /// Like `call`, but returns the NEP-297 `plunk` events the transaction logged.
    pub async fn call_events(&self, who: &Account, method: &str, args: Value) -> R<Vec<Value>> {
        let out = who.call(self.lp.id(), method).args_json(args).gas(TGAS_300).transact().await?.into_result()?;
        Ok(out
            .logs()
            .iter()
            .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
            .filter_map(|j| serde_json::from_str::<Value>(j).ok())
            .filter(|e| e["standard"] == "plunk")
            .collect())
    }

    /// Fast-forwards the sandbox until its clock passes `ts` (ns).
    pub async fn wait_until(&self, ts: u64) -> R<()> {
        while self.worker.view_block().await?.timestamp() < ts {
            self.worker.fast_forward(30).await?;
        }
        Ok(())
    }

    pub async fn now(&self) -> R<u64> {
        Ok(self.worker.view_block().await?.timestamp())
    }

    pub async fn near_balance(&self, a: &Account) -> R<u128> {
        Ok(a.view_account().await?.balance.as_yoctonear())
    }

    pub async fn coin_balance(&self, coin: &str, a: &Account) -> R<u128> {
        let v: U128 = self.worker.view(&coin.parse()?, "ft_balance_of").args_json(json!({ "account_id": a.id() })).await?.json()?;
        Ok(v.0)
    }

    /// Runs a box from bids to Open with the given market bidders (name, NEAR), waiting out
    /// the room and looping `retry_open` like the app does. Returns the box id and pool id.
    pub async fn open_box(&self, dev: &Account, ticker: &str, split: Value, bidders: &[(&Account, u128)]) -> R<(u64, u64)> {
        self.open_box_extra(dev, ticker, json!({ "split": split }), bidders).await
    }

    /// `open_box` with arbitrary `create_box` arg overrides (see `create_box_extra`).
    pub async fn open_box_extra(&self, dev: &Account, ticker: &str, extra: Value, bidders: &[(&Account, u128)]) -> R<(u64, u64)> {
        let id = self.create_box_extra(dev, ticker, NEAR, extra).await?;
        for (who, near) in bidders {
            self.bid(who, id, *near, None).await?;
        }
        let totals = self.view("get_public_totals", json!({ "box_id": id })).await?;
        self.wait_until(totals["reveal_end"].as_u64().unwrap()).await?;
        let keeper = self.user(&format!("keeper-{ticker}"), 0).await?;
        self.call(&keeper, "open", json!({ "box_id": id })).await?;
        for _ in 0..6 {
            if self.view("get_box", json!({ "id": id })).await?["phase"] != "Opening" {
                break;
            }
            self.call(&keeper, "retry_open", json!({ "box_id": id })).await?;
        }
        let b = self.view("get_box", json!({ "id": id })).await?;
        assert_eq!(b["phase"], "Open", "box did not open: {b}");
        Ok((id, b["opening"]["pool_id"].as_u64().unwrap()))
    }
}
