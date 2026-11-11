# Feature Specification: Plunk Launchpad

**Feature Branch**: `001-plunk-launchpad`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Plunk — memecoin launchpad on NEAR for NEAR HACKATHON. Approved experience design in `design.md`; competition evidence in `loop/memory/near-hackathon-2026-launchpad-ideation-report.md`."

Traceability: each requirement cites its design section as `[D§n]` (`design.md`) or competition evidence as `[R§n]` (ideation report).

## Clarifications

### Session 2026-11-02

- Q: Platform minimum-raise floor? → A: 1 NEAR, a protocol setting that can be raised later.
- Q: When a dev pays the dev tax, do holders receive the taxed coins, NEAR, or a burn? → A: Coins, shared pro-rata and claimable. The feed shows the NEAR value.
- Q: How are reward snipers stopped? → A: Harvest and distribute hourly. If an hour's batch is below the minimum distributable amount, it rolls over to the next hour. Coins bought during an hour earn only from the next hour. A wallet earns on its lowest balance during the hour. The same hourly rule applies to dev-tax coins.
- Q: What happens to late cross-chain deposits, and how early do quotes stop? → A: They are never rejected; they are credited as claimable wNEAR refunds to the named NEAR account. Quotes stop 5 minutes before close.
- Q: Rhea pool fees are immutable. What replaces "lower fee"? → A: The fee is fixed for life. The dev can move part of their own share to holders or buyback, one-way only.
- Q: Where do a cross-chain bidder's coins go? → A: Cross-chain bidding requires an existing NEAR account to receive coins. Funds come from another chain; unfilled amounts are refunded to the origin chain.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bid in a sealed box and get a fair fill (Priority: P1)

A buyer finds a box that is still closed. They place a bid without anyone, the dev included, seeing their price. When the box opens they get their tokens at the same single price as everyone else, or a full refund.

**Why this priority**: This is the product. Without the sealed box and the single clearing price, Plunk is just another launchpad.

**Independent Test**: Create a box, place sealed and market bids from several wallets, run reveal and open, then check fills, price and refunds against the clearing rule.

**Acceptance Scenarios**:

1. **Given** a closed box, **When** a NEAR-wallet buyer submits a budget and a hidden max price, **Then** the box shows only the updated total NEAR in, the bidder count and the time left. No individual price is visible to anyone.
2. **Given** the bids C market 100, A 100 @ 0.4, B 200 @ 0.3 and D 50 @ 0.1 (price in NEAR per 1M tokens, 500M tokens for bidders), **When** the box opens, **Then** the clearing price is 0.4, A and C each receive 250M tokens, and B and D are refunded in full.
3. **Given** a sealed bid that was never revealed, **When** the box opens, **Then** that bid is cleared as a market bid (no price limit) at the clearing price.
4. **Given** a box whose accepted NEAR is below its minimum raise, **When** reveal ends, **Then** the box is marked Failed, every bidder can reclaim 100% of their bid, and no coin is tradable.

---

### User Story 2 - Dev launches a box and exits only through the dev tax (Priority: P1)

A dev creates a box with their own room length, minimum raise, trading fee and tax window. Anything the dev wins is held in escrow. The dev can withdraw any part of it, and the current tax on that part goes to holders. Once a window ends, the dev can choose to start a fresh one.

**Why this priority**: The dev tax is the second half of the pitch ("the dev got plunked"). It is what judges score as the mechanic.

**Independent Test**: Create a box as the dev, win a fill, then withdraw part of the escrow at a known time and confirm the dev and holder amounts. Try extending during and after the window.

**Acceptance Scenarios**:

1. **Given** a dev escrow with a 24h window that opened 0h ago, **When** the dev withdraws W tokens, **Then** holders receive W×0.90 and the dev receives W×0.10.
2. **Given** the same escrow 12h in, **When** the dev withdraws W, **Then** the tax applied is 45%.
3. **Given** a window still running, **When** the dev tries to extend, **Then** the request is rejected. **Given** the window has ended, **When** the dev extends by 24h–7d, **Then** the tax restarts at 90% and falls linearly to 0 over the new window.
4. **Given** a dev withdrawal, **When** any visitor views the box, **Then** the trades feed shows the event (e.g. "the dev got plunked 41 NEAR") plus the escrow remaining and the current tax rate.

