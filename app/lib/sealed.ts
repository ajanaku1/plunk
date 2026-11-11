/**
 * Sealed bids: the R10 commit and the R11 drand timelock.
 * commit = sha256("plunk:v1" ‖ box_id u64 LE ‖ len(account) u32 LE ‖ account ‖ max_price u128 LE ‖ salt[32])
 * The timelock payload is max_price u128 LE ‖ salt[32], encrypted to the quicknet round at close_at.
 * The salt never leaves this module except inside the ciphertext.
 */
import { Buffer, defaultChainInfo, mainnetClient, roundAt, timelockDecrypt, timelockEncrypt } from 'tlock-js';
import { hex } from '@/lib/format';

const DOMAIN = new TextEncoder().encode('plunk:v1');
export const MAX_TLOCK_LEN = 1024;

function u64le(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, true);
  return out;
}

function u32le(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, true);
  return out;
}

export function u128le(n: bigint): Uint8Array {
  const out = new Uint8Array(16);
  const dv = new DataView(out.buffer);
  dv.setBigUint64(0, n & ((1n << 64n) - 1n), true);
  dv.setBigUint64(8, n >> 64n, true);
  return out;
}

export function readU128le(bytes: Uint8Array): bigint {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, 16);
  return dv.getBigUint64(0, true) + (dv.getBigUint64(8, true) << 64n);
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export type CommitInput = { boxId: number; account: string; maxPrice: bigint; salt: Uint8Array };

/** Lowercase hex sha256 of the R10 preimage, computed with Web Crypto. */
export async function commitHash({ boxId, account, maxPrice, salt }: CommitInput): Promise<string> {
  if (salt.length !== 32) throw new Error('salt must be 32 bytes');
  const acct = new TextEncoder().encode(account);
  const pre = concat([DOMAIN, u64le(BigInt(boxId)), u32le(acct.length), acct, u128le(maxPrice), salt]);
  const digest = await crypto.subtle.digest('SHA-256', pre);
  return hex(new Uint8Array(digest));
}

export function newSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** drand quicknet round that becomes public at `closeAtNs` (block time, nanoseconds). */
export function roundForClose(closeAtNs: number): number {
  return roundAt(Math.ceil(closeAtNs / 1e6), defaultChainInfo);
}

export type SealedBidMsg = { box_id: number; kind: 'sealed'; commit: string; tlock: string };

/** Builds the sealed `ft_transfer_call` msg. The salt is created here and discarded with the call stack. */
export async function sealBid(boxId: number, account: string, maxPrice: bigint, closeAtNs: number): Promise<SealedBidMsg> {
  const salt = newSalt();
  const commit = await commitHash({ boxId, account, maxPrice, salt });
  const payload = Buffer.from(concat([u128le(maxPrice), salt]));
  const tlock = await timelockEncrypt(roundForClose(closeAtNs), payload, mainnetClient());
  if (tlock.length > MAX_TLOCK_LEN) throw new Error(`ciphertext is ${tlock.length} bytes, over the ${MAX_TLOCK_LEN} limit`);
  return { box_id: boxId, kind: 'sealed', commit, tlock };
}

export type Revealed = { maxPrice: bigint; saltHex: string };

/** Decrypts a stored ciphertext once its round is out. Throws before that, or on junk. */
export async function unseal(tlock: string): Promise<Revealed> {
  const plain = new Uint8Array(await timelockDecrypt(tlock, mainnetClient()));
  if (plain.length !== 48) throw new Error('unexpected payload length');
  return { maxPrice: readU128le(plain.subarray(0, 16)), saltHex: hex(plain.subarray(16)) };
}
