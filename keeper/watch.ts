/**
 * Watch job: reads every box and exits non-zero when one needs a person (closed but never opened,
 * stuck opening, harvests missed) or the launchpad is paused. A failed scheduled run is the alert:
 * GitHub emails the repo owner. Read-only, so it needs no key. Env: NEAR_NETWORK, LAUNCHPAD_ID.
 */
import { JsonRpcProvider } from 'near-api-js';
import { problems, type WatchedBox } from './health.ts';

const RPC: Record<string, string> = { testnet: 'https://test.rpc.fastnear.com', mainnet: 'https://free.rpc.fastnear.com' };
const PAGE = 50;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function allBoxes(rpc: JsonRpcProvider, launchpad: string): Promise<WatchedBox[]> {
  const out: WatchedBox[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await rpc.callFunction<WatchedBox[]>({ contractId: launchpad, method: 'list_boxes', args: { from, limit: PAGE } });
    if (!page || page.length === 0) return out;
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/** False on a launchpad deployed before the guard existed. */
async function paused(rpc: JsonRpcProvider, launchpad: string): Promise<boolean> {
  try {
    const g = await rpc.callFunction<{ paused: boolean }>({ contractId: launchpad, method: 'get_guard', args: {} });
    return g?.paused === true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const url = RPC[env('NEAR_NETWORK')];
  if (!url) throw new Error('NEAR_NETWORK must be testnet or mainnet');
  const launchpad = env('LAUNCHPAD_ID');
  const rpc = new JsonRpcProvider({ url });
  const boxes = await allBoxes(rpc, launchpad);
  const found = problems(boxes, Date.now() * 1e6);
  if (await paused(rpc, launchpad)) found.push(`${launchpad} is paused: no new boxes or bids`);
  for (const p of found) console.error(`ALERT ${p}`);
  console.log(`watched ${boxes.length} box(es) on ${launchpad}: ${found.length} problem(s)`);
  if (found.length > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
