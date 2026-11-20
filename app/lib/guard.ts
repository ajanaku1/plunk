/** The launchpad's owner safety switches (contracts/launchpad/src/guard.rs) and what they mean for a bid. */
export type Guard = { paused: boolean; max_raise: string; mirror_off: boolean };

/**
 * Why the contract would not take this bid, or null. A blocked bid is not lost (it becomes a late
 * credit to claim back), but the page should stop it before the wallet opens.
 */
export function bidBlock(guard: Guard | undefined, totalIn: bigint, amount: bigint | null): string | null {
  if (!guard) return null;
  if (guard.paused) return 'Plunk is paused: no new bids right now.';
  const cap = BigInt(guard.max_raise);
  if (cap === 0n) return null;
  if (totalIn >= cap) return 'This box has reached the raise cap.';
  if (amount !== null && totalIn + amount > cap) return 'That bid would pass the raise cap. Bid less.';
  return null;
}
