# App and keeper interfaces

## Web routes (Next.js)
| Route | State shown (FR) |
|---|---|
| `/` | Live strip of `next_to_open()` + box grid (FR-029) |
| `/make` | Make-a-box form with the live net-fee breakdown. The creation fee is shown before signing (FR-001/002) |
| `/box/[id]` | Closed / Reveal / Opening in the mascot-led layout. Open in the terminal layout: chart, swap panel, feed, claims, and the dev panel for the dev (FR-030/031) |
| `/api/candles?box=` | Server route that returns OHLC built from pool swap history. The fallback is reserve snapshots (research R7) |
| `/api/xchain/quote` | Server route that proxies 1Click `/v0/quote`, enforcing the 5-minute cutoff and an existing-NEAR-account check (FR-027) |

## Keeper (`keeper/harvest.ts`, GitHub Actions `17 * * * *` + manual)
Input: env `NEAR_NETWORK`, `KEEPER_ACCOUNT`, `KEEPER_KEY` (a function-call key restricted to `harvest`, from repo secrets, **never committed**). For every box in Open, it calls `harvest`, then logs the `harvested` events. Exit code 0 even when there's nothing to do.
