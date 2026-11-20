import type { Metadata } from 'next';
import { Tiles } from '@/components/board/Flap';
import { explorerAccount, launchpadId } from '@/config';

export const metadata: Metadata = { title: 'How Plunk works', description: 'Boxes, bids, the one clearing price, fees, the dev sell tax and holder rewards.' };

export default function DocsPage() {
  return (
    <article className="docs gutter in">
      <header>
        <h1>How Plunk works</h1>
        <p className="lead">A meme coin launch is a sealed box. Everyone plunks NEAR in, the box shuts, and it opens at one price for everyone. No sniping, no bonding-curve race, no first-block advantage.</p>
      </header>

      <ol className="dc-steps" aria-label="The three steps">
        <li><Tiles text="01" label="Step 1" className="dc-n" /><b>Plunk in</b><span>Everyone plunks NEAR in while the room is open.</span></li>
        <li><Tiles text="02" label="Step 2" className="dc-n" /><b>The box shuts</b><span>Sealed prices unlock on their own.</span></li>
        <li><Tiles text="03" label="Step 3" className="dc-n" /><b>One price</b><span>It opens at one price for everyone.</span></li>
      </ol>

      <div className="dc-facts" aria-label="The numbers">
        <div><Tiles text="1B" label="1 billion supply" /><small>Supply · 500M bidders, 500M pool</small></div>
        <div><Tiles text="2-10" label="2 to 10 minutes" /><small>Bidding room, in minutes</small></div>
        <div><Tiles text="60" label="60 seconds" /><small>Seconds of Reveal after close</small></div>
        <div><Tiles text="1%" label="1 percent" /><small>Raise fee</small></div>
        <div><Tiles text="90-0%" label="90 to 0 percent" /><small>Dev sell tax over 1 to 7 days</small></div>
      </div>

      <details className="dc-sec" open>
        <summary><span>01</span>The box</summary>
        <p>A dev makes a box: name, ticker, an optional image, a bidding room of 2 to 10 minutes, a minimum raise, a trading fee and a dev-tax window. Making it costs a small creation fee that pays for the coin&apos;s storage. The coin lives at <code>ticker.{launchpadId}</code> and is minted by the launchpad, so its supply and liquidity are fixed by code.</p>
        <p>Supply is always 1 billion: 500M to the bidders, 500M into the pool.</p>
      </details>

      <details className="dc-sec">
        <summary><span>02</span>Bids</summary>
        <ul>
          <li><b>Market</b>: you set a budget in NEAR and take whatever the box clears at. Most bids are market bids.</li>
          <li><b>Max price</b> (sealed): you add the most you will pay per 1M coins. The price is encrypted on your device and only decrypts after the box shuts, so nobody, including us, can read it early. You reveal it in the 60 second Reveal step; the page does that for you automatically.</li>
          <li><b>Cross-chain</b>: pay from another chain through the 1Click bridge; it lands in the box as a market bid. Available on mainnet.</li>
        </ul>
        <p>A budget is locked while the room is open. If the box fails you get all of it back.</p>
      </details>

      <details className="dc-sec">
        <summary><span>03</span>One price</summary>
        <p>When the box opens, the launchpad finds the single price at which the 500M coins sell to the bids willing to pay it, highest max prices first and market bids at any price. Everyone pays that one price. Anyone whose max price was below it is refunded in full, and anyone above it pays only the clearing price, so the difference comes back too.</p>
        <p>If total bids fall short of the minimum raise, the box fails and every bidder claims a 100% refund.</p>
      </details>

      <details className="dc-sec">
        <summary><span>04</span>Fees</summary>
        <ul>
          <li><b>Raise fee</b>: 1% of the NEAR accepted at Open goes to the protocol. The rest is paired with the pool&apos;s 500M coins as liquidity, locked under the launchpad forever.</li>
          <li><b>Trading fee</b>: the dev picks 0.5% to 3% per trade when making the box and it never changes. Of it, the DEX keeps 20%, the protocol 5%, and 75% is the dev share.</li>
          <li><b>Dev share split</b>: a dev can route the dev share to holders, buyback-and-burn or buyback-and-keep. The split can only ever move away from the dev, never back.</li>
        </ul>
      </details>

      <details className="dc-sec">
        <summary><span>05</span>The dev sell tax</summary>
        <p>The dev&apos;s own fill at Open does not go to their wallet. It goes into escrow, and any coins the dev takes out are taxed on a line from 90% down to 0% across the window the dev chose (1 to 7 days). Treasury deposits follow the same curve from the day they arrive. Every taxed coin goes to holders, not to the protocol.</p>
        <p>Buyers see the window and the current rate on the box before they bid, and a dev can extend the window but never shorten it.</p>
      </details>

      <details className="dc-sec">
        <summary><span>06</span>Holder rewards</summary>
        <p>Once an hour a keeper harvests the pool: it pulls out the trading fees earned, swaps them to NEAR, and pays them out by the split. The holders&apos; share and the dev-tax coins are credited per hour by each holder&apos;s lowest balance during that hour, so flashing coins in and out earns nothing. Claim any time from the box page or your profile.</p>
      </details>

      <details className="dc-sec">
        <summary><span>07</span>What to know</summary>
        <ul>
          <li>Contracts are unaudited. Treat every box as experimental.</li>
          <li>The portfolio value on a profile is spot price times balance; selling moves the pool.</li>
          <li>Everything here is a view of the contract at <a className="link" href={explorerAccount(launchpadId)} target="_blank" rel="noreferrer">{launchpadId}</a>. If the page and the chain disagree, the chain is right.</li>
        </ul>
      </details>
    </article>
  );
}