---

### User Story 3 - Trade an open coin and earn NEAR as a holder (Priority: P2)

Once a box is open, a trader sees a terminal view with a chart, a buy/sell panel and a live trades feed. Holders accrue NEAR from the coin's fees and claim it whenever they like.

**Why this priority**: It closes the loop. After launch, holders are actually paid, and trading is visible.

**Independent Test**: On an open box, execute in-app buys and sells, harvest fees, then confirm the fee split and a holder's claimable NEAR.

**Acceptance Scenarios**:

1. **Given** an open box with a 3% fee, **When** fees are harvested, **Then** they are divided 20% to the DEX, 5% to the protocol and 75% to the dev's chosen split.
2. **Given** harvested fees that include coin tokens from sells, **When** the split is paid, **Then** the coin tokens first cover the buyback share, and only any remainder is swapped.
3. **Given** a holder with accrued NEAR, **When** they press Claim, **Then** they receive their accrued NEAR and their claimable balance becomes 0.
4. **Given** a wallet that bought during hour H, **When** hour H's distribution runs, **Then** that purchase earns nothing; it starts earning from hour H+1.
5. **Given** an hour whose harvested amount is below the minimum distributable amount, **When** the hour ends, **Then** nothing is paid out and the amount is carried into the next hour's distribution.
6. **Given** a trade made inside the Plunk app, **When** it executes, **Then** the panel showed the coin's trading fee and the 0.1% app fee before the trader confirmed.

---

### User Story 4 - Bid from another chain (Priority: P3)

A buyer holding USDC on Solana (or another supported chain) bids in a closed box by paying from that chain. They must name an existing NEAR account to receive the coins. Their bid is a market bid, filled at the clearing price.

**Why this priority**: It's the strongest NEAR-native demo moment, but it is cut if the day-1 kill test fails by 2026-11-08 [R§1, D§0].

**Independent Test**: Request a quote for a closed box, send a tiny mainnet deposit, and confirm the bid appears in the box totals and is filled or refunded at Open.

**Acceptance Scenarios**:

1. **Given** a box closing in more than 5 minutes, **When** a buyer requests a cross-chain bid, **Then** they must enter an existing NEAR account (validated as existing) before getting a deposit address, and the bid counts toward the box once the deposit lands. Coins are delivered to that NEAR account.
2. **Given** a box closing in 5 minutes or less, **When** a buyer requests a cross-chain bid, **Then** no quote is offered.
3. **Given** a cross-chain deposit that arrives after close, **When** it reaches the box, **Then** it is accepted and credited as a claimable wNEAR refund to the buyer's named NEAR account.

---

### User Story 5 - Discover what's opening next (Priority: P3)

A visitor on the home page sees a live strip featuring the next box to open (countdown, bidder count, NEAR in, reveal animation when it opens) and a grid of all boxes.

**Why this priority**: Spectacle and discovery. Useful for the demo and X clips, but not core to correctness.

**Independent Test**: Create several boxes with different close times and confirm the strip features the soonest-closing one and plays the reveal when it opens.

**Acceptance Scenarios**:

1. **Given** several closed boxes, **When** a visitor opens the home page, **Then** the strip features the box with the soonest close time.
2. **Given** the featured box opens, **When** a visitor is watching, **Then** the reveal animation plays and the strip moves on to the next box.

---

### Edge Cases

