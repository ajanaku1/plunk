import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BoxView } from '@/components/box/BoxView';
import { launchpadId, networkId, rpcUrls } from '@/config';
import { makeRpc } from '@/lib/rpc';
import type { LaunchBox } from '@/lib/launchpad';

type Params = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  return /^\d{1,12}$/.test(raw) ? Number(raw) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  try {
    const rpc = makeRpc(rpcUrls[networkId]);
    const box = (await rpc.callFunction({ contractId: launchpadId, method: 'get_box', args: { id: Number(id) } })) as LaunchBox | null;
    if (box) return { title: `${box.meta.name} $${box.meta.ticker.toUpperCase()}`, description: `Box #${id} on Plunk: one clearing price for everyone.` };
  } catch {
    // fall through to the generic title
  }
  return { title: `Box #${id}` };
}

export default async function BoxPage({ params }: Params) {
  const id = parseId((await params).id);
  if (id === null) notFound();
  return <BoxView id={id} />;
}
