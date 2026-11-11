/**
 * Cross-chain market bids through NEAR Intents 1Click (FR-027, research R5).
 * The deposit is swapped to wNEAR and delivered to the launchpad by `ft_transfer_call` with
 * our msg, so it lands as an xchain market bid for `recipient`. Nothing here holds keys.
 */

export const ONE_CLICK = 'https://1click.chaindefuser.com';
/** Quotes stop this long before close: 1Click can take up to 15 minutes (FR-027). */
export const CUTOFF_MS = 5 * 60 * 1000;

export type Token = { assetId: string; blockchain: string; symbol: string; decimals: number; price?: number; contractAddress?: string };

export type QuoteInput = {
  boxId: number;
  originAsset: string;
  amount: string;
  refundTo: string;
  recipient: string;
  dry: boolean;
};

export type QuoteBody = {
  dry: boolean;
  swapType: 'EXACT_INPUT';
  slippageTolerance: number;
  originAsset: string;
  depositType: 'ORIGIN_CHAIN';
  destinationAsset: string;
  amount: string;
  refundTo: string;
  refundType: 'ORIGIN_CHAIN';
  recipient: string;
  recipientType: 'DESTINATION_CHAIN';
  customRecipientMsg: string;
  deadline: string;
};

export type Quote = {
  depositAddress: string;
  amountIn: string;
  amountInFormatted: string;
  amountOut: string;
  amountOutFormatted: string;
  deadline: string;
  timeEstimate?: number;
};

export type Status = { status: string; updatedAt?: string; swapDetails?: Record<string, unknown> };

/** The bid msg the launchpad parses (contracts/launchpad.md). `box_id` travels as a string, as 1Click sends it. */
export function bidMsg(boxId: number, recipient: string): string {
  return JSON.stringify({ box_id: String(boxId), kind: 'xchain', recipient });
}

/** True while a quote may still be made: more than 5 minutes before close. */
export function beforeCutoff(closeAtNs: number, nowMs: number): boolean {
  return closeAtNs / 1e6 - nowMs > CUTOFF_MS;
}

export function quoteBody(input: QuoteInput, launchpadId: string, wnear: string, closeAtNs: number, nowMs: number): QuoteBody {
  // The quote is valid until the cutoff, or one hour, whichever comes first.
  const deadlineMs = Math.min(closeAtNs / 1e6 - CUTOFF_MS, nowMs + 60 * 60 * 1000);
  return {
    dry: input.dry,
    swapType: 'EXACT_INPUT',
    slippageTolerance: 100,
    originAsset: input.originAsset,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: `nep141:${wnear}`,
    amount: input.amount,
    refundTo: input.refundTo,
    refundType: 'ORIGIN_CHAIN',
    recipient: launchpadId,
    recipientType: 'DESTINATION_CHAIN',
    customRecipientMsg: bidMsg(input.boxId, input.recipient),
    deadline: new Date(deadlineMs).toISOString(),
  };
}

export const NEAR_ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function validAccountId(id: string): boolean {
  return id.length >= 2 && id.length <= 64 && NEAR_ACCOUNT_RE.test(id);
}

/** Only tokens on chains other than NEAR make sense as an origin. */
export function originTokens(tokens: Token[]): Token[] {
  return tokens.filter((t) => t.blockchain !== 'near').sort((a, b) => a.blockchain.localeCompare(b.blockchain) || a.symbol.localeCompare(b.symbol));
}

/** "1.5" in a token's units → smallest units as a decimal string. */
export function toUnits(text: string, decimals: number): string | null {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(text.trim());
  if (!m) return null;
  const frac = (m[2] ?? '').slice(0, decimals).padEnd(decimals, '0');
  const v = BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac || '0');
  return v > 0n ? v.toString() : null;
}
