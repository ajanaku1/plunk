# Research: Plunk Launchpad (Phase 0)

Date: 2026-11-02. Sources were fetched in this session. V = verified (primary source or a mainnet/testnet RPC call), U = unverified.

## R1. Toolchain
- **Decision:** near-sdk-rs **5.30.0** (MSRV 1.95, released 2026-10-27), with near-contract-standards from the same release. Build with `cargo near build non-reproducible-wasm` (cargo-near 0.22.0, installed). Target `wasm32-unknown-unknown`. Local rustc is 1.97.1.
- **Rationale:** latest SDK for nearcore 2.14 (V, near-sdk-rs CHANGELOG). cargo-near sets the `--cfg near` that the SDK requires (V, cargo-near README).
- **Risk:** no source confirms that a 1.97-built wasm passes the current NEAR VM (U). **Day-1 smoke test:** deploy a hello contract to testnet. Fallback: pin rustup to 1.95.
- **Alternatives:** reproducible Docker builds. Deferred: they need Docker and a committed tree.

## R2. One token per box
- **Decision:** the coin contract is published once as a **global contract by hash** (NEP-591). Each box creates `<ticker>.plunk.near` with `create_account().transfer().use_global_contract(hash).function_call("new")` in one batch (V, docs.near.org/smart-contracts/global-contracts; SDK ≥5.25).
- **Rationale:** publishing burns 10 NEAR per 100 KB once (about 20 NEAR). Each instance then costs under 0.001 NEAR, against about 2 NEAR locked per plain deploy (V, storage price is 1 NEAR per 100 KB). The creation fee (FR-002) covers account + state storage. The exact value gets measured on testnet.
- **Risk:** global contracts being live on mainnet is U. **Day-1 test:** publish on testnet, then mainnet, with a tiny contract. Fallback: plain `deploy_contract`, with the creation fee raised to about 2.5 NEAR.
- **Immutability:** use by hash, so nobody (us included) can swap the token code under live coins.

## R3. Liquidity on Rhea (`v2.ref-finance.near`, testnet `ref-finance-101.testnet`)
All V: mirror source DevOfCredit/ref-contracts v1.9.18, mainnet runs 1.9.21, cross-checked by RPC.
- `add_simple_pool({tokens, fee})`: fee in bps, below 10000, **immutable**. About 0.05 NEAR storage attached; the excess is refunded. No whitelist check.
- Depositing a non-whitelisted token requires the depositor to call `register_tokens` first. Plunk registers both tokens.
- `add_liquidity`: the first LP mints `INIT_SHARES_SUPPLY`.
- `remove_liquidity` returns tokens to the internal deposit balance. They then need `withdraw`.
- Admin fee: 2000 bps of each swap's sqrt(k) growth is **minted as LP shares to the exchange**. The fee is charged on the input token.
- **Fee isolation decision:** fees are the growth of `sqrt(x·y)/shares_total`. Price movement leaves k unchanged in a constant-product pool. At each harvest:
  - `g = (sqrtK_now/S_now) / (sqrtK_last/S_last)`
  - remove `my_shares × (1 − 1/g)` shares
  - This takes exactly our accrued 80%. Rhea's 20% is already the shares minted to it, so our split math runs on the 80% we receive. That matches the earlier "Rhea keeps 20%" assumption.
- **Discovery:** the auto-whitelist suffixes (`.tkn.near`, `.meme-cooking.near`, …) are owner-controlled. Coins under `.plunk.near` won't show in Rhea's UI by default. That's an outreach item, not a build item.

## R4. In-app trades and the 0.1% app fee
- **Decision:** in-app swaps go through Rhea SmartRouter V2: `GET smartx.rhea.finance/swapMultiDexPath`, then `ft_transfer_call` to `aggregatedex.near` with `{msg, signature}` and exactly 300 Tgas (V, rhea-sdk-docs). Parameters: `appFeeRate` + `appFeeRecipient`.
- **Risks (U):**
  - The `appFeeRate` units are internally inconsistent in the docs.
  - It's unknown whether the router routes to a brand-new simple pool.
  - **Day-1 test** with a tiny amount. Fallback: a direct `ft_transfer_call` swap on `v2.ref-finance.near` with no app fee. The UI then drops the 0.1% line, and FR-020 is recorded as a deviation.
