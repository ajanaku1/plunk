# Plunk

**Fair meme launches on NEAR.** You plunk NEAR into a sealed box. When the box shuts, everyone
who got in pays the same clearing price. Nobody sees a price until then, so there is nothing to
snipe, bundle or herd on. The dev's own coins sit in escrow, and selling them early pays the holders.

> meme.cooking made the price fair. Plunk makes the *information* fair and makes the dev's exit pay you.

Built at NEAR HACKATHON 2026. **Unaudited.** Testnet first; mainnet launch is a single signed deploy.

## The problem

On every launchpad, whoever sees or acts first wins. Devs bundle, snipers front-run the curve, and
buyers herd on visible deposits. Then the dev dumps on the holders. Plunk removes the information
edge with a sealed-bid box and removes the dump with a decaying dev tax.

## How a box works

1. **Make a box.** Name, ticker, a bidding room of 2–10 minutes, a minimum raise, a trading fee
   (0.5–3%), and a dev-tax window (1–7 days). The creation fee covers the coin's storage.
2. **Plunk in.** A **market bid** takes whatever the box clears at. Set a **max price** and the bid
   is **sealed**: the price and salt are timelock-encrypted on your device (drand quicknet) to the
   round at close. There is no reveal button, nothing to keep, nothing to come back for.
3. **Close and reveal.** When the room shuts, the page (or the keeper) decrypts every sealed bid
   and submits the reveals. A bid nobody can decrypt clears as a market bid.
4. **One price.** Clearing is uniform: market bids are always in, sealed bids join from the highest
   max price down, pro-rata at the margin. 500M coins go to bidders, 500M plus 99% of the raise
   become **locked liquidity** on Rhea (the launchpad holds the LP forever). 1% is the raise fee.
5. **Trade and earn.** Every trade pays the box's fee: 20% Rhea, 5% protocol, 75% the dev's share,
   which the dev can split toward holders and buybacks (one-way). An hourly harvest pays holders by
   their lowest balance during the hour. Coins bought this hour earn from the next.
6. **The dev got plunked.** Everything the dev won in their own box is escrowed. Withdrawing early
   is taxed 90% → 0% over the window, and the tax goes to holders as coins.
7. **Solana share (contract side shipped, bridge next).** The dev can set aside up to 50% of the LP half at creation; at Open it is held as the box's `mirror` leg instead of entering Rhea, ready to seed a Meteora pool on Solana (see `specs/001-plunk-launchpad/solana-mirror.md`). $PLUNK launches this way on mainnet.
8. **Bid from any chain.** On mainnet, a Solana, Ethereum or Bitcoin wallet can bid through
   NEAR Intents 1Click: a deposit address, a market bid, coins to the NEAR account you name.

## Do X, see Y (testnet, NEAR-only bidding)

Prerequisites: Node ≥ 22, pnpm, Rust 1.97 with `cargo-near` 0.22, `near` CLI 0.30, three testnet
accounts with faucet NEAR (a dev and two buyers). Wrap some NEAR to `wrap.testnet` for each buyer.

1. **Build and test the contracts.**
   `cargo test --workspace`. See: clearing, tax, escrow and epoch tests pass.
   `cargo test -p integration -- --ignored`. See: the sandbox runs create → bid → reveal → open →
   claim, and trades → harvest → claim against real copies of wNEAR and Rhea.
2. **Deploy a launchpad to testnet** (one time, see "Deploy your own" below) and put its account id
   in `app/config.ts`. See: `/` shows an empty grid.
3. **Run the app.** `pnpm --dir app install && pnpm --dir app dev`. See: the home page.
4. **Make a box** as the dev: 2-minute room, minimum 1 NEAR, fee 3%, tax window 1 day. See: the
   creation fee on the button before you sign; the box in the live strip.
5. **Bid** from buyer A with a max price and from buyer B at market. See: totals and bidder count
   update; no price appears anywhere.
6. **Wait for the room to shut** with the page open. See: the Reveal meter fills by itself, the
   page submits the reveals in one transaction, then "Open the box" appears.
7. **Open the box** (anyone). Nudge it along if it stops. See: the clearing price, each bid's fill
   or refund, the Rhea pool id, and claims.
8. **Buy** from the terminal panel. See: the trade in the live feed and the price chart move.
9. **As the dev, withdraw 10%** from escrow. See: about 90% goes to holders; "The dev got plunked"
   in the feed.
