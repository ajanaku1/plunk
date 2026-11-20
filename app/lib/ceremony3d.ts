import * as THREE from 'three';
import { tickerHue } from '@/lib/board';

/**
 * The opening moment: a burst of the token's own coins over the page, falling, bouncing, then gone in about four seconds.
 * Built on three (already loaded for the 3D Peek); no physics library, just gravity and a floor.
 * Returns a function that stops it early and removes everything.
 */
export type BurstOptions = { image?: string; ticker: string; count?: number; onDone?: () => void };

const LIFE = 4.2;
const FADE = 0.9;

function lettersTexture(ticker: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = `hsl(${tickerHue(ticker.toUpperCase())} 45% 28%)`;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#f3f0fa';
    g.font = '900 120px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ticker.slice(0, 2).toUpperCase(), 128, 134);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function loadArt(image: string | undefined, ticker: string): Promise<THREE.Texture> {
  return new Promise((resolve) => {
    if (!image) return resolve(lettersTexture(ticker));
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      image,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        resolve(t);
      },
      undefined,
      () => resolve(lettersTexture(ticker)),
    );
  });
}

type Coin = { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; born: number };

export function playOpening(opts: BurstOptions): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    opts.onDone?.();
    return () => undefined;
  }
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '60' });
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
  camera.position.set(0, 0, 14);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3150, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(-3, 6, 8);
  scene.add(key);

  let alive = true;
  let raf = 0;
  const coins: Coin[] = [];
  const disposables: { dispose: () => void }[] = [];
  let floor = -4.5;
  let half = { w: 8, h: 5 };

  const size = () => {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const hh = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    half = { w: hh * camera.aspect, h: hh };
    floor = -hh + 0.55;
  };
  size();
  addEventListener('resize', size);

  const stop = () => {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    removeEventListener('resize', size);
    disposables.forEach((d) => d.dispose());
    scene.clear();
    renderer.dispose();
    canvas.remove();
    opts.onDone?.();
  };

  void loadArt(opts.image, opts.ticker).then((art) => {
    if (!alive) return art.dispose();
    disposables.push(art);
    const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.13, 40);
    const edge = new THREE.MeshStandardMaterial({ color: '#2ee89c', metalness: 0.5, roughness: 0.35, transparent: true });
    const face = new THREE.MeshStandardMaterial({ map: art, emissive: '#ffffff', emissiveMap: art, emissiveIntensity: 0.6, color: '#bbbbbb', roughness: 0.5, metalness: 0, transparent: true });
    disposables.push(geo, edge, face);
    const n = opts.count ?? (innerWidth < 600 ? 22 : 38);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(geo, [edge, face, face]);
      const born = (i / n) * 0.9;
      mesh.position.set((Math.random() - 0.5) * 1.6, half.h * 0.55, (Math.random() - 0.5) * 2);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      mesh.visible = false;
      scene.add(mesh);
      coins.push({ mesh, born, v: new THREE.Vector3((Math.random() - 0.5) * half.w * 0.9, 1 + Math.random() * 3, (Math.random() - 0.5) * 2), spin: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12) });
    }
    let last = t0;
    const frame = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = (now - t0) / 1000;
      for (const c of coins) {
        if (t < c.born) continue;
        c.mesh.visible = true;
        c.v.y -= 14 * dt;
        c.mesh.position.addScaledVector(c.v, dt);
        c.mesh.rotation.x += c.spin.x * dt;
        c.mesh.rotation.y += c.spin.y * dt;
        c.mesh.rotation.z += c.spin.z * dt;
        if (c.mesh.position.y < floor && c.v.y < 0) {
          c.mesh.position.y = floor;
          c.v.y *= -0.45;
          c.v.x *= 0.7;
          c.spin.multiplyScalar(0.6);
        }
        if (Math.abs(c.mesh.position.x) > half.w - 0.5) c.v.x *= -0.6;
      }
      const fade = t > LIFE - FADE ? Math.max(0, (LIFE - t) / FADE) : 1;
      edge.opacity = face.opacity = fade;
      renderer.render(scene, camera);
      if (t >= LIFE) stop();
    };
    raf = requestAnimationFrame(frame);
  });
  return stop;
}
