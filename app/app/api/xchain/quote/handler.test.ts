import { describe, expect, it, vi } from 'vitest';
import type { LaunchBox } from '@/lib/launchpad';
import { beforeCutoff, bidMsg, originTokens, quoteBody, toUnits, validAccountId } from '@/lib/xchain';
import { type Deps, handleQuote, parseInput } from './handler';

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const closeIn = (min: number) => (NOW + min * 60_000) * 1e6;

function box(over: Partial<LaunchBox> = {}): LaunchBox {
  return { id: 7, phase: 'Bidding', close_at: closeIn(8), ...over } as LaunchBox;
}

function deps(over: Partial<Deps> = {}): Deps & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    launchpadId: 'plunk.near',
    wnear: 'wrap.near',
    getBox: async () => box(),
    accountExists: async (id) => id === 'mia.near',
    oneClick: async (b) => {
      calls.push(b);
      return { status: 201, json: { quote: { depositAddress: 'So1anaDeposit', amountIn: '1000000', amountInFormatted: '1', amountOut: '2', amountOutFormatted: '2', deadline: 'x' } } };
    },
    now: () => NOW,
    ...over,
  };
}

const good = { boxId: 7, originAsset: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', amount: '1000000', refundTo: 'SoLAddr', recipient: 'mia.near' };

describe('xchain quote (FR-027)', () => {
  it('builds the 1Click body exactly as K1 did, with our bid msg and the launchpad as recipient', () => {
    const b = quoteBody({ ...good, dry: false }, 'plunk.near', 'wrap.near', closeIn(8), NOW);
    expect(b).toMatchObject({ swapType: 'EXACT_INPUT', depositType: 'ORIGIN_CHAIN', recipientType: 'DESTINATION_CHAIN', refundType: 'ORIGIN_CHAIN', recipient: 'plunk.near', destinationAsset: 'nep141:wrap.near', slippageTolerance: 100 });
    expect(JSON.parse(b.customRecipientMsg)).toEqual({ box_id: '7', kind: 'xchain', recipient: 'mia.near' });
    expect(Date.parse(b.deadline)).toBe(NOW + 3 * 60_000); // close − 5 min
  });

  it('stops quoting 5 minutes before close', async () => {
    expect(beforeCutoff(closeIn(6), NOW)).toBe(true);
    expect(beforeCutoff(closeIn(5), NOW)).toBe(false);
    const d = deps({ getBox: async () => box({ close_at: closeIn(4) }) });
    const r = await handleQuote(good, d);
    expect(r.status).toBe(400);
    expect(d.calls).toHaveLength(0);
  });

  it('requires an existing NEAR recipient and a bidding box', async () => {
    expect((await handleQuote({ ...good, recipient: 'ghost.near' }, deps())).status).toBe(400);
    expect((await handleQuote(good, deps({ getBox: async () => box({ phase: 'Open' }) }))).status).toBe(400);
    expect((await handleQuote(good, deps({ getBox: async () => null }))).status).toBe(404);
  });

  it('proxies a good quote and returns the deposit address', async () => {
    const d = deps();
    const r = await handleQuote(good, d);
    expect(r.status).toBe(200);
    expect((r.body as { quote: { depositAddress: string } }).quote.depositAddress).toBe('So1anaDeposit');
    expect(d.calls).toHaveLength(1);
  });

  it('surfaces a 1Click rejection as 502 without inventing a quote', async () => {
    const oneClick = vi.fn(async () => ({ status: 400, json: { message: 'amount too small' } }));
    const r = await handleQuote(good, deps({ oneClick }));
    expect(r.status).toBe(502);
  });

  it('validates input', () => {
    expect(parseInput({ ...good, boxId: -1 })).toMatch(/boxId/);
    expect(parseInput({ ...good, amount: '1.5' })).toMatch(/smallest units/);
    expect(parseInput({ ...good, recipient: 'Not Valid' })).toMatch(/recipient/);
    expect(typeof parseInput(good)).toBe('object');
    expect(validAccountId('a.near')).toBe(true);
    expect(validAccountId('x')).toBe(false);
    expect(bidMsg(0, 'plunk.near')).toBe('{"box_id":"0","kind":"xchain","recipient":"plunk.near"}');
  });

  it('helpers: origin tokens exclude NEAR, units parse by decimals', () => {
    const t = originTokens([
      { assetId: 'nep141:wrap.near', blockchain: 'near', symbol: 'wNEAR', decimals: 24 },
      { assetId: 'sol-usdc', blockchain: 'sol', symbol: 'USDC', decimals: 6 },
      { assetId: 'eth-usdc', blockchain: 'eth', symbol: 'USDC', decimals: 6 },
    ]);
    expect(t.map((x) => x.assetId)).toEqual(['eth-usdc', 'sol-usdc']);
    expect(toUnits('1', 6)).toBe('1000000');
    expect(toUnits('0.5', 6)).toBe('500000');
    expect(toUnits('0', 6)).toBeNull();
    expect(toUnits('abc', 6)).toBeNull();
  });
});
