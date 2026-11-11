//! T011 (SC-009, FR-018): hourly lowest-balance rewards, written red-first.
use plunk_coin::epochs::{on_balance_change, Account, Global, Pair};
use std::collections::HashMap;

const MIN: Pair = [10, 10];

/// In-memory stand-in for the coin's storage. "lp" is excluded (pool / launchpad).
struct Ledger {
    g: Global,
    accts: HashMap<&'static str, (u128, Account)>,
    dist: HashMap<u64, Pair>,
}

impl Ledger {
    fn new() -> Self {
        Ledger { g: Global::new(0), accts: HashMap::new(), dist: HashMap::new() }
    }
    fn set(&mut self, who: &'static str, new: u128, e: u64) {
        if who == "lp" {
            return;
        }
        let (old, acct) = self.accts.remove(who).map_or((0, None), |(b, a)| (b, Some(a)));
        let dist = &self.dist;
        let a = on_balance_change(&mut self.g, acct, old, new, e, |x| dist.get(&x).copied());
        self.accts.insert(who, (new, a));
    }
    fn bal(&self, who: &str) -> u128 {
        self.accts.get(who).map_or(0, |(b, _)| *b)
    }
    fn transfer(&mut self, from: &'static str, to: &'static str, amt: u128, e: u64) {
        let (f, t) = (self.bal(from), self.bal(to));
        self.set(from, f.saturating_sub(amt), e);
        self.set(to, t + amt, e);
    }
    fn distribute(&mut self, e: u64, near: u128, coin: u128) {
        if let Some((x, d)) = self.g.distribute(e, [near, coin], MIN) {
            self.dist.insert(x, d);
        }
    }
    fn claimable(&self, who: &str, e: u64) -> Pair {
        let Some((bal, a)) = self.accts.get(who) else { return [0, 0] };
        let mut a = a.clone();
        let mut g = self.g.clone();
        g.advance(e);
        a.settle(*bal, e, &g, |x| self.dist.get(&x).copied());
        a.owed
    }
}

#[test]
fn epoch_in_hour_buyer_earns_zero() {
    let mut l = Ledger::new();
    l.transfer("lp", "holder", 100, 9);
    l.transfer("lp", "buyer", 50, 10); // bought during epoch 10
    l.distribute(11, 30, 0); // pot for epoch 10
    assert_eq!(l.claimable("buyer", 11), [0, 0]);
    assert_eq!(l.claimable("holder", 11), [30, 0]);
    // From epoch 11 on, the buyer counts.
    l.distribute(12, 150, 0);
    assert_eq!(l.claimable("buyer", 12), [50, 0]);
    assert_eq!(l.claimable("holder", 12), [130, 0]);
}

#[test]
fn epoch_lowest_balance_on_partial_sell() {
    let mut l = Ledger::new();
    l.transfer("lp", "h", 100, 9);
    l.transfer("lp", "k", 100, 9);
    l.transfer("h", "lp", 60, 10); // sells 60, then buys it back within the hour
    l.transfer("lp", "h", 60, 10);
    l.distribute(11, 140, 0); // eligible = 40 + 100
    assert_eq!(l.claimable("h", 11), [40, 0]);
    assert_eq!(l.claimable("k", 11), [100, 0]);
}

#[test]
fn epoch_rollover_below_min_and_zero_eligible() {
    let mut l = Ledger::new();
    l.distribute(5, 50, 50); // nobody eligible in epoch 4: rolls over
    l.transfer("lp", "h", 100, 5);
    l.distribute(6, 5, 0); // epoch 5: h bought in-hour, still nobody eligible
    l.distribute(7, 0, 0); // epoch 6: h is eligible; both pots pay
    assert_eq!(l.claimable("h", 7), [55, 50]);
    l.distribute(8, 3, 0); // below the minimum: rolls over
    assert_eq!(l.claimable("h", 8), [55, 50]);
    l.distribute(9, 9, 0); // 12 pending now pays
    assert_eq!(l.claimable("h", 9), [67, 50]);
}

#[test]
fn epoch_settles_across_skipped_epochs() {
    let mut l = Ledger::new();
    l.transfer("lp", "h", 100, 9);
    l.transfer("lp", "k", 100, 9);
    l.distribute(11, 20, 0); // for epoch 10
    l.distribute(13, 40, 0); // for epoch 12; epoch 11 never distributed
    l.transfer("h", "lp", 50, 14);
    l.distribute(15, 30, 0); // epoch 14: h min 50, k 100
    assert_eq!(l.claimable("h", 15), [10 + 20 + 10, 0]);
    assert_eq!(l.claimable("k", 15), [10 + 20 + 20, 0]);
}

#[test]
fn epoch_touch_before_previous_hour_distributes() {
    // h trades early in epoch 11, before epoch 10's pot is distributed: it keeps its epoch-10 weight.
    let mut l = Ledger::new();
    l.transfer("lp", "h", 100, 9);
    l.transfer("lp", "k", 100, 9);
    l.transfer("h", "lp", 100, 11);
    l.distribute(11, 20, 0);
    assert_eq!(l.claimable("h", 11), [10, 0]);
    l.distribute(12, 20, 0); // epoch 11: h's min is 0
    assert_eq!(l.claimable("h", 12), [10, 0]);
    assert_eq!(l.claimable("k", 12), [30, 0]);
}

#[test]
fn epoch_same_epoch_distribute_is_noop() {
    let mut l = Ledger::new();
    l.transfer("lp", "h", 100, 9);
    l.distribute(11, 20, 0);
    l.distribute(11, 20, 0); // second call in epoch 11: amounts stay pending
    assert_eq!(l.claimable("h", 11), [20, 0]);
    l.distribute(12, 0, 0);
    assert_eq!(l.claimable("h", 12), [40, 0]);
}
