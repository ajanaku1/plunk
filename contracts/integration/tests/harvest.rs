//! T025 (FR-016/017/018): trades → harvest → 20/5/75 by sqrt(k) growth; coin fees cover the
//! buyback first; a second harvest in the same hour is a no-op; holders claim NEAR + coins.
//! Slow (sandbox + testnet imports), so it is `#[ignore]`d; `./verify.sh phase-4` runs it.
mod common;
use common::*;
use near_sdk::json_types::U128;
use near_workspaces::types::NearToken;
use near_workspaces::Account;
use serde_json::{json, Value};

const HOUR_NS: u64 = 3_600 * 1_000_000_000;

/// An instant swap on the exchange: `ft_transfer_call` with Ref's `Execute` message.
async fn swap(e: &Env, who: &Account, token_in: &str, token_out: &str, pool_id: u64, amount: u128) -> R<()> {
    let msg = json!({ "actions": [{ "pool_id": pool_id, "token_in": token_in, "amount_in": U128(amount), "token_out": token_out, "min_amount_out": U128(1) }] }).to_string();
    let args = json!({ "receiver_id": e.exchange, "amount": U128(amount), "msg": msg });
    who.call(&token_in.parse()?, "ft_transfer_call").args_json(args).deposit(NearToken::from_yoctonear(1)).gas(TGAS_300).transact().await?.into_result()?;
    Ok(())
}

/// Calls `harvest` and keeps calling it while a harvest is in flight (the keeper loop).
async fn harvest(e: &Env, who: &Account, id: u64) -> R<Vec<Value>> {
    let mut events = e.call_events(who, "harvest", json!({ "box_id": id })).await?;
    for _ in 0..8 {
        if e.view("get_box", json!({ "id": id })).await?["harvest"].is_null() {
            return Ok(events);
        }
        events.extend(e.call_events(who, "harvest", json!({ "box_id": id })).await?);
    }
    panic!("harvest did not finish in 9 transactions");
}

async fn pool(e: &Env, pool_id: u64) -> R<Value> {
    Ok(e.worker.view(&e.exchange, "get_pool").args_json(json!({ "pool_id": pool_id })).await?.json()?)
}