- Ties at the clearing price: bids whose max price equals the final price are filled pro-rata [D§4].
- Pool creation fails during Opening: the box stays in Opening with Retry, and funds remain held [D§4].
- A sealed bid cannot be cancelled once submitted [D§4].
- A dev bids in their own box: same price, no head start, and the fill goes to escrow [D§3].
- Treasury tokens (kept buyback) deposited after the dev's window ended: each deposit carries its own 7-day 90%→0 curve [D§3].
- The dev tries to change the trading fee after launch: not possible (fixed for life). The dev tries to take a larger share of their split: rejected. Moving more of it to holders or buyback is allowed [D§2].
- Market bids only, no sealed bids: price = total market NEAR ÷ 500M [D§4].
- Holder rewards must never pay the pool or Plunk's own accounts [D§2].
- Coins held inside the DEX (users' exchange deposits and the pool itself) are held by an excluded account, so they earn no holder rewards.
- A holder sells part of their coins mid-hour: that hour pays on the lowest balance held.
- A cross-chain bidder names a NEAR account that doesn't exist: the form refuses before quoting.

## Requirements *(mandatory)*

### Functional Requirements

**Boxes and bidding**
- **FR-001**: Devs MUST be able to create a box with name, ticker, image, description, room length (2–10 min), minimum raise, trading fee (0.5–3% gross), optional fee split, and dev-tax window (24h–7d). [D§5, D§2, D§3]
- **FR-002**: Creating a box MUST charge a creation fee equal to the token's storage cost, shown to the dev before they sign. It is not refunded. [D§2]
- **FR-003**: Each coin MUST have a fixed supply of 1,000,000,000: 50% for bidders and 50% for the liquidity pool. [D§2]
- **FR-004**: NEAR-wallet buyers MUST be able to place sealed bids (budget + hidden max price) and market bids (budget only) while a box is Closed. The bid panel MUST default to a market bid (no max price). Setting a max price is an opt-in that turns it into a sealed bid. [D§4; user 2026-11-05]
- **FR-005**: The system MUST NOT reveal any individual bid price before the Reveal phase. Public box data is limited to total NEAR in, bidder count and time left. [D§4]
- **FR-006**: Sealed bids MUST NOT be cancellable. [D§4]
- **FR-007**: After the room closes, a fixed 60-second Reveal phase MUST accept reveals and reject new bids. Each sealed bid MUST carry its max price and salt timelock-encrypted (drand quicknet) to the round at `close_at`. Reveals MUST be automatic: once that round is out, the app and the keeper reveal every bid they can decrypt, and the contract accepts a reveal from any caller. Users MUST never be asked to reveal, keep or export anything. If a box received no sealed bids, Reveal MUST be skipped and the box MAY open as soon as the room closes. [D§4; user 2026-11-05]
- **FR-008**: The clearing price MUST be computed as: start from all market bids, add sealed bids in descending max-price order, accept each only while the resulting price (accepted NEAR ÷ 500M) ≤ its max, and stop at the first rejection. Bids at exactly the final price are filled pro-rata. A box accepts at most 200 bids. Any further deposit is credited as a claimable refund. [D§4, plan]
- **FR-009**: Rejected and below-price bids MUST be refundable in full. A sealed bid still unrevealed when the box opens MUST be cleared as a market bid, so withholding a reveal only removes the bidder's own price limit. [D§4; user 2026-11-05]
- **FR-010**: If accepted NEAR is below the box's minimum raise, the box MUST become Failed, refund every bid in full, and create no pool. The minimum raise MUST be at least a platform floor of 1 NEAR. The floor is a protocol setting that can be raised later without affecting boxes already created. [D§4]
- **FR-011**: Anyone MUST be able to trigger Open after Reveal ends, and the app MUST trigger it automatically. [D§4]

**Opening and liquidity**
- **FR-012**: On a successful Open, the system MUST take exactly 1% of the accepted NEAR as a protocol fee, then pair the remainder with 500M tokens in a new pool at the coin's trading fee. [D§2]
- **FR-013**: The pool's liquidity MUST be 100% owned by Plunk and permanently locked. [D§2]
- **FR-014**: If pool creation fails, the box MUST remain in Opening with a Retry action, and no funds may be lost. If a box is still in Opening 24h after Reveal ended, it MUST become Failed and every bid becomes refundable in full. [D§4, checklist CHK004]
- **FR-015**: No account MUST be able to receive coin tokens before the box is Open. [D§8]

**Fees and holder rewards**
- **FR-016**: Harvests MUST run hourly (triggered automatically, and anyone may trigger one). Each harvest MUST divide gross trading fees as 20% DEX, 5% protocol and 75% dev share. The dev share is split per the dev's chosen dev / holders (NEAR) / buyback (burn / keep) settings, defaulting to 100% dev. Rounding dust from any split goes to the holders' share. [D§2]
- **FR-017**: Harvest MUST apply coin-denominated fees to the buyback share first, and swap only the remaining imbalance. Anyone MUST be able to trigger a harvest. [D§2]
- **FR-018**: Each hour's distributable amount MUST be shared in proportion to each holder's lowest balance during that hour. Coins bought during an hour earn only from the next hour. If the hour's amount is below a minimum distributable amount (a protocol setting), it MUST roll over to the next hour. If no account is eligible in an hour, that hour's amount MUST roll over. Holders MUST be able to claim at any time. The pool and Plunk's own accounts MUST be excluded. NEAR fee rewards exist only when the coin's dev assigns a holder share. [D§2]
- **FR-019**: A coin's trading fee MUST be fixed for life at launch (the DEX does not allow changing a pool's fee). After launch the dev MAY move part of their own share to holders or buyback at any time, but MUST NOT ever increase their own share. [D§2, research]
- **FR-020**: Trades made in the Plunk app MUST carry a 0.1% app fee, shown before confirmation. If the K3 test shows the router can't apply it or route to the coin's pool, in-app trades go directly to the pool with no app fee, and this is logged as a deviation. [D§2, plan K3]
- **FR-021**: All fee figures shown to users MUST be net of the DEX's 20% share. [D§2]

