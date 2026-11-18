/**
 * Reveal keeper (FR-007/009): during each box's 60 s reveal window, decrypts every sealed bid whose
 * drand round is out and submits `reveal` for it, so limit prices count even if nobody has the box
 * page open. Rooms last 2–10 minutes, so this polls continuously for REVEAL_WATCH_MINUTES (0 = one pass).
 * A function-call key may sign one action per transaction (nearcore verifier), so each reveal is its
 * own transaction. Env: NEAR_NETWORK, LAUNCHPAD_ID, KEEPER_ACCOUNT, KEEPER_KEY (allowed `reveal`).
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { Account, JsonRpcProvider } from 'near-api-js';
import { inRevealWindow, type RevealArgs, revealArgs, type SealedBox, type SealedView, unseal } from './sealed.ts';

type KeyPairString = `ed25519:${string}` | `secp256k1:${string}`;
const RPC: Record<string, string> = { testnet: 'https://test.rpc.fastnear.com', mainnet: 'https://free.rpc.fastnear.com' };
const PAGE = 50;
const POLL_MS = 4_000;
const REVEAL_GAS = 30_000_000_000_000n;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function revealable(rpc: JsonRpcProvider, launchpad: string, nowNs: number): Promise<SealedBox[]> {
  const out: SealedBox[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await rpc.callFunction<SealedBox[]>({ contractId: launchpad, method: 'list_boxes', args: { from, limit: PAGE } });
    if (!page || page.length === 0) return out;
    out.push(...page.filter((b) => inRevealWindow(b, nowNs)));
    if (page.length < PAGE) return out;
  }
}

/** Decrypts or returns null: the round may land a few seconds after close, so a failure is retried next poll. */
async function tryUnseal(boxId: number, s: SealedView): Promise<RevealArgs | null> {
  try {
    return revealArgs(boxId, s.bid_id, await unseal(s.tlock));
  } catch {
    return null;
  }
}

/** Reveals what it can for one box. `get_sealed` drops revealed bids; `tried` stops repeat reveal attempts. */
async function revealBox(rpc: JsonRpcProvider, keeper: Account, launchpad: string, box: SealedBox, tried: Set<string>): Promise<number> {
  const sealed = (await rpc.callFunction<SealedView[]>({ contractId: launchpad, method: 'get_sealed', args: { box_id: box.id, from: 0, limit: 200 } })) ?? [];
  let done = 0;
  for (const s of sealed) {
    const key = `${box.id}:${s.bid_id}`;
    if (tried.has(key)) continue;
    const args = await tryUnseal(box.id, s);
    if (!args) continue;
    tried.add(key);
    try {
      await keeper.callFunction({ contractId: launchpad, methodName: 'reveal', args, gas: REVEAL_GAS });
      done += 1;
    } catch (e) {
      console.error(`reveal failed for box ${box.id} bid ${s.bid_id}:`, e instanceof Error ? e.message : e);
    }
  }
  return done;
}

async function main(): Promise<void> {
  const url = RPC[env('NEAR_NETWORK')];
  if (!url) throw new Error('NEAR_NETWORK must be testnet or mainnet');
  const launchpad = env('LAUNCHPAD_ID');
  const rpc = new JsonRpcProvider({ url });
  const keeper = new Account(env('KEEPER_ACCOUNT'), rpc, env('KEEPER_KEY') as KeyPairString);
  const until = Date.now() + Number(process.env.REVEAL_WATCH_MINUTES ?? 0) * 60_000;
  const tried = new Set<string>();
  do {
    try {
      for (const box of await revealable(rpc, launchpad, Date.now() * 1e6)) {
        console.log(`box ${box.id}: revealed ${await revealBox(rpc, keeper, launchpad, box, tried)} sealed bid(s)`);
      }
    } catch (e) {
      console.error('poll failed:', e instanceof Error ? e.message : e);
    }
    if (Date.now() < until) await sleep(POLL_MS);
  } while (Date.now() < until);
  console.log('reveal watch ended');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
