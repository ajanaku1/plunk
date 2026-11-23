import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { launchpadId, networkId, rpcUrls } from '@/config';
import { artUri, gatewayHost } from '@/lib/artdata';
import { tickerHue } from '@/lib/board';
import { type LaunchBox, stateOf } from '@/lib/launchpad';
import { makeRpc } from '@/lib/rpc';
import { cardCopy } from '@/lib/sharecard';

export const alt = 'A Plunk box: sealed bids, one clearing price';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 60;

const font = (file: string) => readFile(join(process.cwd(), 'assets', 'fonts', file));

function Tiles({ text, h }: { text: string; h: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {[...text].map((c, i) =>
        /[0-9A-Za-z]/.test(c) ? (
          <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: h * 0.7, height: h, marginRight: 6, borderRadius: h * 0.1, background: '#2E2640', color: '#F4F1FA', fontSize: h * 0.82, fontWeight: 900 }}>
            {c}
            <div style={{ position: 'absolute', left: 0, right: 0, top: h / 2 - 1, height: 2, background: '#0A0710' }} />
          </div>
        ) : (
          <div key={i} style={{ display: 'flex', width: h * 0.3, justifyContent: 'center', color: '#F4F1FA', fontSize: h * 0.82, fontWeight: 900, marginRight: 6 }}>{c}</div>
        ),
      )}
    </div>
  );
}

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
  const art = box.meta.image ? await artUri(box.meta.image, gatewayHost(process.env.PINATA_GATEWAY)) : null;
  const tone = TONE[copy.tone];
  const fonts = [
    { name: 'Archivo', data: await font('archivo-800.woff'), weight: 800 as const, style: 'normal' as const },
    { name: 'Archivo', data: await font('archivo-900.woff'), weight: 900 as const, style: 'normal' as const },
  ];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 56, background: ink, color: '#F4F1FA', fontFamily: 'Archivo' }}>
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
            <div style={{ display: 'flex', fontSize: box.meta.name.length > 14 ? 68 : 92, fontWeight: 900, lineHeight: 1, letterSpacing: -3 }}>{box.meta.name}</div>
            <div style={{ display: 'flex', fontSize: 32, color: '#A79FBA' }}>${ticker}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 22 }}>
              <div style={{ display: 'flex', fontSize: 24, color: '#A79FBA', letterSpacing: 2 }}>{copy.label.toUpperCase()}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <Tiles text={copy.value} h={96} />
                <div style={{ display: 'flex', fontSize: 28, fontWeight: 800, color: '#A79FBA', width: 120, lineHeight: 1.1 }}>{copy.unit}</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#A79FBA' }}>
          <span>{copy.sub}</span>
          <span style={{ color: '#9B6BFF' }}>Everyone pays one price</span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
