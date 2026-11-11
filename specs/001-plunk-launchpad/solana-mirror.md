# Solana mirror · scope (decided 2026-11-11)

**Ask (user, 2026-11-11):** a coin launched on Plunk is also tradable on Solana right away, so a
launch taps Solana liquidity. $PLUNK is the first coin to launch this way, with the mainnet launch.

**Status:** decided 2026-11-11 (answers below). Phase A (contract split) starts now; phases B–D after
submission, for the mainnet $PLUNK launch.

## What exists today (do not restate in the video as more than this)

- Solana USDC → box bid via NEAR Intents 1Click (FR-027/028, K1 PASS on mainnet, tx `FnxnN3Lh…jJwG6`).
- Rhea pool on NEAR seeded at open with 500M coins + 99% of the raise, LP held by the launchpad.
- Hourly harvest on NEAR: fee split 20/5/75, holder rewards by lowest hourly balance.

## Proposed mechanic (minimal version)

1. **Allocation.** At box creation the dev picks a Solana share `s` of the LP half (proposal: 0–30%,
   default 20%). At open: `500M·(1−s)` coins + `99%·(1−s)` of the raise → Rhea; `500M·s` coins +
   `99%·s` of the raise → the Solana leg. Clearing math (FR-008) is unchanged; only the pool-seeding
   split moves. Bidders' 500M half is untouched.
2. **Bridge the coins.** The launchpad `ft_transfer_call`s the Solana-leg coins to the NEAR↔Solana
   bridge (Omni Bridge) with the recipient set to the launchpad's Solana vault. The bridge mints the
   SPL mirror on Solana. One-time per coin: register metadata so the SPL token exists.
3. **Bridge the quote.** The Solana leg's wNEAR is converted to Solana USDC (or SOL) through NEAR
   Intents 1Click with the vault as recipient (the reverse of K1).
4. **Seed the Solana pool.** A keeper holding the vault key creates a Meteora DAMM v2 pool with the
   mirrored coins and the USDC, then permanently locks the position. Lock is a Solana-side action.
5. **Fees on Solana (Meteora DAMM v2).** The pool's base fee accrues to LP positions. Our position is
   permanently locked (`permanent_lock_position`) but fees stay claimable. Collect-fee mode OnlyB
   (quote only) so fees arrive as USDC, never as the coin. Meteora keeps its own protocol cut of the
   base fee (its analogue of the 20% Rhea share on NEAR). DAMM v2 removed partner fees in cp-amm
   0.2.0, so there is no partner-config route; everything flows through our position. The keeper
   claims the USDC, converts it to wNEAR via Intents, and `ft_transfer_call`s it into the box as fee
   income, where the harvest applies the normal split (5% protocol, 75% dev share and its holder /
   buyback sliders). This is the reason the
   Solana side is **keeper-driven rather than contract-automatic**: no NEAR contract can read or pull
   a Solana LP's fees. NEAR-side fees stay fully automatic.

## Decisions (user, 2026-11-11)

| # | Decision | Decided |
|---|---|---|
| D1 | Bridge | Omni Bridge |
| D2 | Solana DEX | Meteora DAMM v2: permanent-lock position that still claims fees; collect-fee mode OnlyB (USDC); pool quote USDC |
| D3 | Solana share `s` | dev picks 0–50% per box; make-form default 30%; contract default when omitted = 0 (keeps existing boxes and tests unchanged); $PLUNK launches at 30% |
| D4 | Vault key | keeper keypair in GitHub secrets (same policy as KEEPER_KEY); user funds it with SOL for rent/fees |
| D5 | Sweep cadence | daily keeper job |
| D7 | Timing | Phase A (contract split) now, before 2026-11-14; B–D after submission |
| D8 | Dependencies | approved for the keeper only: `@solana/web3.js`, `@solana/spl-token`, `@meteora-ag/cp-amm-sdk` |
| D6 | Testnet story | Omni Bridge + 1Click are mainnet-only; the sandbox cannot run this. Tests stop at "coins and wNEAR handed to the bridge/Intents with the right msg". The Solana leg is proven on mainnet with tiny amounts, user-signed. |

## New dependencies (approved 2026-11-11 for the keeper; not installed until phase C)

- keeper: `@solana/web3.js`, `@solana/spl-token`, Meteora DAMM v2 SDK (`@meteora-ag/cp-amm-sdk`).
- contracts: none expected (bridge and Intents are reached with `ft_transfer_call`).

## Honest estimate

4–6 working days end to end: contract split + tests (1), bridge + Intents legs with a mainnet dry run
(1–2), Solana keeper: DAMM v2 pool create, permanent lock, fee claim + sweep (2), app surface + docs (1). Does not fit before
2026-11-14 alongside the video and submission. Fits the already-deferred mainnet launch window, which is
when the user wants it live ($PLUNK first).

## Video / submission wording until it ships

"Next: every Plunk coin is mirrored to Solana at open, so a launch taps Solana liquidity too. $PLUNK
launches this way on mainnet." Marked as next, not as shipped.

## Phases

- **A · Contract split (now).** `CreateArgs.solana_share_bps: Option<u16>` (0–5000, default 0). At open,
  the Rhea seed uses `(1−s)` of the LP coins and of the net raise; the `s` part is held on the box as
  `mirror: { coins, wnear, sent: false }` and shown in `get_box`. Math and views unit-tested; the
  sandbox box_flow checks a box with `s = 3000` seeds Rhea with 70% and holds 30%. No external calls.
- **B · Legs (after submission, mainnet).** `send_mirror(box_id)`: coins → Omni Bridge, wNEAR → Intents
  (USDC to the vault). Sandbox tests stop at the `ft_transfer_call` msgs. One tiny mainnet dry run.
- **C · Solana keeper.** DAMM v2 pool create (USDC quote, OnlyB), permanent lock, daily fee claim →
  Intents → `ft_transfer_call` into the box as fee income.
- **D · App + docs.** Slider on the make form (default 30%), mirror panel on the box page, README.
