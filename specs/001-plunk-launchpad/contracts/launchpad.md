# Contract interface: Launchpad (`plunk.near` / `plunk.testnet`)

Change methods list attached deposit and gas. Every view returns JSON. Events use NEP-297 standard `plunk`, version `1.0.0`.

## Change methods
| Method | Args | Deposit | Notes (FR) |
|---|---|---|---|
| `create_box` | `{meta, room_secs, min_raise, fee_bps, split, tax_window_secs}` | ≥ `creation_fee` | Validates ranges and that the ticker is free. Emits `box_created` (FR-001/002) |
| `ft_on_transfer` (from `wnear`) | msg `{"box_id","kind":"sealed","commit":"<hex32>","tlock":"<armored ciphertext ≤ 1 KB>"}` / `{"box_id","kind":"market"}` / `{"box_id","kind":"xchain","recipient":"<acct>"}` | — | **Always returns `"0"`.** Invalid or late input becomes a `LateDeposit` credit (FR-004/027/028) |
| `reveal` | `{box_id, bid_id, max_price, salt}` | 0 | **Anyone**, only during Reveal. Checks the commit; the caller can only withhold, never forge (FR-007) |
| `open` | `{box_id}` | 0 | Anyone, once `now ≥ reveal_end` (or `now ≥ close_at` when no sealed bids were placed). Clears, takes the 1% raise fee, creates the coin + pool + LP. On min-raise miss → Failed (FR-008–013) |
| `retry_open` | `{box_id}` | 0 | Only in Opening, after a failed pool step (FR-014) |
| `claim_bid` | `{box_id, bid_id}` | 0 | Pays fill tokens to the recipient and the refund in NEAR. Failed boxes refund 100% (FR-009/010) |
| `claim_late` | `{box_id}` | 0 | Pays out the caller's LateDeposit credits (FR-028) |
| `dev_withdraw` | `{box_id, amount}` | 1 yocto | Dev only. Tax per data-model. Emits `dev_plunked {amount, to_holders, rate_bps}` (FR-023/026) |
| `dev_extend` | `{box_id, secs}` | 1 yocto | Dev only. Fails while the window is running (FR-024) |
| `shift_split` | `{box_id, split}` | 1 yocto | Dev only. `split.dev` may only decrease (FR-019) |
| `treasury_withdraw` | `{box_id, amount}` | 1 yocto | Owner (for its coin) or dev. Taxed per deposit (FR-025) |
| `harvest` | `{box_id}` | 0 | Anyone. A no-op if it already ran this epoch. Emits `harvested` (FR-016/017) |
| `set_floor` / `set_min_distributable` | `{...}` | 1 yocto | Owner only. Never affects boxes already created (FR-010) |

## Views
`get_box(id)`, `list_boxes(from, limit)`, `next_to_open()`, `get_bids(box_id, account)`, `get_public_totals(box_id)` (no prices before Reveal: FR-005), `preview_withdraw(box_id, amount)` → `{to_dev, to_holders, rate_bps}`, `get_late(box_id, account)`, `get_config()`.

## Events
`box_created`, `bid_placed {box_id, kind, total_in, bidder_count}` (**never** includes the price), `revealed`, `box_opened {price, accepted_total, pool_id}`, `box_failed`, `dev_plunked`, `dev_extended`, `split_shifted`, `harvested {epoch, near_to_holders, burned, kept}`, `late_credited`.
