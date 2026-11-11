//! T013: the Rust side of the fixtures shared with `app/lib/math.test.ts`.
use near_sdk::serde_json::{self, Value};
use plunk_launchpad::clearing::{clear, BidIn};

fn num(v: &Value) -> u128 {
    v.as_str().expect("amounts are strings").parse().expect("u128")
}

#[test]
fn clearing_matches_shared_fixtures() {
    let cases: Vec<Value> = serde_json::from_str(include_str!("../../fixtures/clearing.json")).unwrap();
    assert!(!cases.is_empty());
    for case in &cases {
        let name = case["name"].as_str().unwrap();
        let bids: Vec<BidIn> = case["bids"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| BidIn {
                id: b["id"].as_u64().unwrap(),
                budget: num(&b["budget"]),
                max_price: (!b["max_price"].is_null()).then(|| num(&b["max_price"])),
            })
            .collect();
        let r = clear(&bids);
        let want = &case["expected"];
        assert_eq!(r.price, num(&want["price"]), "{name}: price");
        assert_eq!(r.accepted_total, num(&want["accepted_total"]), "{name}: accepted");
        for (f, w) in r.fills.iter().zip(want["fills"].as_array().unwrap()) {
            assert_eq!(f.id, w["id"].as_u64().unwrap(), "{name}: order");
            assert_eq!((f.paid, f.tokens, f.refund), (num(&w["paid"]), num(&w["tokens"]), num(&w["refund"])), "{name}: bid {}", f.id);
        }
    }
}
