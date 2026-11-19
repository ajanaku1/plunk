# The Board: working notes between contributor and founder

This file is the shared thread for the `feat/the-board-home` branch. Humans and their AI assistants can read it, answer in it, and ask in it. It is a working file: delete the `docs/board/` folder before merging if you do not want it in `main`.

## How to use this file
- Answer a question by writing under it: `> Answer (who, date): ...`. Do not edit the question.
- Add a new question at the bottom of "Open questions" with the next number, your name, the date, and what you need decided.
- One decision per question. If an answer changes the code, say which file.
- If you are an AI assistant: treat every claim below as unverified until you have run the check yourself (`pnpm test`, `pnpm exec tsc --noEmit`, open the page). The "Checked" list says what was run and when; the "Not checked" list says what was not.
- Status words: **designed** (written down), **built** (compiles), **tested** (a test ran and passed), **proven** (a review failed to break it). Only the first three apply to anything here.

## What this branch is
A new look for four pages, called "The Board": split-flap tiles for every countdown and price, sealed prices frosted until the box opens, each token's picture drawn as a coin, and a 3D Peek on Home and in the Room. No contract code, no keeper code, no swap/bid/claim logic was changed.

| Page | Files | What changed |
|---|---|---|
| Home `/` | `components/home/{Hero,Home,BoardRows,OpenedGrid,ActivityRail}.tsx` | Lead box with flip clock and raise meter, boxes as board rows, "Just opened" grid, side rail |
| Room `/box/[id]` | `components/box/{Banner,Identity,BoxView}.tsx` | 3D Peek and flip clock in the banner, coin identity, segmented raise meter, bid card moved under the identity on phones (CSS only) |
| Make `/make` | `components/make/MakeForm.tsx` | `Preview` shows the box as a board row (coin, room clock, sealed price). Form logic untouched |
| You `/u/[account]` | `components/profile/Profile.tsx` | Portfolio in flip tiles, held-coin strip, coin stacks per holding |

New shared pieces: `components/board/{Flap,Coin,PeekBox}.tsx`, `lib/board.ts` (+ test), `lib/peek3d.ts`, `styles/board.css`, token additions in `styles/tokens.css`.

## Run it
```
cd app && pnpm install && pnpm dev
pnpm test && pnpm exec tsc --noEmit
```

## Checked (2026-11-19, on the contributor's machine)
- `tsc --noEmit` clean; 59 tests pass (49 existing + 10 new in `lib/board.test.ts`).
- Home, Room, Make, You loaded in headless Chrome at 1440 and 390 px, dark and light, 0 console errors and 0 page errors, against live testnet (2 open boxes) and against a fixture of 6 boxes (bidding, reveal, opening, failed, open) fed through a mocked `list_boxes`/`get_box`.

## Not checked
- Bidding, claiming, creating a box, or swapping with a connected wallet.
- Keyboard and focus order on the new pages.
- 3D Peek frame rate on a real GPU (headless numbers were unreliable). It loads three.js after first paint and falls back to the flat Peek without WebGL.
- A true Reveal-state screenshot (my fixture landed in Opening).
- Launches and Bids tabs on You; the Coin page chart and swap panels were not restyled.

## Changes outside the four pages (please look at these)
1. New dependency: `three@0.170.0` and `@types/three@0.170.0` (loaded on demand, not in the first bundle).
2. `hooks/useTape.ts`: `TapeItem` gained an optional `spot` so Home can show moves without a second poll. One line, no behaviour change for the tape.
3. `styles/tokens.css`: new `--tile-*` and `--slab` tokens; in the light theme `--ok` is now `#087a4e` (was the pale green, about 2:1 on white). This darkens green text app-wide in light mode.
4. `app/layout.tsx`: Archivo weights 800 and 900 added; `styles/board.css` imported.

## Open questions
Founder decisions are marked **[founder]**; contract or data questions are marked **[engineering]**.

1. **[engineering]** Are bidder account names public before close? The Board feeds assume yes.
2. **[engineering]** What is the real dev-tax decay shape? The mockups draw a straight line and label it a sample.
3. **[engineering]** Can all bids of a closed box be read (for a Wall and a replay)?
4. **[engineering]** Where would reminders, a launch schedule and picture reports live? There is no off-chain store today.
5. **[engineering]** Rhea trade: link out, or embed the router with the 0.1% app fee? `SwapPanel` text mentions a mainnet 0.1% fee; earlier answers said it is not built.
6. **[engineering]** Second-account tax dodge: unfixed. Mockup rule cards say so. When is it planned?
7. **[engineering]** Who calls `open`: the keeper or a visitor? `opening` exists in `stateOf`.
8. **[founder]** Who reviews reported pictures, and how fast? Nothing exists for it yet.
9. **[founder]** Mascot: keep the in-code Peek (this branch), or commission a model (one listing found at about $450 for model, texture and simple rig)?
10. **[founder]** Is a new dependency (`three`, about 600 KB, lazy-loaded) acceptable, or should the mascot stay flat?
11. **[founder]** Is darkening `--ok` app-wide in light mode acceptable, or should it be scoped to the new pages?
12. **[founder]** Should this land page by page (Home first) or as one PR? The branch can be split by page.

## Answers and new questions
(write below)
