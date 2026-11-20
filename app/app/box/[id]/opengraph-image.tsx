import { ImageResponse } from 'next/og';
import { launchpadId, networkId, rpcUrls } from '@/config';
import { artUri } from '@/lib/artdata';
import { tickerHue } from '@/lib/board';
import { type LaunchBox, stateOf } from '@/lib/launchpad';
import { makeRpc } from '@/lib/rpc';
import { cardCopy } from '@/lib/sharecard';

export const alt = 'A Plunk box: sealed bids, one clearing price';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 60;

const TONE = { live: '#9B6BFF', open: '#2EE89C', failed: '#FF5C7A' } as const;

export default async function BoxCardImage({ params }: { params: Promise<{ id: string }> }) {
  const raw = (await params).id;
  let box: LaunchBox | null = null;
  if (/^\d{1,12}$/.test(raw)) {
    try {
      box = (await makeRpc(rpcUrls[networkId]).callFunction({ contractId: launchpadId, method: 'get_box', args: { id: Number(raw) } })) as LaunchBox | null;
    } catch {
      box = null;
    }
  }
  const ink = '#0E0B14';
  if (!box) {
    return new ImageResponse(
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: ink, color: '#F4F1FA', fontSize: 64, fontWeight: 700 }}>plunk · box {raw}</div>,
      size,
    );
  }
  const state = stateOf(box, Date.now() * 1e6);
  const copy = cardCopy(box, state);
  const ticker = box.meta.ticker.toUpperCase();
  const art = box.meta.image ? await artUri(box.meta.image) : null;
  const tone = TONE[copy.tone];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 56, background: ink, color: '#F4F1FA', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#2EE89C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 26, height: 18, borderRadius: 3, background: ink }} />
            </div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>plunk</div>
          </div>
          <div style={{ display: 'flex', padding: '8px 20px', borderRadius: 999, border: `2px solid ${tone}`, color: tone, fontSize: 24, fontWeight: 700, letterSpacing: 3 }}>{copy.kicker}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 56 }}>
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art} width={300} height={300} alt="" style={{ borderRadius: 40, border: '6px solid #2A2338', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 300, height: 300, borderRadius: 40, border: '6px solid #2A2338', background: `hsl(${tickerHue(ticker)}, 45%, 28%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 130, fontWeight: 800 }}>{ticker.slice(0, 2)}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            <div style={{ display: 'flex', fontSize: box.meta.name.length > 14 ? 64 : 84, fontWeight: 800, lineHeight: 1, letterSpacing: -2 }}>{box.meta.name}</div>
            <div style={{ display: 'flex', fontSize: 32, color: '#A79FBA' }}>${ticker}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 22 }}>
              <div style={{ display: 'flex', fontSize: 24, color: '#A79FBA', letterSpacing: 2 }}>{copy.label.toUpperCase()}</div>
              <div style={{ display: 'flex', alignSelf: 'flex-start', padding: '6px 22px', borderRadius: 16, background: '#2E2640', fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>{copy.value}</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#A79FBA' }}>
          <span>{copy.sub}</span>
          <span style={{ color: '#9B6BFF' }}>Everyone pays one price</span>
        </div>
      </div>
    ),
    size,
  );
}
