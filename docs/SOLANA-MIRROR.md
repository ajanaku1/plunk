# Solana mirror: handover

The feature lets a coin launched on Plunk trade on Solana too, so a launch taps Solana liquidity. In
the code it is called the **Solana mirror** (contract) or the **Solana share** (UI). You won't find
"copy token" anywhere in the repo.

The full design and the decisions behind it are in
[`specs/001-plunk-launchpad/solana-mirror.md`](../specs/001-plunk-launchpad/solana-mirror.md). This
file covers what is built, where it lives, and what is left.

## How it works

1. **Create.** The dev picks a Solana share `s` of the LP half, from 0 to 50%. The make form
   defaults to 30%. The contract defaults to 0 when the field is omitted, so old boxes and callers
   behave the same.
2. **Open.** Clearing doesn't change. Only the pool seeding splits:
   - Rhea (NEAR) gets `(1 − s)` of the 500M LP coins and `(1 − s)` of the net raise (raise minus the 1% fee).
   - The box holds `s` of each as `mirror: { coins, wnear, sent: false }`.
   - The bidders' 500M half is untouched.
3. **Send (not built).** The coins go over Omni Bridge, which mints the SPL copy on Solana. The
   wNEAR goes to Solana USDC through NEAR Intents 1Click. Both are delivered to the launchpad's
   Solana vault.
4. **Solana pool (not built).** A keeper holding the vault key creates a Meteora DAMM v2 pool (coin /
   USDC), then permanently locks the position. Fees still accrue to the locked position.
5. **Fees back home (not built).** A daily keeper job claims the USDC fees, converts them to wNEAR
   through Intents, and sends them into the box with `ft_transfer_call` as fee income. The normal
   hourly harvest then applies the usual split. This step needs a keeper because a NEAR contract
   can't read or pull fees from a Solana LP.

Example with `s` = 30% and a 200 NEAR raise: Rhea gets 138.6 wNEAR and 350M coins, and the box holds
59.4 wNEAR and 150M coins.

## Decisions already made (do not reopen without the owner)

| # | Topic | Decision |
|---|---|---|
| D1 | Bridge | Omni Bridge |
| D2 | Solana DEX | Meteora DAMM v2, permanent-lock position, collect-fee mode OnlyB (fees in USDC only), USDC quote |
| D3 | Share | 0–50% per box; form default 30%; contract default 0; $PLUNK launches at 30% |
| D4 | Vault key | keeper keypair in GitHub secrets, same policy as `KEEPER_KEY`; owner funds it with SOL |
| D5 | Sweep | daily keeper job |
| D6 | Testing | Omni Bridge and 1Click are mainnet-only. Sandbox tests stop at "right `ft_transfer_call` msg sent"; the real leg is proven on mainnet with tiny, owner-signed amounts |
| D8 | Dependencies | approved for **keeper only**: `@solana/web3.js`, `@solana/spl-token`, `@meteora-ag/cp-amm-sdk`. Not installed yet. Contracts need no new crates |

## Status by phase

| Phase | Scope | Status |
|---|---|---|
| A | Contract holds the share back at Open | **Done.** Tested and live on `plunk.testnet` |
| B | `send_mirror(box_id)`: coins to Omni Bridge, wNEAR to Intents | Not started |
| C | Solana keeper: pool create, lock, daily fee claim and sweep | Not started |
| D | App and docs | Slider and README line done; mirror panel on the box page not started |

## Where the code is (phase A)

**Contract (`contracts/launchpad/src/`)**
- `types.rs`
  - `SOLANA_SHARE_BPS = (0, 5000)` is the allowed range.
  - `BoxArgs.solana_share_bps: Option<u16>` is the create input (serde default).
  - `LaunchBox.solana_share_bps` and `LaunchBox.mirror: Option<Mirror>` hold the state.
  - `struct Mirror { coins, wnear, sent }`.
  - `validate()` rejects values over 5000 with `"solana share must be 0-5000 bps"`.
