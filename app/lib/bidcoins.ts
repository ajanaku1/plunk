import * as THREE from 'three';

/** The currencies a bid can arrive in. Each bid is drawn as a coin with that currency's mark. */
export type BidKind = 'near' | 'sol' | 'usdc';
export const BID_KINDS: BidKind[] = ['near', 'sol', 'usdc'];
/** A coin with no currency mark: what a live bid shows, because the page does not know the currency a bid came in. */
export type CoinKind = BidKind | 'plain';

const S = 128;

function mark(x: CanvasRenderingContext2D, kind: CoinKind) {
  const c = S / 2;
  if (kind === 'plain') {
    x.fillStyle = '#9B6BFF';
    x.beginPath();
    x.arc(c, c, 58, 0, Math.PI * 2);
    x.fill();
  } else if (kind === 'near') {
    // a white coin with the black N
    x.fillStyle = '#f2f2f2';
    x.beginPath();
    x.arc(c, c, 58, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#0b0b0b';
    x.beginPath();
    x.moveTo(40, 94);
    x.lineTo(40, 34);
    x.lineTo(52, 34);
    x.lineTo(76, 68);
    x.lineTo(76, 34);
    x.lineTo(88, 34);
    x.lineTo(88, 94);
    x.lineTo(76, 94);
    x.lineTo(52, 60);
    x.lineTo(52, 94);
    x.closePath();
    x.fill();
  } else if (kind === 'sol') {
    // three slanted bars on near-black, green to purple
    x.fillStyle = '#15111f';
    x.beginPath();
    x.arc(c, c, 58, 0, Math.PI * 2);
    x.fill();
    const g = x.createLinearGradient(30, 98, 98, 30);
    g.addColorStop(0, '#14f195');
    g.addColorStop(1, '#9945ff');
    x.fillStyle = g;
    const bar = (y: number, lean: 1 | -1) => {
      const s = 10 * lean;
      x.beginPath();
      x.moveTo(30 + Math.max(s, 0), y);
      x.lineTo(98 + Math.min(s, 0), y);
      x.lineTo(98 - Math.max(s, 0), y + 15);
      x.lineTo(30 - Math.min(s, 0), y + 15);
      x.closePath();
      x.fill();
    };
    bar(31, 1);
    bar(56, -1);
    bar(81, 1);
  } else {
    // the blue coin with a white $ and two arcs
    x.fillStyle = '#2775ca';
    x.beginPath();
    x.arc(c, c, 58, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#fff';
    x.lineWidth = 6;
    x.lineCap = 'round';
    x.beginPath();
    x.arc(c, c, 40, Math.PI * 0.62, Math.PI * 1.38);
    x.stroke();
    x.beginPath();
    x.arc(c, c, 40, -Math.PI * 0.38, Math.PI * 0.38);
    x.stroke();
    x.fillStyle = '#fff';
    x.font = '900 52px sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('$', c, c + 3);
  }
  // rim and a soft top-left highlight so it reads as a coin
  x.lineWidth = 5;
  x.strokeStyle = 'rgba(255,255,255,.55)';
  x.beginPath();
  x.arc(c, c, 58, 0, Math.PI * 2);
  x.stroke();
  const h = x.createRadialGradient(46, 42, 4, 46, 42, 70);
  h.addColorStop(0, 'rgba(255,255,255,.28)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = h;
  x.beginPath();
  x.arc(c, c, 58, 0, Math.PI * 2);
  x.fill();
}

/** One round, transparent texture per currency, plus the unmarked coin. */
export function bidCoinTextures(): Record<CoinKind, THREE.Texture> {
  const out = {} as Record<CoinKind, THREE.Texture>;
  for (const k of [...BID_KINDS, 'plain'] as CoinKind[]) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    mark(c.getContext('2d')!, k);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    out[k] = t;
  }
  return out;
}
