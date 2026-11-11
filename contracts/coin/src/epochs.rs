//! Hourly holder rewards by lowest balance (FR-018). Pure state machines; the contract stores them.
use near_sdk::near;

/// Fixed-point scale of the per-token reward accumulators.
pub const SCALE: u128 = 1_000_000_000_000_000_000;
/// [NEAR (wNEAR yocto), coin (smallest units)].
pub type Pair = [u128; 2];

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Global {
    pub epoch: u64,
    pub circulating: u128,
    pub cur_eligible: u128,
    pub prev_eligible: u128,
    pub acc: Pair,
    pub pending: Pair,
    pub last_distributed: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Account {
    pub epoch: u64,
    pub cur_min: u128,
    pub prev_w: u128,
    pub prev_pending: bool,
    pub idx: Pair,
    pub owed: Pair,
}

impl Global {
    pub fn new(epoch: u64) -> Self {
        Global {
            epoch,
            circulating: 0,
            cur_eligible: 0,
            prev_eligible: 0,
            acc: [0, 0],
            pending: [0, 0],
            last_distributed: None,
        }
    }

    /// Roll into epoch `e`. The finished epoch's eligible total becomes `prev_eligible`; a skipped
    /// epoch saw no balance changes, so its eligible total is the circulating supply.
    pub fn advance(&mut self, e: u64) {
        if e <= self.epoch {
            return;
        }
        self.prev_eligible = if e == self.epoch + 1 { self.cur_eligible } else { self.circulating };
        self.cur_eligible = self.circulating;
        self.epoch = e;
    }

    /// Add `add` to the pots and, once per epoch, close them into the previous epoch (e − 1).
    /// A pot below its minimum, or with nobody eligible, stays pending (rolls over).
    /// Returns the per-token increments to record for that epoch, or None if it already ran.
    pub fn distribute(&mut self, e: u64, add: Pair, min: Pair) -> Option<(u64, Pair)> {
        self.advance(e);
        for i in 0..2 {
            self.pending[i] += add[i];
        }
        let x = e.checked_sub(1)?;
        if self.last_distributed.is_some_and(|d| d >= x) {
            return None;
        }
        self.last_distributed = Some(x);
        let mut delta = [0, 0];
        for i in 0..2 {
            if self.pending[i] < min[i] || self.prev_eligible == 0 {
                continue;
            }
            let Some(d) = plunk_math::checked_mul_div(self.pending[i], SCALE, self.prev_eligible) else {
                continue;
            };
            self.pending[i] -= plunk_math::mul_div(d, self.prev_eligible, SCALE);
            self.acc[i] += d;
            delta[i] = d;
        }
        Some((x, delta))
    }
}

impl Account {
    pub fn new(e: u64, g: &Global) -> Self {
        Account { epoch: e, cur_min: 0, prev_w: 0, prev_pending: false, idx: g.acc, owed: [0, 0] }
    }

    /// Credit every distribution since the last settlement, then roll into epoch `e`.
    /// `bal` is the balance held since the last touch. Only epochs `epoch − 1` and `epoch` can
    /// carry a weight other than `bal`, and each is distributed during the epoch after it.
    pub fn settle(&mut self, bal: u128, e: u64, g: &Global, dist: impl Fn(u64) -> Option<Pair>) {
        let l = self.epoch;
        let prev = if self.prev_pending { l.checked_sub(1).and_then(&dist) } else { None };
        let cur = if e > l { dist(l) } else { None };
        for i in 0..2 {
            let d_prev = prev.map_or(0, |p| p[i]);
            let d_cur = cur.map_or(0, |p| p[i]);
            let rest = (g.acc[i] - self.idx[i]).saturating_sub(d_prev + d_cur);
            self.owed[i] += weigh(self.prev_w, d_prev) + weigh(self.cur_min, d_cur) + weigh(bal, rest);
        }
        self.idx = g.acc;
        if e > l {
            self.prev_w = if e == l + 1 { self.cur_min } else { bal };
            self.cur_min = bal;
            self.prev_pending = dist(e - 1).is_none();
            self.epoch = e;
        } else {
            self.prev_pending = self.prev_pending && prev.is_none();
        }
    }
}

fn weigh(balance: u128, per_token: u128) -> u128 {
    plunk_math::mul_div(balance, per_token, SCALE)
}

/// The hook every balance change of a non-excluded account runs through.
/// Increases never raise the epoch minimum, so coins bought in-hour earn from the next hour.
pub fn on_balance_change(
    g: &mut Global,
    acct: Option<Account>,
    old: u128,
    new: u128,
    e: u64,
    dist: impl Fn(u64) -> Option<Pair>,
) -> Account {
    g.advance(e);
    let mut a = acct.unwrap_or_else(|| Account::new(e, g));
    a.settle(old, e, g, dist);
    g.circulating = g.circulating - old + new;
    if new < a.cur_min {
        g.cur_eligible -= a.cur_min - new;
        a.cur_min = new;
    }
    a
}