10. **After the hour turns**, run `pnpm --dir keeper harvest` (or press Harvest). See: a `harvested`
    event; then **Claim rewards** as buyer A. See: NEAR and coin rewards arrive.
11. **Failure path.** Make a box with minimum 5 NEAR and bid 1 NEAR. See: Failed, and the refund
    claim returns 100%.

## Deploy your own (testnet)

The coin is a **global contract** deployed by hash, so every box's coin shares one copy.
Publishing the coin burns about 1e-4 NEAR per byte (≈21 NEAR for the 215 KB wasm); the launchpad
itself needs about 3 NEAR of storage. `scripts/deploy.sh` runs the steps with your keychain:

```sh
NET=testnet ACCOUNT=plunk.testnet bash scripts/deploy.sh build     # both wasm files
NET=testnet ACCOUNT=plunk.testnet bash scripts/deploy.sh publish   # coin by hash (burns the publish fee)
NET=testnet ACCOUNT=plunk.testnet bash scripts/deploy.sh deploy    # launchpad + init (owner, hash, Rhea, wNEAR, fee)
NET=testnet ACCOUNT=plunk.testnet bash scripts/deploy.sh register  # wNEAR must know the launchpad and the exchange
NET=testnet ACCOUNT=plunk.testnet bash scripts/deploy.sh config    # prints get_config; then set app/config.ts
```

The hourly keeper is `.github/workflows/harvest.yml`: set repo variables `NEAR_NETWORK` and
`LAUNCHPAD_ID`, and secrets `KEEPER_ACCOUNT` and `KEEPER_KEY` (a function-call access key
restricted to `harvest`). Keys never live in this repo.

## NEAR technology used

- **NEAR Intents 1Click** for cross-chain bids: a quote with `customRecipientMsg` delivers wNEAR
  to the launchpad by `ft_transfer_call`, so a Solana deposit becomes a market bid (kill test K1
  passed on mainnet, see `specs/001-plunk-launchpad/research.md`).
- **Global contracts**: every coin is deployed from one published hash (`use_global_contract`).
- **NEP-141 / NEP-145 / NEP-148** coins with an epoch hook on every balance change, NEP-297 events.
- **Rhea (Ref v2)** simple pools; the launchpad holds 100% of the LP and harvests fees as sqrt(k)
  growth per share, so principal is never touched.
- **drand quicknet timelock** (tlock-js) for sealed bids, with a sha256 commit as the only
  on-chain check; the contract never sees a price before Reveal.
- **Function-call access keys** for the keeper, **near-api-js 7** and **@hot-labs/near-connect**
  in the app.

## Repository

| Path | What |
|---|---|
| `contracts/launchpad` | Boxes, bids, reveal, clearing, open, claims, escrow and dev tax, hourly harvest |
| `contracts/coin` | The global coin: NEP-141 with hourly lowest-balance rewards and burn |
| `contracts/math` | Overflow-free u128 helpers (mul_div, 256-bit isqrt) |
| `contracts/integration` | Sandbox tests against imported wNEAR and Rhea |
| `contracts/fixtures` | Clearing and tax vectors shared by Rust and TypeScript |
| `app` | Next.js app: home, make-a-box, box page (bid, reveal, open, terminal, dev panel), API routes |
| `keeper` | The hourly harvest runner |
| `brand` | Brand truth, the Peek mark, UI research and the chosen direction prototype |
| `verify.sh` | The done predicates, per phase |

## Status and limits

- The launchpad runs on testnet at `plunk.testnet` (coin published as a global contract from the same
  account). The sandbox suite is the proof for the money paths; mainnet is deferred to after the hackathon.
- In-app trades on testnet are direct pool swaps. The 0.1% Plunk app fee through the Rhea router
  (`aggregatedex.near`) is mainnet-only and arrives with the mainnet launch.
- The price chart is built from hourly reserve snapshots the contract records at each harvest, plus a
  live tail polled from the pool. Swap-level history from an indexer is a later improvement.
- The public bid list before Reveal shows only totals by design (FR-005).
- **Unaudited.** Do not put in more than you can lose.

## Disclosures

- **Design origin:** Plunk is the NEAR build of **Darkroom**, the author's earlier sealed-box
  launchpad design for Solana. Design only was reused (the dev-tax curve, room length, fee caps);
  no code was carried over.
- No other project by this author is entered in NEAR HACKATHON 2026.

## License

MIT, see `LICENSE`.