- The router is mainnet-only (U), so testnet trades use the direct pool swap.

## R5. Cross-chain bids (1Click)
- **Decision:** `POST /v0/quote` with:
  - `swapType: EXACT_INPUT`, `depositType: ORIGIN_CHAIN`, `recipientType: DESTINATION_CHAIN`
  - `recipient: plunk.near`, `destinationAsset: nep141:wrap.near`, `refundTo: <origin addr>`
  - `customRecipientMsg: {"box_id","kind":"xchain","recipient":"<near acct>"}`
  - Track with `GET /v0/status`. Asset ids come from `GET /v0/tokens`. No JWT; the unauthenticated fee is +0.25% (V, docs.near-intents.org).
- **Refund reality:** `ft_transfer_call` deliveries are not refundable via Intents (V, Verifier withdrawal docs). So `ft_on_transfer` **never returns a non-zero amount**. Late or invalid deposits are credited as claimable wNEAR (FR-028).
- **Latency:** up to 15 min (V, docs), hence the quote cutoff 5 min before close.
- **Day-1 kill test:** a $1 mainnet quote into a stub contract that logs `msg` and the predecessor. It confirms delivery, the msg pass-through, and who the sender is. **Cut line 2026-11-08.**

## R6. Hourly keeper
- **Decision:** GitHub Actions `schedule: "17 * * * *"` plus `workflow_dispatch`. It runs `keeper/harvest.ts`, which calls `harvest(box_id)` for every open box with a function-call-only access key kept in repo secrets (V: Actions minimum is 5 min, with possible delays; Vercel Hobby cron is daily-only).
- `harvest` is permissionless and idempotent per epoch, so late or duplicate runs are harmless.
- **Alternatives rejected:** Vercel Pro cron (paid), Croncat (status unverified).

## R7. Price chart
- **Decision:** our own candles. DexScreener does not list new Ref simple pools (V: API returns no pairs for pools 8950–8993) and is not embeddable (`x-frame-options: SAMEORIGIN`).
- **Source:** not the coin contract, because it can't see the pool price. Instead, the **frontend server route** reads the pool's swap history from a public NEAR indexer API (Nearblocks/FastNEAR, U) and caches it. Fallback: a line chart from `get_pool` reserve snapshots, polled every 15s while the page is open, plus a snapshot written at each hourly harvest.
- **Rendering:** `lightweight-charts` (proposed dependency).

## R8. Wallet and frontend
- **Decision:** Next.js (create-near-app "Next.js (Classic)" template) + `@hot-labs/near-connect` + `near-api-js` (V that the docs quickstart uses near-connect; the exact versions are U, to be confirmed with `npm view` at scaffold time). Hosted on Vercel Hobby. Node 26 is available locally (docs require ≥22.22.2).

## R9. Testing
- **Decision:** contract unit tests (`cargo test`), plus near-workspaces-rs sandbox integration tests. The Ref exchange is imported from testnet via `import_contract`, then re-initialized (V, README). Frontend logic (clearing preview, tax preview) is shared as pure TS, with vitest unit tests.
- **Key fixture:** the A/B/C/D clearing example (SC-001).

