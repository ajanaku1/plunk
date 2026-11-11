import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Plunk · fair meme launches on NEAR';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The share card: black ground, the box mark in green, one line of promise. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#0E0B14', color: '#F4F1FA', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#2EE89C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 36, height: 26, borderRadius: 4, background: '#0E0B14' }} />
          </div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>plunk</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>Everyone pays one price.</div>
          <div style={{ fontSize: 32, color: '#A79FBA' }}>Sealed-bid meme launches on NEAR. No sniping, no bonding-curve race.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: '#9B6BFF' }}>
          <span>plunk · fair meme launches</span>
          <span>NEAR</span>
        </div>
      </div>
    ),
    size,
  );
}
