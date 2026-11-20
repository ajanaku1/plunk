import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'Plunk · fair meme launches on NEAR';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The share card: black ground, the box mark in green, one line of promise. */
const font = (file: string) => readFile(join(process.cwd(), 'assets', 'fonts', file));

export default async function OpenGraphImage() {
  const fonts = [
    { name: 'Archivo', data: await font('archivo-800.woff'), weight: 800 as const, style: 'normal' as const },
    { name: 'Archivo', data: await font('archivo-900.woff'), weight: 900 as const, style: 'normal' as const },
  ];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#0E0B14', color: '#F4F1FA', fontFamily: 'Archivo' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#2EE89C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 36, height: 26, borderRadius: 4, background: '#0E0B14' }} />
          </div>
          <div style={{ fontSize: 40, fontWeight: 900 }}>plunk</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1.05, letterSpacing: -2 }}>Everyone pays one price.</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#A79FBA' }}>Sealed-bid meme launches on NEAR. No sniping, no bonding-curve race.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, color: '#9B6BFF' }}>
          <span>plunk · fair meme launches</span>
          <span>NEAR</span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
