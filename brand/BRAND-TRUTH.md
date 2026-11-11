# Plunk — Brand Truth

Decided at the brand gate on 2026-11-06. Everything downstream (favicon, wordmark,
`app/styles/tokens.css`, the box-page mascot) derives from this file.

| Field | Value |
|---|---|
| name | Plunk |
| purpose | A NEAR meme launchpad where you plunk NEAR into a sealed box and it pops open at one fair price for everyone. |
| core_verb | plunk |
| metaphor | A sealed box with a floating lid. The gap is the sealed bid: you know something is inside, not what. The lid is the one price line it pops open at. |
| mark | **Peek**, option C (light tile). Front-on green box, lid floating above, two glowing purple eyes in the dark gap, on a pale rounded tile. `brand/marks/peek-light.svg` |
| mascot | The same box. It acts out the box states: Closed (lid shut, eyes closed), Reveal (eyes darting), Opening (lid lifting), Open (lid flipped up into the price line), dev sells early (lid slams down). |
| palette | green `#2EE89C` (primary accent, the box, NEAR side), purple `#9B6BFF` (secondary accent, the eyes and the drop, Solana side), black `#0E0B14` (ink / dark surface), light `#F3F0FA` (paper / light surface), grey `#8F89A3` (muted text). |
| constraints | Flat front-on geometry at 16px (favicon uses `brand/marks/peek.svg` geometry on the light tile). One primary accent (green) per screen; purple is for eyes, bids arriving and secondary emphasis only. Dark UI first, light supported. Hues sit one step off the exact NEAR and Solana brand values and must not be moved onto them. |
| forbidden | piggy bank, coin slot, treasure chest, gift box or ribbon, rocket / moon, meme animals, candlestick charts in the mark, a coin with a ticker, hexagon or cube-with-nodes, the NEAR or Solana logos, gradients in the UI (gradients live in the icon only). |

## Files

- `brand/marks/peek-light.svg` — primary app icon (option C).
- `brand/marks/peek-icon.svg`, `brand/marks/peek-iso.svg` — dark-tile and 3D alternates, not primary.
- `brand/marks/peek.svg` — flat geometry; source for the favicon and the animated mascot.
- `brand/favicon.svg`, `brand/wordmark.svg` — derived exports.
- `app/styles/tokens.css` — the token sheet the UI uses.

## History

- Round 1: tangerine / ink / paper palette, three marks (Peek, Drop, Pop). User changed the palette to green / purple / black.
- Round 2: Peek chosen; three finishes (flat depth, 3D box, light tile). User chose the light tile.