**Dev tax and treasury**
- **FR-022**: Everything the dev wins in their own box MUST go into escrow. [D§3]
- **FR-023**: The dev MUST be able to withdraw any amount W from escrow at the current tax rate t. Holders receive W×t (rounded up to the smallest unit, in holders' favour) as coins (claimable, shared out under the same hourly eligibility rule as FR-018), the dev receives W×(1−t), and t falls linearly from 90% to 0% across the window. [D§3]
- **FR-024**: Extending MUST be rejected while a window is running. After it ends, the dev MAY start a new 24h–7d window that restarts at 90%. [D§3]
- **FR-025**: Kept buyback tokens (treasury) belong to the coin's dev and MUST leave only through the dev tax, with each deposit following its own 7-day 90%→0 linear curve. Withdrawals draw from the oldest deposit first. [D§3]
- **FR-026**: Every dev or treasury withdrawal MUST appear publicly on the box page with the amount paid to holders. [D§3, D§5]

**Cross-chain**
- **FR-027**: Buyers on other supported chains MUST be able to place market bids into a Closed box via a deposit address, and MUST name an existing NEAR account that receives their coins. Quotes MUST stop 5 minutes before close, because cross-chain processing can take up to 15 minutes. This requirement is dropped (logged as a deviation) if the K1 kill test fails by 2026-11-08. [D§4]
- **FR-028**: The box MUST never reject an incoming deposit. A cross-chain deposit that arrives after close, or with an invalid message, MUST be credited as a refundable wNEAR balance to the named NEAR account, claimable from the box page. (Intents documents no refund path for `ft_transfer_call` deliveries.) [D§4, research]

**Screens**
- **FR-029**: The home page MUST show a live strip featuring the soonest-closing box, and a grid of all boxes. [D§5]
- **FR-030**: Box pages MUST present Closed, Reveal and Opening states in the mascot-led layout, and the Open state as a terminal view: price chart, buy/sell panel, live trades feed with dev-tax events, and claimable NEAR / claimable fill. [D§5]
- **FR-031**: The dev panel MUST show escrow balance, a tax meter with the end time, a withdraw slider with a live "you get / holders get" preview, Extend (disabled while a window runs), "Give more to holders" (moves part of the dev's share to holders or buyback, one-way) and Harvest. [D§5]

**Submission (competition)**
- **FR-032**: The README MUST give "do X, see Y" steps that work on testnet with NEAR-only bidding, name the NEAR technologies used, state "unaudited", disclose the Darkroom design origin, and include a LICENSE. [R§1, R§6]
- **FR-033** (added 2026-11-11, solana-mirror.md phase A): A box MAY carry a Solana share of 0–5000 bps, chosen at creation and immutable. At Open, that share of the LP half (coins and net raise) is held by the launchpad as the box's `mirror` leg instead of entering the Rhea pool; the rest seeds Rhea as before. Clearing, refunds and the 1% raise fee are unchanged. Sending the leg to Solana is phase B.

### Key Entities

- **Box**: one launch. Dev, coin metadata, room length, minimum raise, fee settings, tax window, state (Closed / Reveal / Opening / Open / Failed), close time, totals.
- **Bid**: a buyer's entry in a box. Kind (sealed / market / cross-chain market), receiving NEAR account, budget, hidden max price (sealed only), revealed flag, fill, refund.
- **Coin**: the token created for an open box. Supply, holders, pool link, current trading fee.
- **Dev escrow**: the dev's won tokens. Window start/end, current tax, withdrawals.
- **Treasury deposit**: a batch of kept buyback tokens, each with its own deposit time and 7-day curve.
- **Holder reward account**: per holder, the lowest balance in each hour, accrued and claimed NEAR (fee share), and accrued and claimed coins (dev tax).
- **Distribution epoch**: one hour. Harvested amounts, carry-over from earlier hours, and eligible balances.
- **Fee harvest**: one harvest event. Gross amounts by asset, split paid, swaps made.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The clearing result for the worked example (C, A, B, D) matches exactly: price 0.4 per 1M, A and C 250M each, B and D fully refunded.
- **SC-002**: In 100% of tested cases, no individual bid price is visible to anyone before the Reveal phase begins.
- **SC-003**: For any withdrawal amount and time inside a window, the holder and dev amounts match W×t and W×(1−t) to the smallest token unit.
- **SC-004**: 100% of bids in Failed boxes, and 100% of rejected bids, are refundable at their full amount. 100% of unrevealed sealed bids clear as market bids.
- **SC-005**: On every successful Open, exactly 1% of the accepted NEAR goes to the protocol and the rest seeds the pool.
- **SC-006**: A first-time judge can follow the README from start to a revealed box with a claimed fill in under 15 minutes on testnet.
- **SC-007**: The demo video shows the six-step path [D§6] in under 2 minutes.
- **SC-009**: In tests, a wallet that buys during an hour receives 0 from that hour's distribution in 100% of cases.
- **SC-008**: A buyer can go from opening a closed box to a submitted sealed bid in under 1 minute.

## Assumptions

- Liquidity, swaps and the DEX's 20% fee share come from Rhea (`v2.ref-finance.near` simple pools; creator-set fee; `admin_fee_bps` 2000, verified on mainnet 2026-11-02) [R§4, D§2].
- Cross-chain bidding depends on NEAR Intents 1Click delivering funds with a message into the box contract. This is documented as experimental and mainnet-only, and gated by the day-1 kill test, with a cut on 2026-11-08 if it fails [R§1].
- The price chart embeds DexScreener first, with our own price feed as the fallback [D§5].
- NEAR is the only quote asset [D§7].
- Accessibility: basic WCAG contrast, and keyboard access for bid, claim and withdraw. A full accessibility audit is out of scope.
- Mobile polish, an image generator, automatic harvesting and an audit are out of scope [D§7].
- The submission deadline is 2026-11-14 23:59 UTC. Repo public, X demo post (tags + video) and one immutable submission are required [R§1].
- The first coin launched is Plunk ($PLUNK): 3% fee, dev share split so the user gets 1% (0.15% protocol + 0.85% dev), holders 1% in NEAR, and buyback 0.4% (0.15% burn, 0.25% kept) [D§2].
