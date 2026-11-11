# Launchpad UI research (2026-11-06)

Studied live, at desktop width: bonk.fun (home + token page), four.meme (home, token page,
create page), Zora (feed + coin page), Jupiter Studio (create wizard), Virtuals (capital market
home), GMGN (trenches terminal). pump.fun sits behind a Cloudflare human check and was not
bypassed; its anatomy is well known and matches bonk.fun's (bonk.fun is a pump.fun fork).
Believe and bags.fm were down at the time.

## What every serious launchpad shares

1. **App shell.** Top bar: logo left, 2–4 nav items, search in the middle, a solid-accent
   "Connect Wallet" top-right, theme/lang. four.meme and GMGN add a left icon rail. Dark near-black
   is the default everywhere except Zora (white). One accent colour per product (orange, lime,
   green). Numbers and addresses are monospaced. Green/red only for deltas.
2. **Discovery page.** A "hot / live" strip of 4 cards with a progress bar each, then filter and
   sort chips (Last trade · Creation time · Heating up · Watchlist; All · Graduated), a search box,
   and a grid or table of tokens: image, name/ticker, creator, market cap, progress %, status badge.
   Virtuals shows four ranked columns (Trending, Just graduated, Gainers, Live trades) and a dense
   table with sparklines, 24h range, liquidity, age, holders.
3. **Token page = two columns.**
   - Left, in order: identity row (avatar, name / pair, CA with copy, creator, price + 24h change,
     stat pills FDV · Liquidity · Volume · Created), a full-width TradingView chart, then tabs
     (Coin info · Activity · Bubblemap · Top holders; Zora: Activity · Holders · Traders · Details).
   - Right, sticky: a trade card. Progress bar with current vs target, Buy / Sell segmented
     control, amount input with the currency on the right, quick amounts (0.1 / 0.5 / 1 or $2 /
     $20 / $50 / $100), slippage, "You receive" estimate, one primary CTA (reads "Connect Wallet"
     when logged out), MEV / anti-sniper toggle. Below it: holder list with percentages and a
     rules / fees block.
   - A full-width status banner for lifecycle changes ("This token has migrated").
4. **Create page.** Numbered sections in two columns (01 Identity: image drop, name, ticker,
   description · 02 Socials · 03 Classification · Launch settings toggles) or a 3-step wizard
   (Basics → Enhance → Share). A mode switch (Classic / Open, Meme / Custom) and the fee and vesting
   terms shown before the form.
5. **Trust surface.** Contract address, creator address, fee table (curve fee vs post-migration
   fee), supply, created-at, holder distribution, bubble map, graduation state. All copyable.
6. **Density and restraint.** Cards are 1px borders on a slightly lighter surface, 10–14px radius,
   12–14px body text, no illustration inside the trading area. Mascots live in the logo only.

## What Plunk changes, and why

Plunk is not a bonding curve, so the same anatomy carries different content:

| Launchpad element | Plunk equivalent |
|---|---|
| Curve progress (current / target market cap) | Raise progress (in the box / minimum) + countdown to close |
| Price chart during the curve | No price exists before Reveal (FR-005). Show the box activity chart: total in and bidders over time. After Open, a real price chart from the Rhea pool (lightweight-charts). |
| Buy / Sell | Bidding: Market / Max price segmented control. Open: Buy / Sell through Rhea with both fees shown (0.1% Plunk + 0.1% Rhea). |
| "You receive" estimate | Bidding: share of the 500M at today's totals, labelled as an estimate. Open: exact. |
| Graduation banner | Phase banner: Bidding · Reveal · Opening (step n/4) · Open · Failed |
| Holders tab | Bids tab (anonymous totals pre-reveal), Holders after Open, Details (fees 20/5/75, LP locked, dev tax, contract ids) |
| Slippage / MEV toggle | Dev-tax meter (decays 90% → 0 over 24h) once Open |

Mascot: the Peek box appears at avatar size in the identity row and in the phase banner, where
its state animation tells the phase. Never as a hero.

## Sources
- https://letsbonk.fun (home, /token/…)
- https://four.meme (home, token page, /create-token)
- https://zora.co (feed, coin page)
- https://jup.ag/studio
- https://app.virtuals.io
- https://gmgn.ai/?chain=sol
- Background reading: https://coinbureau.com/analysis/best-memecoin-launchpads ,
  https://www.quicknode.com/builders-guide/best/top-10-memecoin-launchpads ,
  https://cryptoslate.com/launchpads/meme-coin-platforms/
