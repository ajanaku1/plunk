/**
 * Hourly keeper (R6): calls the permissionless `harvest(box_id)` on every Open box.
 * `harvest` is a no-op if it already ran this epoch, so late or duplicate runs are harmless.
 * Env: NEAR_NETWORK (testnet|mainnet), LAUNCHPAD_ID, KEEPER_ACCOUNT, KEEPER_KEY
 * (a function-call-only key for `harvest`, kept in GitHub Actions secrets, never in the repo).
 */
import { Account, JsonRpcProvider } from 'near-api-js';

type KeyPairString = `ed25519:${string}` | `secp256k1:${string}`;
type BoxView = { id: number; phase: string; harvest: unknown };
const MAX_STEPS = 8;

const RPC: Record<string, string> = {
  testnet: 'https://test.rpc.fastnear.com',
  mainnet: 'https://free.rpc.fastnear.com',
};
const PAGE = 50;
const HARVEST_GAS = 300_000_000_000_000n;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function openBoxes(rpc: JsonRpcProvider, launchpad: string): Promise<number[]> {
  const ids: number[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await rpc.callFunction<BoxView[]>({ contractId: launchpad, method: 'list_boxes', args: { from, limit: PAGE } });
    if (!page || page.length === 0) return ids;
    ids.push(...page.filter((b) => b.phase === 'Open').map((b) => b.id));
    if (page.length < PAGE) return ids;
  }
}

/** A harvest that runs short of gas is resumed by calling again until `box.harvest` clears. */
async function harvestBox(rpc: JsonRpcProvider, keeper: Account, launchpad: string, box_id: number): Promise<number> {
  for (let step = 1; step <= MAX_STEPS; step++) {
    await keeper.callFunction({ contractId: launchpad, methodName: 'harvest', args: { box_id }, gas: HARVEST_GAS });
    const box = (await rpc.callFunction<BoxView>({ contractId: launchpad, method: 'get_box', args: { id: box_id } })) as BoxView | null;
    if (!box || box.harvest === null || box.harvest === undefined) return step;
  }
  throw new Error(`harvest still in flight after ${MAX_STEPS} transactions`);
}

async function main(): Promise<void> {
  const url = RPC[env('NEAR_NETWORK')];
  if (!url) throw new Error('NEAR_NETWORK must be testnet or mainnet');
  const launchpad = env('LAUNCHPAD_ID');
  const rpc = new JsonRpcProvider({ url });
  const keeper = new Account(env('KEEPER_ACCOUNT'), rpc, env('KEEPER_KEY') as KeyPairString);
  const ids = await openBoxes(rpc, launchpad);
  let failed = 0;
  for (const box_id of ids) {
    try {
      const steps = await harvestBox(rpc, keeper, launchpad, box_id);
      console.log(`harvested box ${box_id} in ${steps} transaction(s)`);
    } catch (e) {
      failed += 1;
      console.error(`harvest failed for box ${box_id}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`done: ${ids.length - failed}/${ids.length} open boxes harvested`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
