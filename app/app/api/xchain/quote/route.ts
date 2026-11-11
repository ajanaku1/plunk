/**
 * T030 (FR-027): POST = 1Click quote proxy with the 5-minute cutoff and the existing-account
 * check. GET ?depositAddress= proxies the status; GET ?tokens=1 lists 1Click's assets (cached).
 */
import { JsonRpcProvider } from 'near-api-js';
import { NextResponse } from 'next/server';
import { launchpadId, networkId, rpcUrls } from '@/config';
import type { Config, LaunchBox } from '@/lib/launchpad';
import { ONE_CLICK } from '@/lib/xchain';
import { handleQuote, postOneClick } from './handler';

export const dynamic = 'force-dynamic';

const rpc = () => new JsonRpcProvider({ url: rpcUrls[networkId][0] });

async function wnear(): Promise<string> {
  const c = (await rpc().callFunction({ contractId: launchpadId, method: 'get_config', args: {} })) as Config;
  return c.wnear;
}

export async function POST(req: Request): Promise<NextResponse> {
  const raw = await req.json().catch(() => null);
  try {
    const reply = await handleQuote(raw, {
      launchpadId,
      wnear: await wnear(),
      getBox: async (id) => (await rpc().callFunction({ contractId: launchpadId, method: 'get_box', args: { id } })) as LaunchBox | null,
      accountExists: (id) => rpc().viewAccount({ accountId: id }).then(() => true, () => false),
      oneClick: postOneClick,
      now: Date.now,
    });
    return NextResponse.json(reply.body, { status: reply.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'quote failed' }, { status: 502 });
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const deposit = url.searchParams.get('depositAddress');
  try {
    if (url.searchParams.get('tokens')) {
      const r = await fetch(`${ONE_CLICK}/v0/tokens`, { next: { revalidate: 3600 } });
      return NextResponse.json(await r.json(), { status: r.status, headers: { 'Cache-Control': 's-maxage=3600' } });
    }
    if (deposit) {
      const r = await fetch(`${ONE_CLICK}/v0/status?depositAddress=${encodeURIComponent(deposit)}`, { cache: 'no-store' });
      return NextResponse.json(await r.json(), { status: r.status });
    }
    return NextResponse.json({ error: 'pass ?tokens=1 or ?depositAddress=' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '1Click unreachable' }, { status: 502 });
  }
}
