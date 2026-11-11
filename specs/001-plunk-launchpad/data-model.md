# Data Model: Plunk Launchpad (Phase 1)

Units: NEAR amounts are in yocto (u128). Token amounts use 24 decimals for every coin, and total supply is 1e9 × 1e24. Prices are stored as **wNEAR yocto per 1e24 coin units (one whole coin)**. The UI shows NEAR per 1M coins. Times are block timestamps in ns. `epoch = floor(ts / 3_600e9)`.

## Launchpad contract (`plunk.near`)

### Config (singleton)
- `owner`: protocol account (receives the protocol 5% and the 1% raise fee).
- `coin_code_hash`: global contract hash.
- `exchange`: `v2.ref-finance.near` | `ref-finance-101.testnet`.
- `wnear`: `wrap.near` | `wrap.testnet`.
- `min_raise_floor`: default 1 NEAR, owner-raisable (FR-010).
- `min_distributable`: per-asset threshold, below which an epoch rolls over (FR-018).
- `creation_fee`: measured storage cost (FR-002).

### Box
| Field | Rule |
|---|---|
| id | u64, sequential |
| dev | creator account |
| meta | name, ticker (2–10 chars, `[a-z0-9]`), image URL, description |
| coin_id | `<ticker>.plunk.near`; ticker must be unused |
| room_secs | 120–600 (FR-001) |
| close_at | create time + room_secs |
| reveal_end | close_at + 60 s, or close_at when the box has no sealed bids (Reveal skipped) |
| min_raise | ≥ floor |
| fee_bps | 50–300, immutable (FR-019) |
| split | `{dev, holders, buyback_burn, buyback_keep}` bps of the dev share, summing to 10000. Only `dev` can decrease, and only toward the other buckets. |
| tax_window_secs | 86_400–604_800 |
| state | `Closed → Reveal → Opening → Open` or `Failed` (transitions are time-based plus `open()`) |
| totals | `total_in`, `bidder_count`, `market_total` |
| clearing | `price`, `accepted_total`, `marginal_ratio` (pro-rata at the margin) |
| pool | `pool_id`, `shares`, `sqrtk_per_share_last` |

### Bid (keyed by `(box_id, bid_id)`)
- `bidder` (the account whose NEAR paid, or `intents.near`/solver for cross-chain), `recipient` (the NEAR account that receives the coins).
- `kind`: `Sealed { commit, tlock: Option<String>, revealed_price: Option }` (`tlock` is deleted on reveal to free its storage) | `Market` | `XChainMarket`.
- `budget`, then after clearing: `filled_tokens`, `refund`, `claimed: bool`.
- **Validation:** bids are only accepted while `now < close_at`. An `XChainMarket` deposit arriving after close is stored as `LateDeposit { recipient, amount }` and is claimable (FR-028).

### Clearing (pure function, FR-008)
Inputs: market total M (including sealed bids never revealed, FR-009), then revealed sealed bids sorted by max price descending. Accept bid i while `price_i = (M + Σaccepted + budget_i) / 500_000_000 ≤ max_i`, where M and the budgets are in yocto and the price is yocto per whole coin (integer division, rounded up so the price never understates). If the tie at the marginal price would overshoot, fill it pro-rata. Output: price, per-bid fill and refund.

### DevEscrow (per box)
- `balance`, `window_start`, `window_end`.
- `tax(now) = 90% × max(0, window_end − now) / (window_end − window_start)`, so the linear rate is 0 after the end.
- `withdraw(W)` sends `W×t` to holder coin rewards and `W×(1−t)` to the dev (FR-023).
- `extend(secs)` requires `now ≥ window_end`. It sets `window_start = now` and `window_end = now + secs` (FR-024).

### TreasuryDeposit (per box, a list)
- `amount_remaining`, `deposited_at`. The tax follows the same formula over a fixed 7 days from `deposited_at` (FR-025). Withdrawals consume the oldest deposit first (lowest tax).

### Harvest (per box, per epoch)
- `last_epoch_harvested`. It runs once per epoch, and a call in the same epoch is a no-op (idempotent).
- **Flow:**
  1. View the pool.
  2. Compute growth g and remove `shares×(1−1/g)`.
  3. Withdraw both tokens.
  4. **Net first:** coin tokens cover the buyback (burn and keep shares). If they are short, wNEAR buys coin. If they exceed it, the surplus is sold for wNEAR.
  5. Pay out per the split math below.

**Split math (on the 80% Plunk receives, i.e. the protocol + dev parts of the gross):**
- protocol = 5/80 of the received value.
- dev share = 75/80, divided by `split`.
- The holders' part is sent as wNEAR to the coin contract (`ft_transfer_call` msg `reward_near`).
- Buyback-burn coins are burned via the coin contract `burn`.
- Buyback-keep coins become a TreasuryDeposit.

## Coin contract (global, one instance per box)

### State
- `ft: FungibleToken` (near-contract-standards) wrapped. **Every** balance change goes through `on_balance_change(acct, old, new)`.
- `excluded`: set {exchange, launchpad}. Excluded balances never accrue rewards.
- `circulating`: sum of non-excluded balances, kept live.
- `epoch_state[e]`:
  - `eligible_total`, set to `circulating` when epoch e first starts.
  - `acc_near[e]`, `acc_coin[e]`: cumulative reward per eligible token after epoch e is distributed.
- `account[a]`: `last_epoch`, `epoch_min` (lowest balance in `last_epoch`), `settled_near`, `settled_coin`, `idx_near`, `idx_coin`.

### Rules (FR-018, FR-023)
- **On touch in epoch e:**
  - If `last_epoch < e`:
    1. Settle rewards for `last_epoch` using `epoch_min`.
    2. Settle for epochs `(last_epoch, e)` using the balance, which hasn't changed since.
    3. Set `epoch_min = balance` and `last_epoch = e`.
  - If the new balance < `epoch_min`: `eligible_total[e] -= epoch_min − new` and `epoch_min = new`. Increases never raise `epoch_min`.
- **`distribute(e, near_amt, coin_amt)`**: only the launchpad may call it, and only for an ended epoch.
  - If `amt < min_distributable`, it carries to the next epoch's pot.
  - Otherwise `acc[e] = acc[e−1] + amt / eligible_total[e]`.
- **`claim()`** settles and pays both assets: wNEAR unwrapped to NEAR, and coins transferred.
- **`burn(amount)`**: launchpad only, reduces total supply.

## State transitions (Box)
```
create ──► Closed ──(now ≥ close_at)──► Reveal ──(now ≥ reveal_end, open())──┬──► Opening ──(pool ok)──► Open
                                                                            └──► Failed (accepted < min_raise)
Opening ──(pool step fails)──► Opening (retry_open())
```
