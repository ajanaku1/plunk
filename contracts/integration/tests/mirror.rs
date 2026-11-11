//! Solana mirror phase A in the sandbox: a box with a 30% Solana share seeds Rhea with 70% of the
//! LP half and holds the rest on the box, with the launchpad still owning 100% of the LP.
mod common;
use common::*;
use near_sdk::json_types::U128;
use serde_json::{json, Value};


#[tokio::test]
#[ignore]
async fn mirror_share_is_held_back_from_the_rhea_seed() -> R<()> {
    let e = setup().await?;
    let dev = e.user("dev", 0).await?;
    let (a, b) = (e.user("alice", 100).await?, e.user("bob", 100).await?);
    let (id, pool_id) = e.open_box_extra(&dev, "mirr", json!({ "solana_share_bps": 3000 }), &[(&a, 100), (&b, 100)]).await?;

    let bx = e.view("get_box", json!({ "id": id })).await?;
    assert_eq!(bx["solana_share_bps"], 3000);
    assert_eq!(bx["mirror"], json!({ "coins": U128(150_000_000 * ONE_COIN), "wnear": U128(198 * NEAR * 3 / 10), "sent": false }), "mirror: {bx}");

    let pool: Value = e.worker.view(&e.exchange, "get_pool").args_json(json!({ "pool_id": pool_id })).await?.json()?;
    assert_eq!(pool["amounts"], json!([U128(198 * NEAR * 7 / 10), U128(350_000_000 * ONE_COIN)]), "pool: {pool}");
    let shares: U128 = e.worker.view(&e.exchange, "get_pool_shares").args_json(json!({ "pool_id": pool_id, "account_id": e.lp.id() })).await?.json()?;
    assert_eq!(shares.0, u(&pool["shares_total_supply"]), "launchpad owns 100% of the LP");

    // The held-back wNEAR stays on the launchpad's wNEAR balance until phase B sends it.
    let bal: U128 = e.worker.view(&e.wrap, "ft_balance_of").args_json(json!({ "account_id": e.lp.id() })).await?.json()?;
    assert!(bal.0 >= 198 * NEAR * 3 / 10, "launchpad wNEAR {} holds the mirror leg", bal.0);
    Ok(())
}