- `lib.rs` `create_box`: `a.solana_share_bps.unwrap_or(0)`, and `mirror: None`.
- `open.rs`
  - `mirror_part(total, bps)` rounds down, so the remainder goes to Rhea.
  - `LaunchBox::rhea_seed()` is the Rhea amount (LP half minus mirror). The deposit, add_liquidity,
    per_share and fail_stuck paths all use it.
  - `open()` sets `mirror` when the share is above 0.
- `migrate.rs`: a one-time state upgrade that adds `solana_share_bps = 0` and `mirror = None` to
  stored boxes. It has already been run on testnet (see below). It must not run again on a contract
  whose boxes already have the new fields.

**Tests**
- `contracts/launchpad/tests/mirror.rs` has 7 unit tests: stored, default 0, over 50% rejected,
  50% allowed, 30% split at open, 0% leaves the seed whole, and rounding toward Rhea.
- `contracts/integration/tests/mirror.rs` is a sandbox test with real wNEAR and Rhea. A 30% box seeds
  Rhea with 70%, the launchpad still owns 100% of the LP, and the held wNEAR sits in the launchpad's
  wNEAR balance.
- Run them with `cargo test --workspace` and `cargo test -p integration -- --ignored`.

**App**
- `app/components/make/MakeForm.tsx`: the slider (0–50, step 5, default 30) and its validation,
  which matches the contract.
- `app/lib/launchpad.ts`: the `Mirror` type, `solana_share_bps` on box and args, and the `SOLANA_SHARE_BPS` range.

**Live on testnet (`plunk.testnet`)**
- Upgrade tx `7yo3CvUrvdPFmcdJnCau3BpGmBh3FiUZF5h6x5rZXwcg`, wasm sha256 `aae17c69…a5fe8`.
- Box #0 has `solana_share_bps: 0` and `mirror: null`. It predates the feature and was migrated.
- Box #1 ($PEEK) was opened with a 30% share: `mirror: { coins: 150M, wnear: 0.297 NEAR, sent: false }`.
- Check one yourself: `near contract call-function as-read-only plunk.testnet get_box json-args '{"id":1}' network-config testnet now`

## What's next

**Phase B: `send_mirror(box_id)` (contract)**
- Allowed only on an Open box whose `mirror` is set and `sent == false`. Set `sent = true` only after
  both legs succeed.
- Coins leg: `ft_transfer_call` the mirror coins to the Omni Bridge locker, with the recipient set to
  the Solana vault. Each coin also needs a one-time metadata registration so the SPL token exists.
- wNEAR leg: `ft_transfer_call` the mirror wNEAR into NEAR Intents 1Click for USDC to the vault. This
  is the reverse of the K1 path, which already passed on mainnet (see `research.md`).
- Sandbox tests assert the exact msgs (D6). After that, one tiny mainnet dry run, signed by the owner.

**Phase C: Solana keeper (`keeper/`)**
- Next to `harvest.ts`, add a job that creates the DAMM v2 pool (USDC quote, OnlyB), calls
  `permanent_lock_position`, and runs a daily claim, then Intents to wNEAR, then `ft_transfer_call`
  into the box as fee income.
- Add a GitHub Actions workflow next to `.github/workflows/harvest.yml`.

**Phase D: app**
- Add a mirror panel on the box page (held amounts, sent or not, the Solana pool link once it exists)
  and update the README and in-app docs (`app/app/docs/page.tsx`).

## Open questions (ask the owner first; do not guess)

- **Bridge and Intents details.** The Omni Bridge locker account, its `ft_transfer_call` msg format,
  token registration, and the 1Click deposit flow for the reverse direction all need to be checked
  against the current docs. None of it is in the repo yet.
- **Vault.** The Solana vault address. The keypair must never be committed.
- **Who can call `send_mirror`.** Permissionless like `harvest`, or owner-only?
- **Failure path.** What happens to held mirror funds if a leg fails, or if a box never sends? There
  is no recovery method yet.
- **Estimate.** The spec estimates 4–6 working days for B–D, with $PLUNK on mainnet as the first live user.

## Ground rules for this repo

- Never commit keys (the NEAR keeper key, the Solana vault key). They go in GitHub secrets.
- Don't add dependencies beyond the approved list above without asking.
- Don't edit or delete a test to make it pass.
- The contract is unaudited, and mainnet deploys are signed by the owner.
