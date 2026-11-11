---

description: "Task list for Plunk Launchpad"
---

# Tasks: Plunk Launchpad

**Input**: Design documents from `/specs/001-plunk-launchpad/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: included. The spec's success criteria (SC-001, 003, 004, 005, 009) are exact-math claims, so the money paths are test-first (write the test, watch it fail, implement).

**Organization**: grouped by user story. FR and research references give traceability (competition evidence → design.md → FR → plan → task → verify.sh).

## Format: `[ID] [P?] [Story] Description`
- **[P]**: can run in parallel (different files, no dependencies)
- Gates: **K1–K4** are the day-1 kill tests from the plan's risk register

---

## Phase 1: Setup and day-1 kill tests (target 2026-11-03)

- [x] T001 Create the Cargo workspace `Cargo.toml` with members `contracts/launchpad`, `contracts/coin`, `contracts/integration`, `stub`, and add near-sdk 5.30.0 (plan)
- [x] T002 [P] Scaffold `app/` from the create-near-app "Next.js (Classic)" template, and add @hot-labs/near-connect, near-api-js, lightweight-charts and vitest at the versions confirmed with `npm view` (R8)
- [x] T003 [P] Create the `keeper/` package with near-api-js, plus `.github/workflows/harvest.yml` (cron `17 * * * *` + workflow_dispatch; secrets only) (R6)
- [x] T004 [P] Root `.gitignore` covers `design.md`, `Goal.md`, `prompt.md`, `plan.md`, `.env*`, `target/`, `node_modules/`; add `LICENSE` (MIT) (FR-032)
- [x] T005 **K4**: build a hello contract with rustc 1.97.1 via `cargo near build non-reproducible-wasm` and deploy it to a testnet dev account. If the VM rejects it, pin rustup 1.95 and record that in IMPLEMENTATION.md (R1)
- [x] T006 [P] **K1**: `stub/src/lib.rs` NEP-141 receiver that logs `sender_id`, `predecessor`, `msg` and returns `"0"`. The user deploys it to mainnet and runs a $1 Solana USDC 1Click quote with `customRecipientMsg`. Record the result in research.md R5. **Decides the Nov 8 cut** (FR-027)
- [x] T007 [P] **K2**: publish a tiny contract as a global contract (by hash) on testnet, then mainnet (user-signed), and instantiate it from a sub-account. Record the measured costs (R2, FR-002)
- [x] T008 [P] **K3**: on mainnet, run a tiny router swap through `aggregatedex.near` with `appFeeRate`, to settle its units and check routing to a simple pool. Record the result in R4 (FR-020)

**Checkpoint**: kill-test results are recorded, and fallbacks are chosen where tests failed.

---

## Phase 2: Foundational (blocks all stories)

- [x] T009 [P] Test `contracts/launchpad/src/clearing.rs`: the worked example (C, A, B, D) gives price 0.4 per 1M, A and C 250M each, B and D refunded; also all-market, tie pro-rata, and the 200-bid cap (SC-001, FR-008)
- [x] T010 Implement `contracts/launchpad/src/clearing.rs` as a pure function (FR-008)
- [x] T011 [P] Test `contracts/coin/src/epochs.rs`: an in-hour buyer earns 0 (SC-009); lowest balance on a partial sell; rollover below the minimum and at zero eligible supply; settlement across skipped epochs (FR-018)
- [x] T012 Implement `contracts/coin/src/epochs.rs` and `contracts/coin/src/lib.rs` (wrapped FungibleToken with a hook on every balance change; `distribute`, `claim`, `burn`, excluded set) (data-model, contracts/coin.md)
- [x] T013 [P] Mirror the clearing and tax math in `app/lib/math.ts`, with vitest fixtures shared with T009 and T019 (plan)
- [x] T014 `contracts/launchpad/src/lib.rs` Config + Box storage + `create_box` with range validation and the creation fee. Config defaults: `min_raise_floor` 1 NEAR, `min_distributable` 0.01 NEAR for the NEAR pot and 1 whole coin for the coin pot (both owner-settable) (FR-001, FR-002, FR-003, FR-010, FR-018)
- [x] T015 `contracts/launchpad/src/ref_ext.rs` cross-contract interfaces for Ref (`storage_deposit`, `register_tokens`, `add_simple_pool`, `ft_transfer_call` deposit, `add_liquidity`, `get_pool`, `remove_liquidity`, `withdraw`, swap msg) (R3)

**Checkpoint**: clearing and epoch math are green, and a box can be created.

---

## Phase 3: User Story 1, sealed box and fair fill (P1) 🎯 MVP

**Goal**: bid sealed, reveal, open at one price, refund the rest. **Independent test**: quickstart steps 5–7 and 11.

- [x] T016 [US1] Integration test `contracts/integration/tests/box_flow.rs`: create → 2 sealed + 1 market bid → reveal → open → claim. Also the failed-box refund at 100% and an unrevealed sealed bid clearing as market (SC-004, FR-009), the 1% raise fee (SC-005), and that public views expose no prices before Reveal (SC-002)
- [x] T017 [US1] `ft_on_transfer` that never rejects (sealed / market / xchain / late → LateDeposit) and a permissionless `reveal` with the R10 commit scheme + stored R11 ciphertext (FR-004, FR-005, FR-006, FR-007, FR-028)
- [x] T018 [US1] `open` / `retry_open` (open allowed at `close_at` when there are no sealed bids, FR-007): clearing → 1% fee → coin via `use_global_contract` (or the K2 fallback) → Ref pool + locked LP; the Failed path; 24h stuck-in-Opening → Failed (FR-008, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015)
- [x] T019 [US1] `claim_bid`, `claim_late`, and the views `get_box`, `get_public_totals`, `get_bids`, `next_to_open` (FR-009, FR-028, contracts/launchpad.md)
- [x] T020 [P] [US1] `app/app/box/[id]` Closed / Reveal / Opening in the mascot-led layout: market bid as the default, with an opt-in max price that makes it a sealed bid (salt generated and timelock-encrypted per R11, never shown to the user; no reveal button; auto-reveal of every decryptable bid at close), countdown, public totals, auto-reveal (FR-030, SC-008)
- [x] T021 [P] [US1] `app/app/make` form with the live net-fee breakdown (Rhea 20 / protocol 5 / dev 75), optional split, and the creation fee before signing (FR-001, FR-002, FR-021)

**Checkpoint**: MVP. A box runs end to end on testnet with NEAR-only bids.

---

## Phase 4: User Story 2, dev escrow and dev tax (P1)

**Goal**: "the dev got plunked". **Independent test**: quickstart step 9.

- [x] T022 [P] [US2] Test `contracts/launchpad/src/escrow.rs`: W×t with the holder side rounded up, rates at 0h and 12h of 24h (90%, 45%), extend rejected mid-window and allowed after (restarts at 90%), the treasury per-deposit 7-day curve (SC-003, FR-023, FR-024, FR-025)
- [x] T023 [US2] Implement `escrow.rs`: `dev_withdraw` (taxed coins → coin `distribute` pot), `dev_extend`, `shift_split` (one-way), `treasury_withdraw`, `preview_withdraw`, `dev_plunked` event (FR-019, FR-022, FR-023, FR-024, FR-025, FR-026)
- [x] T024 [US2] Dev panel in `app/components/box/DevPanel.tsx`: escrow, tax meter, withdraw slider with preview, Extend (disabled while running), "Give more to holders", Harvest (FR-031)

---

## Phase 5: User Story 3, trade and earn (P2)

**Goal**: terminal view and hourly holder rewards. **Independent test**: quickstart steps 8 and 10.

- [x] T025 [P] [US3] Integration test `contracts/integration/tests/harvest.rs`: swaps → harvest → the 20/5/75 split by sqrt(k) growth; coin fees cover the buyback first; a second harvest in the same epoch is a no-op; claim pays NEAR + coins (FR-016, FR-017, FR-018)
- [x] T026 [US3] Implement `contracts/launchpad/src/harvest.rs` (view pool → remove `shares×(1−1/g)` → withdraw → net first → burn / keep / holders / protocol / dev) (R3, data-model)
- [x] T027 [P] [US3] `keeper/harvest.ts`: lists Open boxes and calls `harvest` with the function-call key from env; exits 0 when there's nothing to do (contracts/app.md)
- [x] T028 [P] [US3] `app/app/api/candles/route.ts`: OHLC from the indexer swap history, with the reserve-snapshot fallback (K5, R7)
- [x] T029 [US3] Terminal layout `app/components/terminal/*`: chart, swap panel (router with the 0.1% app fee, or a direct pool swap per K3), trades feed with dev-tax events, claims (FR-020, FR-030)

---

## Phase 6: User Story 4, cross-chain bid (P3). **Skip the whole phase if K1 fails (cut 2026-11-08)**

- [x] T030 [US4] `app/app/api/xchain/quote/route.ts`: 1Click quote proxy with an existing-NEAR-account check and the 5-minute cutoff (FR-027)
- [x] T031 [US4] "Bid from any chain" panel: chain/asset picker, deposit address, status polling (`/v0/status`), late-credit claim (FR-027, FR-028)

---

## Phase 7: User Story 5, live strip (P3)

- [x] T032 [US5] Home `app/app/page.tsx`: live strip for `next_to_open()` with the reveal animation, plus the box grid (FR-029)

---

## Phase 8: Polish and submission

- [x] T033 README: problem, "do X, see Y" (quickstart), NEAR tech used (Intents 1Click, global contracts, NEP-141, function-call keys), "unaudited", Darkroom design-origin disclosure, other-project disclosure if any; a dry run by a fresh reader finishes in <15 min (FR-032, SC-006, Q-015)
- [ ] T037 **User action:** create a function-call access key on the keeper account restricted to `plunk.near` method `harvest`, and store it as GitHub repo secrets `KEEPER_ACCOUNT` / `KEEPER_KEY` (never in files) (R6, contracts/app.md)
- [ ] T034 Mainnet deploy of `plunk.near` (**user signs**) and launch of the $PLUNK box (3% fee; net split 1 / 1 / 0.4 with 0.15 burn) (Assumptions)
- [ ] T035 Record the <2 min demo along the six-step path; draft the X post with @NEARProtocol #NEARHackathon + video (SC-007, R§1)
- [ ] T036 Submission payload printed for the user's confirmation; submit once after the repo is public and the post is live (R§1)

---

## Dependencies
- Phase 1 → Phase 2 → **US1 (MVP)** → US2 and US3 (can run in parallel after US1; US3's harvest needs the coin from T012) → US4 (only if K1 passes) → US5 → Polish.
- **Cut order if late:** US4 → candles fallback (T028) → US5 strip becomes a static card → never US1 or US2.

## Parallel examples
- Phase 1: T002, T003, T004, T006, T007, T008 together.
- Phase 2: T009 + T011 + T013 (tests and the TS mirror) before T010 / T012.
- US1: T020 + T021 (app) while T017–T019 (contract) proceed.

## Implementation strategy
MVP = Phases 1–3 by **2026-11-07**. Then US2 by Nov 9, US3 by Nov 11, US4 (if K1 passed) or buffer by Nov 12, US5 + polish by Nov 13, submit Nov 14 with a margin. Commits stay ≤200 changed lines (CLAUDE.md).
