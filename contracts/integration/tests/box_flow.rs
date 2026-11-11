//! T016 (SC-002/004/005, FR-008–013): a whole box in the sandbox, against real copies of
//! wNEAR (`wrap.testnet`) and the Rhea/Ref exchange (`ref-finance-101.testnet`).
//! Slow (sandbox + testnet imports), so it is `#[ignore]`d; `./verify.sh phase-2` runs it.
mod common;
use common::*;
use near_sdk::json_types::U128;
use near_workspaces::types::NearToken;
use serde_json::{json, Value};

#[tokio::test]
#[ignore]
async fn box_flow_end_to_end() -> R<()> {
    let e = setup().await?;
    let dev = e.user("dev", 0).await?;
    let (a, b, c) = (e.user("alice", 100).await?, e.user("bob", 200).await?, e.user("carol", 100).await?);
    let id = e.create_box(&dev, "plunk", NEAR).await?;
    e.bid(&a, id, 100, Some(4)).await?; // A 100 @ 0.4
    e.bid(&b, id, 200, Some(3)).await?; // B 200 @ 0.3 (rejected)
    e.bid(&c, id, 100, Some(1)).await?; // C 100 @ 0.1, never revealed: clears as market (FR-009)

    // SC-002: before Reveal, public data has totals but no prices.
    let totals = e.view("get_public_totals", json!({ "box_id": id })).await?;
    assert_eq!(u(&totals["total_in"]), 400 * NEAR);
    let boxv = e.view("get_box", json!({ "id": id })).await?;
    assert!(boxv["opening"].is_null(), "no clearing data before open");
    assert!(!format!("{totals}{boxv}").contains("price"), "no price field before Reveal");

    let close = totals["close_at"].as_u64().unwrap();
    e.wait_until(close).await?;
    let keeper = e.user("keeper", 0).await?;
    for (bid_id, t) in [(0u32, 4u128), (1, 3)] {
        e.call(&keeper, "reveal", json!({ "box_id": id, "bid_id": bid_id, "max_price": U128(per_m(t)), "salt": hex(&SALT) })).await?;
    }
    e.wait_until(totals["reveal_end"].as_u64().unwrap()).await?;
    e.call(&keeper, "open", json!({ "box_id": id })).await?;
    // FR-014: each step that runs short of gas is resumed by `retry_open` (the app/keeper loop).
    let mut steps = 1;
    while e.view("get_box", json!({ "id": id })).await?["phase"] == "Opening" {
        let o = e.view("get_box", json!({ "id": id })).await?["opening"].clone();
        println!("step {steps}: {o}");
        assert!(steps < 6, "open did not finish in 6 transactions");
        e.call(&keeper, "retry_open", json!({ "box_id": id })).await?;
        steps += 1;
    }
    println!("open took {steps} transaction(s)");

    let boxv = e.view("get_box", json!({ "id": id })).await?;
    assert_eq!(boxv["phase"], "Open", "box: {boxv}");
    let o = &boxv["opening"];
    assert_eq!((u(&o["price"]), u(&o["accepted_total"])), (per_m(4), 200 * NEAR));
    // SC-005: exactly 1% of the raise is the protocol fee; the rest is in the pool.
    assert_eq!(u(&e.view("get_protocol_fees", json!({})).await?), 2 * NEAR);
    let pool: Value = e.worker.view(&e.exchange, "get_pool").args_json(json!({ "pool_id": o["pool_id"] })).await?.json()?;
    assert_eq!(pool["amounts"], json!([U128(198 * NEAR), U128(500_000_000 * ONE_COIN)]), "pool: {pool}");
    let shares: U128 = e.worker.view(&e.exchange, "get_pool_shares").args_json(json!({ "pool_id": o["pool_id"], "account_id": e.lp.id() })).await?.json()?;
    assert_eq!(shares.0, u(&pool["shares_total_supply"]), "launchpad owns 100% of the LP (FR-013)");

    let coin = format!("plunk.{}", e.lp.id());
    let storage = NearToken::from_millinear(10);
    for (who, bid_id) in [(&a, 0u32), (&c, 2)] {
        who.call(e.lp.id(), "claim_bid").args_json(json!({ "box_id": id, "bid_id": bid_id })).deposit(storage).gas(TGAS_300).transact().await?.into_result()?;
        assert_eq!(e.coin_balance(&coin, who).await?, 250_000_000 * ONE_COIN, "250M coins each");
    }
    let before = e.near_balance(&b).await?;
    e.call(&b, "claim_bid", json!({ "box_id": id, "bid_id": 1 })).await?;
    assert!(e.near_balance(&b).await? > before + 199 * NEAR, "rejected bid refunded in NEAR");
    Ok(())
}

#[tokio::test]
#[ignore]
async fn box_flow_failed_box_refunds_in_full() -> R<()> {
    let e = setup().await?;
    let dev = e.user("dev", 0).await?;
    let a = e.user("alice", 3).await?;
    let id = e.create_box(&dev, "nope", 50 * NEAR).await?;
    e.bid(&a, id, 3, None).await?;
    let totals = e.view("get_public_totals", json!({ "box_id": id })).await?;
    e.wait_until(totals["reveal_end"].as_u64().unwrap()).await?;
    e.call(&a, "open", json!({ "box_id": id })).await?;
    assert_eq!(e.view("get_box", json!({ "id": id })).await?["phase"], "Failed");
    let before = e.near_balance(&a).await?;
    e.call(&a, "claim_bid", json!({ "box_id": id, "bid_id": 0 })).await?;
    let gained = e.near_balance(&a).await? - before;
    assert!(gained > 3 * NEAR - NEAR / 100, "100% refund less gas, got {gained}");
    assert!(e.worker.view_account(&format!("nope.{}", e.lp.id()).parse()?).await.is_err(), "no coin, no pool (FR-010)");
    Ok(())
}
