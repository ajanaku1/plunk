//! Uniform-price clearing (FR-008). Pure: no env access, so it is unit-tested on the host
//! and mirrored in `app/lib/math.ts`.

/// Whole coins sold to bidders (half of the 1B supply).
pub const TOKENS_FOR_BIDDERS: u128 = 500_000_000;
/// Smallest units per whole coin (24 decimals).
pub const ONE_COIN: u128 = 1_000_000_000_000_000_000_000_000;
/// A box accepts at most this many bids (FR-008).
pub const MAX_BIDS: usize = 200;

/// One bid going into clearing. `max_price` is yocto per whole coin; `None` is a market bid.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BidIn {
    pub id: u64,
    pub budget: u128,
    pub max_price: Option<u128>,
}

/// One bid's outcome. `paid + refund == budget`; `tokens` are in smallest units.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Fill {
    pub id: u64,
    pub paid: u128,
    pub tokens: u128,
    pub refund: u128,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Clearing {
    /// yocto per whole coin, rounded up; 0 when nothing was accepted.
    pub price: u128,
    pub accepted_total: u128,
    /// Same order as the input.
    pub fills: Vec<Fill>,
}

/// Market bids are always accepted. Sealed bids are then taken in groups of equal max price,
/// highest first. A group that fits whole is accepted; a group that would push the price above
/// its max is filled pro-rata up to exactly that price, and clearing stops there.
pub fn clear(bids: &[BidIn]) -> Clearing {
    assert!(bids.len() <= MAX_BIDS, "too many bids");
    let mut paid = vec![0u128; bids.len()];
    let mut acc: u128 = 0;
    for (i, b) in bids.iter().enumerate().filter(|(_, b)| b.max_price.is_none()) {
        paid[i] = b.budget;
        acc += b.budget;
    }
    let mut sealed: Vec<usize> = (0..bids.len()).filter(|&i| bids[i].max_price.is_some()).collect();
    sealed.sort_by_key(|&i| core::cmp::Reverse(bids[i].max_price));
    for group in sealed.chunk_by(|&a, &b| bids[a].max_price == bids[b].max_price) {
        let max = bids[group[0]].max_price.unwrap_or(0);
        let cap = max.saturating_mul(TOKENS_FOR_BIDDERS);
        let group_sum: u128 = group.iter().map(|&i| bids[i].budget).sum();
        if group_sum == 0 {
            continue;
        }
        let target = if acc + group_sum <= cap { group_sum } else { cap.saturating_sub(acc) };
        for &i in group {
            paid[i] = plunk_math::mul_div(bids[i].budget, target, group_sum);
            acc += paid[i];
        }
        if target < group_sum {
            break;
        }
    }
    settle(bids, &paid, acc)
}

/// Price rounds up so it never understates; tokens round down so the box never oversells.
fn settle(bids: &[BidIn], paid: &[u128], accepted_total: u128) -> Clearing {
    let price = accepted_total.div_ceil(TOKENS_FOR_BIDDERS);
    let fills = bids
        .iter()
        .zip(paid)
        .map(|(b, &p)| Fill {
            id: b.id,
            paid: p,
            tokens: if p == 0 { 0 } else { plunk_math::mul_div(p, ONE_COIN, price) },
            refund: b.budget - p,
        })
        .collect();
    Clearing { price, accepted_total, fills }
}
