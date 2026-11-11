# Quickstart validation (testnet, NEAR-only bidding)

These are the judge path (FR-032, SC-006) and the release check. The mainnet cross-chain path is a separate check, listed at the end.

## Prerequisites
- `cargo-near` 0.22.0 and `near` CLI 0.30.1 (installed), Node ≥22, pnpm.
- Three testnet accounts with faucet NEAR: dev, buyerA, buyerB. Wrap some NEAR to `wrap.testnet`.

## Build and test
1. `cargo near build non-reproducible-wasm` in `contracts/launchpad` and `contracts/coin`. See: both wasm files are built.
2. `cargo test --workspace`. See: unit tests pass, including `clearing_worked_example` (SC-001), the tax-math tests (SC-003), and the epoch-eligibility tests (SC-009).
3. `cargo test -p integration -- --ignored`. See: the sandbox flow create → bid → reveal → open → harvest → claim passes against the Ref exchange imported from testnet.

## Run the app
4. `pnpm --dir app dev` with `NEXT_PUBLIC_NETWORK=testnet`. See: the home page with an empty grid.
5. **Make a box** as dev: 2 min room, minimum 1 NEAR, fee 3%, split 1/1/0.4 net, 24h tax. See: it appears in the live strip, and the creation fee was shown before signing.
6. Two buyers each **seal a bid**. See: the totals update, and no price is shown anywhere.
7. Wait for Reveal (auto-reveal with the tab open). Then **Open**. See: the reveal animation, the clearing price, fills, refunds, and the pool id.
8. **Buy** from the terminal panel. See: the trade in the feed. The chart shows the first candle (or the reserve line, under the fallback).
9. As dev, **withdraw 10%**. See: about 90% to holders, and "the dev got plunked" in the feed.
10. Run `pnpm --dir keeper harvest` (or the Actions manual trigger) after the hour turns. See: a `harvested` event, then **Claim** as buyerA. See: NEAR + coin rewards received.
11. **Failure path:** make a box with minimum 5 NEAR and bid 1 NEAR. See: Failed state, and the refund claim returns 100%.

## Mainnet-only checks (the user signs; tiny amounts)
- **K1 kill test:** a 1Click quote for $1 Solana USDC into the stub contract with `customRecipientMsg`. See: the stub logs the msg and the sender (research R5). **Decides the 2026-11-08 cut.**
- **K2:** publish the coin as a global contract. See: the hash is usable from a sub-account (R2).
- **K3:** a router swap with `appFeeRate` on a tiny pool. See: the fee lands at the recipient, which settles the units (R4).