## R10. Commit-reveal
- **Decision:** `commit = sha256("plunk:v1" ‖ box_id_u64_le ‖ len(account)_u32_le ‖ account ‖ max_price_u128_le ‖ salt[32])`, where `account` is the bidder (the signer's wallet) via `env::sha256_array`. The salt is generated client-side and travels only inside the R11 timelock ciphertext; users never see or keep it (user decision 2026-11-05).

## R11. Timelock reveal (user decision 2026-11-05)
- **Decision:** `tlock-js` 0.9.0 (approved in STATE.md) encrypts `max_price ‖ salt` to the drand **quicknet** round at `close_at` (round = ceil((close_at_s − genesis) / 3)). The ciphertext rides in the bid msg and is stored on the bid (≤ 1 KB; the launchpad covers the storage and frees it on reveal). After the round, any client decrypts and calls the permissionless `reveal`; the sha256 commit (R10) stays the only on-chain check.
- **Limit:** the contract can't verify a ciphertext, so junk ciphertext plus selective manual reveal is still possible. Resolved by the user 2026-11-05: an unrevealed sealed bid clears as a market bid (FR-009), so withholding gains nothing but the loss of one's own limit.

## Kill-test results (filled in by T005–T008)
Record each one as one line in exactly this form (verify.sh phase-0 reads it): `- **K1 result:** PASS|FAIL, then date, evidence (tx hash / log), and the fallback taken`.
- **K1 result:** PASS, 2026-11-06. 1 Solana USDC → 0.26613 wNEAR delivered by 1Click to `k1stub.plunk.near` via `intents.near → wrap.near ft_transfer_call → ft_on_transfer` (tx `FnxnN3LhHphRcoDsUt2yVZ2Ho76WWS9PPFsoJe4jJwG6`). Stub log: `K1 token=wrap.near sender=intents.near signer=intents.near amount=266132520459093749999999 msg={"box_id":"0","kind":"xchain","recipient":"plunk.near"}`; wNEAR balance confirmed. So `sender_id` is always `intents.near` and the bidder must be read from `msg.recipient`. No fallback: cross-chain bidding (FR-027) stays in. Run 1 bounced on near-sdk 5.30.0 (see IMPLEMENTATION.md).
- **K2 result:** PASS, 2026-11-06. Mainnet: 450-byte `tiny` wasm published by hash `FFjMkAkxVdCTduWvydeYR3FsaKexnSn2n3fVuVMCHTTa` from `plunk.near` (tx `F71gFjdt252z8QizQ3GRdcb9seojhb9JDn5TK4HE1VXh`); the publish is charged as a burnt transaction fee of 0.0451 NEAR (≈1e-4 NEAR/byte, not refundable storage). `k2.plunk.near` (0.1 NEAR) deployed via `use-global-hash` (tx `J3FaTEuBc6eduqBJ4pccSwoXFSeM6ymFKHSbwtZCeR48`), storage 214 bytes, `ping` logged `K2 ok` (tx `8pw5gFGHfW3SS6ZZj6E8c6HHhdQE7hese5hHfWNLUdsP`). Testnet half: see K2 testnet. No fallback: coins deploy by global hash (user chose the shared copy); the 215 KB coin publish (≈21.5 NEAR, burnt) happens once at T034.
- **K3 result:** PASS, 2026-11-06. Mainnet swap of 0.25 wNEAR → 0.931468 USDC through `aggregatedex.near` with `appFeeRate=10`, `appFeeRecipient=plunk.near` (tx `DpMUCmqciwnrBkxomJWq3d7s14UXxPxLYHLZq57Ksotn`, route wrap→USDT→USDC on v2.ref-finance.near). Events: `earn_app_fee` 0.0002 wNEAR to plunk.near + `earn_app_protocol_fee` 0.00005 to Rhea, so **appFeeRate is in basis points: 10 = 0.1%**, split 80/20; plus a separate Rhea `earn_protocol_fee` of 0.1% (0.00025 wNEAR) charged to the trader. Fee is held in the router: `query_user_exist_balance` shows 0.0002 wNEAR, withdrawn with `withdraw`. No fallback for the fee; routing to a brand-new Plunk simple pool is still unchecked until T034 (fallback: direct `v2.ref-finance.near` swap, no app fee).
- **K4 result:** PASS, 2026-11-03. `plunk_hello.wasm` built with rustc 1.97.1 (rustup, cargo-near 0.22.0 reports "protocol version 88; rustc 1.97.1 accepted") deployed to `hello.plunk.testnet` (tx `Du48UyLiZSDmHjwncKvPxVH7caQcrXEaDdkydMdAJ4BW`), `set_greeting` call ran and logged (tx `AcmJHDra8xgiu8394GN4Eu5y1jyk6V4CGNU6wriNPr4v`), view returned the stored value. No fallback; toolchain pinned in `rust-toolchain.toml`.
- **K2 testnet:** PASS, 2026-11-03. 84,213-byte wasm published by hash `5U4hwRZ93famWjR6YAoQkDjUvbPy5v7CJPLr9u4WVrc9` from `plunk.testnet`: required 8.42 NEAR balance (≈10× normal storage, 1e-4 NEAR/byte) — first attempt failed at 7.99 NEAR. `coin1.plunk.testnet` (0.1 NEAR) deployed via `use-global-hash` (tx `66TEJq2GmEE9nMdGzbkacQLXbMHoALBSTu7MSofkkeBs`), storage 214 bytes, view call works. Mainnet half pending (user-signed); the `K2 result` line is written after it.
