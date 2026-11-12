/**
 * Typed mirror of the launchpad's JSON views and the client-side phase derivation.
 * Shapes follow contracts/launchpad/src/{types,bids,open}.rs. Amounts arrive as decimal strings.
 */

export type Phase = 'Bidding' | 'Opening' | 'Open' | 'Failed';

export type Meta = { name: string; ticker: string; image: string; description: string };
export type Split = { dev: number; holders: number; buyback_burn: number; buyback_keep: number };

export type Opening = {
  price: string;
  accepted_total: string;
  coin_ready: boolean;
  pool_id: number | null;
  deposited: [boolean, boolean];
  shares: string;
};

export type DevEscrow = { balance: string; window_start: number; window_end: number };
export type TreasuryDeposit = { remaining: string; deposited_at: number };
export type Withdrawal = { to_dev: string; to_holders: string; rate_bps: number };
/** The Solana leg held back at Open (specs/001-plunk-launchpad/solana-mirror.md); null when the share is 0. */
export type Mirror = { coins: string; wnear: string; sent: boolean };

export type LaunchBox = {
  id: number;
  dev: string;
  meta: Meta;
  coin_id: string;
  room_secs: number;
  close_at: number;
  min_raise: string;
  fee_bps: number;
  split: Split;
  tax_window_secs: number;
  /** Basis points of the LP half set aside for the Solana mirror (0–5000). */
  solana_share_bps: number;
  phase: Phase;
  total_in: string;
  bidder_count: number;
  bid_count: number;
  sealed_count: number;
  opening: Opening | null;
  open_at: number;
  escrow: DevEscrow;
  treasury: TreasuryDeposit[];
  coin_pot: string;
  /** A harvest still in flight; the keeper (or anyone) calls `harvest` again to finish it. */
  harvest: Record<string, unknown> | null;
  last_harvest_epoch: number;
  per_share_last: string;
  carry_near: string;
  /** Pool reserves [wNEAR, coin] at each hourly harvest, newest last (chart fallback, R7). */
  snapshots: Snapshot[];
  mirror: Mirror | null;
};

export type Snapshot = { ts: number; reserves: [string, string] };

export function treasuryTotal(box: LaunchBox): bigint {
  return box.treasury.reduce((a, d) => a + BigInt(d.remaining), 0n);
}

export type PublicTotals = {
  total_in: string;
  bidder_count: number;
  bid_count: number;
  close_at: number;
  reveal_end: number;
  phase: Phase;
};

export type BidKind =
  | { Sealed: { commit: string; tlock: string | null; revealed_price: string | null } }
  | 'Market'
  | 'XChain';

export type Bid = {
  id: number;
  bidder: string;
  recipient: string;
  budget: string;
  kind: BidKind;
  tokens: string;
  refund: string;
  coins_paid: boolean;
  refund_paid: boolean;
};

export type SealedView = { bid_id: number; bidder: string; tlock: string };

export type Config = {
  owner: string;
  coin_code_hash: string;
  exchange: string;
  wnear: string;
  creation_fee: string;
  min_raise_floor: string;
  min_distributable: [string, string];
};

export type BoxArgs = {
  meta: Meta;
  room_secs: number;
  min_raise: string;
  fee_bps: number;
  split: Split | null;
  tax_window_secs: number;
  /** FR-033: share of the LP half held at Open for the coin's Solana pool, 0–5000 bps. */
  solana_share_bps: number;
};

export const SOLANA_SHARE_BPS: [number, number] = [0, 5000];

/** The five states the page renders. Closed and Reveal are derived from time while on-chain phase is Bidding. */
export type BoxState = 'bidding' | 'reveal' | 'opening' | 'open' | 'failed';

export const REVEAL_NS = 60_000_000_000;
export const ROOM_SECS: [number, number] = [120, 600];
export const FEE_BPS: [number, number] = [50, 300];
export const TAX_WINDOW_SECS: [number, number] = [86_400, 604_800];
export const TICKER_RE = /^[a-z0-9]{2,10}$/;

export function revealEnd(box: Pick<LaunchBox, 'close_at' | 'sealed_count'>): number {
  return box.sealed_count > 0 ? box.close_at + REVEAL_NS : box.close_at;
}

/** Derives the displayed state at `nowNs` (block time in nanoseconds). */
export function stateOf(box: LaunchBox, nowNs: number): BoxState {
  if (box.phase === 'Open') return 'open';
  if (box.phase === 'Failed') return 'failed';
  if (box.phase === 'Opening') return 'opening';
  if (nowNs < box.close_at) return 'bidding';
  // Past reveal_end the box only waits for someone to call `open`; the page shows that as Opening.
  return nowNs < revealEnd(box) ? 'reveal' : 'opening';
}

export function kindLabel(kind: BidKind): 'Sealed' | 'Market' | 'Cross-chain' {
  if (kind === 'Market') return 'Market';
  if (kind === 'XChain') return 'Cross-chain';
  return 'Sealed';
}

export function revealedPrice(kind: BidKind): string | null {
  return typeof kind === 'object' ? kind.Sealed.revealed_price : null;
}

/** Whether a bid still has something to collect: coins or refund when Open, the full budget when Failed. */
export function claimable(bid: Bid, state: BoxState): boolean {
  if (state === 'failed') return !bid.refund_paid && BigInt(bid.budget) > 0n;
  if (state !== 'open') return false;
  return (BigInt(bid.tokens) > 0n && !bid.coins_paid) || (BigInt(bid.refund) > 0n && !bid.refund_paid);
}
