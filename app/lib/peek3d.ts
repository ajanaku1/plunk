import * as THREE from 'three';

/**
 * Peek in 3D, built from the brand mark (brand/marks/peek.svg): a smooth green body, a dark band, an overhanging lid that floats just above it
 * on a back hinge, and two purple eyes in the gap. Parametric, with clear-coat paint, so each part can be animated.
 * Loaded on demand by components/board/PeekBox.tsx; the flat <Peek> stays as the fallback.
 */
export type PeekState = 'bidding' | 'reveal' | 'opening' | 'open' | 'failed';
export type PeekController = { setState: (s: PeekState) => void; bid: () => void; dispose: () => void };

const GREEN = '#2ee89c';
const INK = '#1b1626';
const GREY = '#6f6a80';
const BODY_H = 0.314;
const CZ = 0.009;

function roundedRect(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function slab(w: number, d: number, h: number, r: number, bevel: number): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bevel, d - 2 * bevel, r), { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 8, curveSegments: 20 });
  g.translate(0, 0, bevel);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A tiny studio baked into an environment map, so the clear coat has something to reflect without downloading a light map. */
function studio(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  env.background = new THREE.Color('#14101c');
  const panel = (w: number, h: number, x: number, y: number, z: number, color: THREE.Color, rx: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    env.add(m);
  };
  panel(6, 3, 0, 5, 0, new THREE.Color(6, 6, 6), Math.PI / 2, 0);
  panel(3, 5, -4, 1, 1, new THREE.Color(3, 3.2, 3.4), 0, Math.PI / 2);
  panel(3, 5, 4, 1, -1, new THREE.Color(1.2, 0.8, 3), 0, -Math.PI / 2);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env).texture;
  pm.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose();
  });
  return tex;
}

export function mountPeek(host: HTMLElement, initial: PeekState, opts: { follow?: boolean } = {}): PeekController {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  camera.position.set(0, 0.7, 2.25);
  camera.lookAt(0, 0.3, 0);
  scene.environment = studio(renderer);
  scene.environmentIntensity = 0.9;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2336, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-1.2, 2, 2);
  scene.add(key);

  const group = new THREE.Group();
  scene.add(group);
  const paint = new THREE.MeshPhysicalMaterial({ color: GREEN, roughness: 0.34, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.22 });
  const body = new THREE.Mesh(slab(0.826, 0.408, BODY_H, 0.07, 0.022), paint);
  body.position.set(0, 0, CZ);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.004, 0.33), new THREE.MeshStandardMaterial({ color: '#1c1826', roughness: 0.9 }));
  plate.position.set(0, BODY_H + 0.002, CZ);
  const hinge = new THREE.Group();
  const base = BODY_H + 0.004;
  hinge.position.set(0, base, CZ - 0.25);
  const lid = new THREE.Mesh(slab(0.92, 0.5, 0.048, 0.07, 0.014), paint);
  lid.position.set(0, 0, 0.25);
  hinge.add(lid);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#9b6bff' });
  const eyes = new THREE.Group();
  const eyeMeshes = [-0.1, 0.1].map((x) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), eyeMat);
    e.position.set(x, 0, 0);
    eyes.add(e);
    return e;
  });
  eyes.position.set(0, BODY_H + 0.022, CZ + 0.14);
  group.add(body, plate, hinge, eyes);

  let state = initial;
  let hop = 0;
  let gap = 0.04;
  let angle = 0;
  let lx = 0;
  let ly = 0;
  let t = 0;
  let raf = 0;
  let visible = true;
  const target = new THREE.Color();
  const pointer = { x: 0, y: 0 };
  const onMove = (e: PointerEvent) => {
    const b = host.getBoundingClientRect();
    pointer.x = Math.max(-1, Math.min(1, (e.clientX - (b.left + b.width / 2)) / 600));
    pointer.y = Math.max(-1, Math.min(1, (e.clientY - (b.top + b.height / 2)) / 600));
  };
  if (opts.follow !== false && !reduce) addEventListener('pointermove', onMove);

  const size = () => {
    const w = host.clientWidth || 200;
    const h = host.clientHeight || 200;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(host);
  const io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
  });
  io.observe(host);

  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!reduce) t += dt;
    else t = 1.2;
    const goal: Record<PeekState, [number, number]> = {
      bidding: [0.045 + 0.012 * Math.sin(t * 2), 0],
      reveal: [0.02 + 0.01 * Math.sin(t * 18), 0],
      opening: [0.03, 0.25],
      open: [0.05, 1.2],
      failed: [0.004, 0],
    };
    const [g, a] = goal[state];
    gap += (g + hop * 0.04 - gap) * 0.16;
    angle += (a - angle) * 0.12;
    hop *= 0.88;
    hinge.position.y = base + gap;
    hinge.rotation.x = -angle;
    eyes.visible = state === 'bidding' || state === 'reveal' || state === 'opening' || state === 'open' || gap > 0.02;
    eyes.scale.setScalar(state === 'open' ? 1.25 : 1);
    lx += (pointer.x - lx) * 0.12;
    ly += (pointer.y - ly) * 0.12;
    eyeMeshes.forEach((e, i) => {
      e.position.x = (i ? 0.1 : -0.1) + lx * 0.035;
      e.scale.y = !reduce && state === 'bidding' && Math.sin(t * 1.4) > 0.985 ? 0.12 : 1.1;
    });
    target.set(state === 'open' ? INK : state === 'failed' ? GREY : GREEN);
    paint.color.lerp(target, reduce ? 1 : 0.08);
    const shake = state === 'reveal' ? Math.sin(t * 40) * 0.008 : 0;
    group.rotation.y = -0.5 + Math.sin(t * 0.5) * 0.12 + lx * 0.5 + shake;
    group.rotation.x = ly * 0.08;
    group.position.y = Math.sin(t * 1.4) * 0.01;
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    setState: (s) => {
      state = s;
    },
    bid: () => {
      hop = 1;
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
      ro.disconnect();
      io.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      (scene.environment as THREE.Texture | null)?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