#[tokio::test]
#[ignore]
async fn harvest_splits_fees_and_pays_holders() -> R<()> {
    let e = setup().await?;
    let dev = e.user("dev", 100).await?;
    let (a, c) = (e.user("alice", 100).await?, e.user("carol", 100).await?);
    let bob = e.user("bob", 300).await?;
    // dev 40 / holders 40 / burn 10 / keep 10 of the dev's 75%.
    let split = json!({ "dev": 4000, "holders": 4000, "buyback_burn": 1000, "buyback_keep": 1000 });
    let (id, pool_id) = e.open_box(&dev, "plunk", split, &[(&dev, 100), (&a, 100), (&c, 100)]).await?;
    let coin = format!("plunk.{}", e.lp.id());
    let storage = NearToken::from_millinear(10);
    for (who, bid_id) in [(&a, 1u32), (&c, 2)] {
        who.call(e.lp.id(), "claim_bid").args_json(json!({ "box_id": id, "bid_id": bid_id })).deposit(storage).gas(TGAS_300).transact().await?.into_result()?;
    }
    // FR-022: the dev's own fill sits in escrow; withdrawing 10% at 90% tax seeds the coin pot.
    let b0 = e.view("get_box", json!({ "id": id })).await?;
    let escrow = u(&b0["escrow"]["balance"]);
    assert!(escrow > 0, "dev fill escrowed: {b0}");
    let preview = e.view("preview_withdraw", json!({ "box_id": id, "amount": U128(escrow / 10) })).await?;
    assert!(preview["rate_bps"].as_u64().unwrap() >= 8990, "the window has just started: {preview}");
    dev.call(e.lp.id(), "dev_withdraw").args_json(json!({ "box_id": id, "amount": U128(escrow / 10) })).deposit(storage).gas(TGAS_300).transact().await?.into_result()?;
    let coin_pot = u(&e.view("get_box", json!({ "id": id })).await?["coin_pot"]);
    // The preview ran a few blocks earlier, so its (higher) tax is the ceiling; 89% is the floor.
    assert!(coin_pot <= u(&preview["to_holders"]) && coin_pot >= (escrow / 10) * 89 / 100, "about 90% of the withdrawal waits for holders: {coin_pot} vs {preview}");

    // Trades in the next hour: bob buys with 60 NEAR, then sells a third of his coins back.
    let open_epoch = e.now().await? / HOUR_NS;
    e.wait_until((open_epoch + 1) * HOUR_NS + 5_000_000_000).await?;
    bob.call(&coin.parse()?, "storage_deposit").args_json(json!({ "account_id": bob.id() })).deposit(storage).transact().await?.into_result()?;
    swap(&e, &bob, e.wrap.as_str(), &coin, pool_id, 60 * NEAR).await?;
    let bought = e.coin_balance(&coin, &bob).await?;
    println!("bob bought {bought} coin units; pool after buy: {}", pool(&e, pool_id).await?);
    assert!(bought > 0, "bob received coins");
    swap(&e, &bob, &coin, e.wrap.as_str(), pool_id, bought / 3).await?;

    // Harvest at the next hour: fees since open are the sqrt(k)-per-share growth (R3).
    e.wait_until((open_epoch + 2) * HOUR_NS + 5_000_000_000).await?;
    let before = pool(&e, pool_id).await?;
    let (x, y, s) = (u(&before["amounts"][0]), u(&before["amounts"][1]), u(&before["shares_total_supply"]));
    let our_shares_before = u(&e.view("get_box", json!({ "id": id })).await?["opening"]["shares"]);
    let per_share_last = u(&e.view("get_box", json!({ "id": id })).await?["per_share_last"]);
    // Independent f64 reckoning of the contract's per_share = sqrt(x·y) × 1e18 / S (research R3).
    let per_share_now = (x as f64 * y as f64).sqrt() * 1e18 / s as f64;
    assert!(per_share_now > per_share_last as f64 * 1.000_001, "fees grew sqrt(k) per share: now {per_share_now} vs last {per_share_last}");
    let expect_remove = our_shares_before - (our_shares_before as f64 * per_share_last as f64 / per_share_now) as u128;
    println!("pool before harvest: {before}\nours {our_shares_before} per_share_last {per_share_last} per_share_now {per_share_now} expect_remove {expect_remove}");

    let keeper = e.user("keeper", 0).await?;
    let protocol_before = u(&e.view("get_protocol_fees", json!({})).await?);
    let dev_before = e.near_balance(&dev).await?;
    let supply_before: U128 = e.worker.view(&coin.parse()?, "ft_total_supply").await?.json()?;
    let events = harvest(&e, &keeper, id).await?;
    let ev = events.iter().find(|e| e["event"] == "harvested").expect("harvested event");
    let d = &ev["data"][0];
    println!("harvested: {d}");

    let bx = e.view("get_box", json!({ "id": id })).await?;
    let removed = our_shares_before - u(&bx["opening"]["shares"]);
    println!("removed {removed} shares; box after: {bx}\npool after: {}", pool(&e, pool_id).await?);
    let tolerance = expect_remove / 100 + 1;
    assert!(removed.abs_diff(expect_remove) <= tolerance, "removed {removed} shares, expected about {expect_remove} (R3 fee isolation)");
    assert!(removed > 0 && removed < our_shares_before / 10, "a harvest takes fees, not principal");

    // FR-016: on the wNEAR side, protocol : dev : holders = 5 : 30 : 30 (dev 40% and holders 40% of 75).
    let (protocol, dev_near, holders_near) = (u(&d["protocol"]), u(&d["dev"]), u(&d["near_to_holders"]));
    assert!(protocol > 0, "protocol fee: {d}");
    assert!(dev_near.abs_diff(protocol * 6) <= protocol / 50 + 10, "dev = 6 × protocol, got {dev_near} vs {protocol}");
    assert!(holders_near.abs_diff(protocol * 6) <= protocol / 50 + 10, "holders = 6 × protocol (+dust), got {holders_near}");
    assert_eq!(u(&e.view("get_protocol_fees", json!({})).await?), protocol_before + protocol);
    assert!(e.near_balance(&dev).await? > dev_before + dev_near - NEAR / 100, "dev paid in NEAR");
    // FR-017: coins from the sell covered the buyback first; only the imbalance was swapped.
    let (burned, kept) = (u(&d["burned"]), u(&d["kept"]));
    assert!(burned > 0 && kept > 0, "buyback split burn/keep: {d}");
    assert!(burned.abs_diff(kept) <= 1, "burn : keep = 1 : 1");
    assert!(!d["swapped"].is_null(), "the imbalance was swapped: {d}");
    let supply_after: U128 = e.worker.view(&coin.parse()?, "ft_total_supply").await?.json()?;
    assert_eq!(supply_before.0 - supply_after.0, burned, "burned coins left the supply");
    assert_eq!(u(&bx["treasury"][0]["remaining"]), kept, "kept coins became a treasury deposit (FR-025)");
    assert_eq!(bx["last_harvest_epoch"].as_u64().unwrap(), open_epoch + 2);

    // Same hour again: a no-op (FR-016 idempotence).
    let again = harvest(&e, &keeper, id).await?;
    assert!(again.iter().all(|e| e["event"] != "harvested"), "second harvest in the same epoch did nothing");
    assert_eq!(u(&e.view("get_box", json!({ "id": id })).await?["opening"]["shares"]), u(&bx["opening"]["shares"]));

    // Next hour: the distribution closes the epoch alice and carol held through, so they can claim.
    e.wait_until((open_epoch + 3) * HOUR_NS + 5_000_000_000).await?;
    harvest(&e, &keeper, id).await?;
    let claimable: Value = e.worker.view(&coin.parse()?, "get_claimable").args_json(json!({ "account_id": a.id() })).await?.json()?;
    println!("alice claimable: {claimable}");
    assert!(u(&claimable["near"]) > 0, "alice earns NEAR fees (FR-018)");
    assert!(u(&claimable["coin"]) > 0, "alice earns the dev's taxed coins (FR-023)");
    let (near_before, coins_before) = (e.near_balance(&a).await?, e.coin_balance(&coin, &a).await?);
    a.call(&coin.parse()?, "claim").gas(TGAS_300).transact().await?.into_result()?;
    assert!(e.coin_balance(&coin, &a).await? > coins_before, "claim paid coins");
    assert!(e.near_balance(&a).await? + NEAR / 100 > near_before + u(&claimable["near"]), "claim paid NEAR");
    Ok(())
}
