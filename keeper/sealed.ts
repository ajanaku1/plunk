/**
 * Sealed-bid helpers for the reveal keeper. Mirrors app/lib/sealed.ts (`unseal`), which the keeper
 * can't import: the payload is max_price u128 LE ‖ salt[32], timelocked to the drand quicknet round
 * at close (research R11). The contract accepts a reveal from anyone in [close_at, close_at + 60 s).
 */
import { mainnetClient, timelockDecrypt } from 'tlock-js';

export const REVEAL_NS = 60_000_000_000;

export type SealedBox = { id: number; phase: string; close_at: number; sealed_count: number };
export type SealedView = { bid_id: number; bidder: string; tlock: string };
export type Revealed = { maxPrice: bigint; saltHex: string };
export type RevealArgs = { box_id: number; bid_id: number; max_price: string; salt: string };

/** True while the contract still takes reveals for this box (bids.rs `reveal`). */
export function inRevealWindow(box: SealedBox, nowNs: number): boolean {
  return box.phase === 'Bidding' && box.sealed_count > 0 && nowNs >= box.close_at && nowNs < box.close_at + REVEAL_NS;
}

export function readU128le(bytes: Uint8Array): bigint {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, 16);
  return dv.getBigUint64(0, true) + (dv.getBigUint64(8, true) << 64n);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Splits a decrypted 48-byte payload; throws on anything else (a junk ciphertext). */
export function parsePayload(plain: Uint8Array): Revealed {
  if (plain.length !== 48) throw new Error('unexpected payload length');
  return { maxPrice: readU128le(plain.subarray(0, 16)), saltHex: hex(plain.subarray(16)) };
}

/** Decrypts a stored ciphertext once its round is out. Throws before that, or on junk. */
export async function unseal(tlock: string): Promise<Revealed> {
  return parsePayload(new Uint8Array(await timelockDecrypt(tlock, mainnetClient())));
}

export function revealArgs(boxId: number, bidId: number, r: Revealed): RevealArgs {
  return { box_id: boxId, bid_id: bidId, max_price: r.maxPrice.toString(), salt: r.saltHex };
}
