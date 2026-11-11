/**
 * T028 (R7): hourly OHLC for a box's pool. Source: the reserve snapshots the launchpad records at
 * each harvest (`box.snapshots`), read server-side and cached for a minute. The client appends a
 * live tail from `get_pool`. Swap-level history from an indexer is a later improvement; FastNEAR's
 * account history API (tx.*.fastnear.com) lists transaction hashes but not swap amounts.
 */
import { JsonRpcProvider } from 'near-api-js';
import { NextResponse } from 'next/server';
import { launchpadId, networkId, rpcUrls } from '@/config';
import type { LaunchBox } from '@/lib/launchpad';
import { candlesFrom, pricePerM } from '@/lib/pool';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const id = Number(new URL(req.url).searchParams.get('box'));
  if (!Number.isInteger(id) || id < 0) return NextResponse.json({ error: 'box must be a non-negative integer' }, { status: 400 });
  try {
    const rpc = new JsonRpcProvider({ url: rpcUrls[networkId][0] });
    const box = (await rpc.callFunction({ contractId: launchpadId, method: 'get_box', args: { id } })) as LaunchBox | null;
    if (!box) return NextResponse.json({ error: 'no such box' }, { status: 404 });
    const points = box.snapshots.map((s) => ({ time: Math.floor(s.ts / 1e9), price: pricePerM({ x: BigInt(s.reserves[0]), y: BigInt(s.reserves[1]) }) }));
    return NextResponse.json({ candles: candlesFrom(points), source: 'harvest-snapshots' }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'rpc failed' }, { status: 502 });
  }
}
