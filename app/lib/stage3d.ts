import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { tickerHue } from '@/lib/board';
import { BID_KINDS, bidCoinTextures } from '@/lib/bidcoins';
import { createPeek, studio } from '@/lib/peekmesh';
import { COINS_AT, SEAL_CRACK, SEAL_ON, poseAt } from '@/lib/timeline';

/**
 * The stage: the opening ceremony's 3D scene (ported from the approved prototype, mockups/board/ceremony.html) as something the page drives.
 * The caller passes a scene time on every frame (see lib/timeline.ts and lib/stagemap.ts), so the same scene can sit in a live room, replay, scrub or be filmed.
 * Bids arc into the box, the lid shuts, a wax seal is pressed on, the box trembles and light leaks out, the seal cracks, the lid swings open and
 * coins with the token's own art spill out under real physics. three and cannon-es load only when a stage mounts.
 */
export type StageOptions = {
  canvas: HTMLCanvasElement;
  image?: string;
  ticker: string;
  /** How many scripted orbs a replay shows (real bidder count, capped). */
  bidders: number;
  /** The film: the camera comes in closer so the box fills a video frame. */
  tight?: boolean;
};
export type Stage = {
  /** Draw scene time t (seconds on the 22 s timeline). `wall` is the wall clock in seconds for live orbs; `scripted` shows the film's own orbs. */
  render: (t: number, wall: number, scripted: boolean) => void;
  /** A real bid landed: one orb arcs into the box. */
  fireOrb: (wall: number) => void;
  resize: () => void;
  /** Pixel ratio, lowered when frames run slow. */
  setQuality: (ratio: number) => void;
  dispose: () => void;
};

const NCOINS = 22;
const NREF = 6;
const MAX_ORBS = 26;

function coinTexture(image: string | undefined, ticker: string): Promise<THREE.Texture> {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d')!;
    const finish = (img: HTMLImageElement | null) => {
      x.fillStyle = '#1b1626';
      x.fillRect(0, 0, 256, 256);
      x.save();
      x.beginPath();
      x.arc(128, 128, 112, 0, Math.PI * 2);
      x.clip();
      if (img) {
        x.drawImage(img, 16, 16, 224, 224);
      } else {
        x.fillStyle = `hsl(${tickerHue(ticker.toUpperCase())} 45% 28%)`;
        x.fillRect(0, 0, 256, 256);
        x.fillStyle = '#f3f0fa';
        x.font = '900 112px sans-serif';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(ticker.slice(0, 2).toUpperCase(), 128, 136);
      }
      x.restore();
      x.strokeStyle = '#2ee89c';
      x.lineWidth = 10;
      x.beginPath();
      x.arc(128, 128, 114, 0, Math.PI * 2);
      x.stroke();
      x.strokeStyle = '#0e0b14';
      x.lineWidth = 8;
      x.beginPath();
      x.arc(128, 128, 124, 0, Math.PI * 2);
      x.stroke();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      resolve(t);
    };
    if (!image || !/^(https:\/\/|data:image\/)/.test(image)) return finish(null);
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => finish(im.naturalWidth > 0 ? im : null);
    im.onerror = () => finish(null);
    im.src = image;
  });
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const eo = (x: number) => 1 - Math.pow(1 - x, 3);
const bez = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, k: number) =>
  a.clone().multiplyScalar((1 - k) * (1 - k)).add(b.clone().multiplyScalar(2 * (1 - k) * k)).add(c.clone().multiplyScalar(k * k));

export async function createStage(opts: StageOptions): Promise<Stage> {
  const { canvas } = opts;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0b14);
  scene.fog = new THREE.Fog(0x0e0b14, 6, 14);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
  // post-processing bypasses the canvas's own anti-aliasing, so the render target itself is multisampled
  const target = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0, 0.5, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const resize = () => {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  resize();
  const setQuality = (ratio: number) => {
    pixelRatio = ratio;
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
    resize();
  };

  const env = studio(renderer);
  scene.environment = env;
  scene.environmentIntensity = 0.9;
  // light: soft key from above-front, purple rim behind, a green light that lives inside the box (intensities x PI: three dropped its legacy lighting scale)
  const key = new THREE.SpotLight(0xfff3e0, 2.2 * Math.PI, 16, 0.85, 1, 1);
  key.position.set(-1.4, 3.4, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 16;
  key.shadow.focus = 1;
  key.target.position.set(0, 0.15, 0);
  scene.add(key, key.target);
  const rim = new THREE.PointLight(0x9b6bff, 2.0 * Math.PI, 9);
  rim.position.set(2.2, 1.2, -2);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x9a8fc0, 0x1a1428, 0.35 * Math.PI));
  const inner = new THREE.PointLight(0x2ee89c, 0, 5);
  inner.position.set(0, 0.22, 0.05);
  scene.add(inner);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d0a12, roughness: 0.8, metalness: 0.05, envMap: env, envMapIntensity: 0 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // the box
  const PK = createPeek();
  const crate = new THREE.Group();
  crate.add(PK.root);
  scene.add(crate);
  const { hinge, eyes } = PK;
  // light leaks: the only things allowed above 1, so the only things that bloom
  const leakMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.8, 1.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const mkLeak = (w: number, h: number, x: number, y: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), leakMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    crate.add(m);
  };
  const LY = 0.33;
  const LH = 0.03;
  mkLeak(0.74, LH, 0, LY, 0.218, 0);
  mkLeak(0.4, LH, 0.418, LY, 0.01, Math.PI / 2);
  mkLeak(0.4, LH, -0.418, LY, 0.01, -Math.PI / 2);
  mkLeak(0.74, LH, 0, LY, -0.2, Math.PI);
  // the wax seal, two halves so it can crack
  const waxMat = new THREE.MeshStandardMaterial({ color: 0x6a3df0, roughness: 0.5, metalness: 0.05, emissive: 0x1d0f4a, emissiveIntensity: 0.5 });
  const seal = new THREE.Group();
  const half = (a: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.016, 28, 1, false, a, Math.PI), waxMat);
    m.rotation.x = Math.PI / 2;
    m.castShadow = true;
    return m;
  };
  seal.add(half(0), half(Math.PI));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.004, 8, 28), waxMat);
  ring.position.z = 0.009;
  seal.add(ring);
  seal.position.set(0.2, 0.372, 0.12);
  seal.rotation.x = -Math.PI / 2;
  seal.visible = false;
  crate.add(seal);
  const shards = Array.from({ length: 7 }, () => {
    const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.014), waxMat);
    m.visible = false;
    scene.add(m);
    return m;
  });

  // each bid is a coin of the currency it came in (NEAR, Solana, USDC) that arcs into the gap
  const glow = glowTexture();
  const bidTex = bidCoinTextures();
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const norb = Math.max(8, Math.min(MAX_ORBS, opts.bidders || MAX_ORBS));
  const orbs = Array.from({ length: norb }, (_, i) => {
    const a = rnd() * Math.PI * 2;
    const r = 1.8 + rnd() * 0.9;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bidTex[BID_KINDS[(i * 2 + (i >> 2)) % 3]!], transparent: true, depthWrite: false }));
    sp.scale.setScalar(0.17);
    scene.add(sp);
    return { sp, from: new THREE.Vector3(Math.cos(a) * r, 0.5 + rnd() * 1.1, Math.sin(a) * r * 0.7 + 0.5), t0: 0.7 + i * (5.2 / norb), dur: 0.95 };
  });
  const mouth = new THREE.Vector3(0, 0.33, 0.12);
  const refunds = Array.from({ length: NREF }, (_, i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x8d879c, transparent: true, depthWrite: false }));
    sp.scale.setScalar(0.17);
    sp.visible = false;
    scene.add(sp);
    return { sp, ang: (i / NREF) * Math.PI - Math.PI / 2 + 0.3, t0: 12.9 + i * 0.12 };
  });

  // live orbs: one per real bid, fired by the page
  const liveOrbs = Array.from({ length: 14 }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: bidTex.near, transparent: true, depthWrite: false }));
    sp.visible = false;
    scene.add(sp);
    return { sp, from: new THREE.Vector3(), born: -1 };
  });
  let nextLive = 0;
  const fireOrb = (wall: number) => {
    const o = liveOrbs[nextLive++ % liveOrbs.length]!;
    const a = Math.random() * Math.PI * 2;
    o.from.set(Math.cos(a) * 2.2, 0.6 + Math.random() * 1.0, Math.sin(a) * 1.6 + 0.5);
    o.born = wall;
    o.sp.material.map = bidTex[BID_KINDS[Math.floor(Math.random() * 3)]!];
  };

  // coins: real discs with the token's art, real physics
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.8, 0) });
  world.allowSleep = true;
  const cm = new CANNON.Material('c');
  world.defaultContactMaterial = new CANNON.ContactMaterial(cm, cm, { friction: 0.55, restitution: 0.3 });
  const fl = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: cm });
  fl.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(fl);
  const wall = (x: number, z: number, hx: number, hz: number) => {
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(hx, 1.5, hz)), material: cm });
    b.position.set(x, 1.5, z);
    world.addBody(b);
  };
  wall(1.25, 0.4, 0.05, 1.2);
  wall(-1.25, 0.4, 0.05, 1.2);
  wall(0, 1.25, 1.3, 0.05);
  wall(0, -0.9, 1.3, 0.05);
  const cb = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.41, 0.157, 0.2)), material: cm });
  cb.position.set(0, 0.157, 0);
  world.addBody(cb);

  const art = await coinTexture(opts.image, opts.ticker);
  const coinGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.02, 48);
  const sideM = new THREE.MeshStandardMaterial({ color: 0x1b1626, roughness: 0.3, metalness: 0.7, envMap: env, envMapIntensity: 1 });
  const faceM = new THREE.MeshStandardMaterial({ map: art, roughness: 0.55, metalness: 0.1, envMap: env, envMapIntensity: 0.3 });
  // cannon's cylinder may lie along Y or Z depending on version; find which and align the mesh to it
  const probe = new CANNON.Cylinder(0.095, 0.095, 0.02, 16);
  const ext = [0, 1, 2].map((a) => Math.max(...probe.vertices.map((v) => Math.abs([v.x, v.y, v.z][a]!))));
  const thin = ext.indexOf(Math.min(...ext));
  const align = new CANNON.Quaternion(0, 0, 0, 1);
  if (thin === 2) align.setFromEuler(Math.PI / 2, 0, 0);
  const coins = Array.from({ length: NCOINS }, (_, i) => {
    const mesh = new THREE.Mesh(coinGeo, [sideM, faceM, faceM]);
    mesh.castShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    const body = new CANNON.Body({ mass: 0.05, shape: new CANNON.Cylinder(0.095, 0.095, 0.02, 16), material: cm, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.35, angularDamping: 0.35, linearDamping: 0.22 });
    return { mesh, body, t0: COINS_AT + i * 0.07, spawned: false };
  });
  const pr = (n: number) => {
    seed = n * 7919 + 13;
    return rnd();
  };

  let simT = 0;
  const dt = 1 / 60;
  const physicsTo = (t: number) => {
    if (t < simT) {
      coins.forEach((c) => {
        c.spawned = false;
        c.mesh.visible = false;
        if (c.body.world) world.removeBody(c.body);
        c.body.velocity.set(0, 0, 0);
        c.body.angularVelocity.set(0, 0, 0);
        c.body.wakeUp();
      });
      simT = 0;
    }
    while (simT < t) {
      simT += dt;
      coins.forEach((c, i) => {
        if (c.spawned || simT < c.t0) return;
        c.spawned = true;
        const a = (pr(i * 3 + 1) - 0.5) * 2.5;
        const sp = 0.3 + pr(i * 3 + 2) * 0.75;
        c.body.position.set(0.05 * Math.cos(a), 0.42, 0.08 + 0.05 * Math.sin(a));
        c.body.velocity.set(Math.sin(a) * sp * 1.1, 3.2 + pr(i * 3 + 3), Math.abs(Math.cos(a)) * sp * 0.9 + 0.3);
        c.body.angularVelocity.set((pr(i + 40) - 0.5) * 14, (pr(i + 60) - 0.5) * 8, (pr(i + 80) - 0.5) * 14);
        c.body.quaternion.setFromEuler(pr(i + 7) * 6, pr(i + 9) * 6, pr(i + 11) * 6);
        world.addBody(c.body);
        c.mesh.visible = true;
      });
      world.step(dt);
    }
  };

  const pulse = (t: number, wall: number, scripted: boolean) => {
    let p = 0;
    const hit = (arrive: number, now: number) => {
      const d = now - arrive;
      if (d > 0 && d < 0.35) p = Math.max(p, Math.exp(-d * 9));
    };
    if (scripted) orbs.forEach((o) => hit(o.t0 + o.dur, t));
    liveOrbs.forEach((o) => o.born >= 0 && hit(o.born + 0.95, wall));
    return p;
  };

  const render = (t: number, wall: number, scripted: boolean) => {
    const S = poseAt(t);
    physicsTo(t);
    const sh = S.shake * (0.004 + (0.008 * (t - 7.8)) / 4);
    crate.position.set(Math.sin(t * 61) * sh, Math.sin(t * 47) * sh * 0.5 + S.hop * 0.012 * Math.sin(S.hop * 3), Math.cos(t * 53) * sh);
    crate.scale.y = 1 - 0.03 * pulse(t, wall, scripted);
    const g = Math.min(1, S.lid / 0.16);
    hinge.position.y = PK.base + 0.046 * g + 0.012 * S.shake;
    hinge.rotation.x = -(S.lid > 0.16 ? S.lid : S.lid * 0.2);
    eyes.visible = S.lid > 0.03 || t > 11.7;
    eyes.position.y = PK.BODY_H + 0.022 + Math.min(0.03, Math.max(0, S.lid - 0.16) * 0.04);
    eyes.scale.setScalar(t > 11.8 ? 1.25 : 1);
    leakMat.opacity = Math.min(1, S.leak);
    inner.intensity = S.inner * 1.8 * Math.PI;
    bloom.strength = S.bloom * (opts.tight ? 0.55 : 1);
    bloom.radius = 0.55;
    bloom.threshold = 1.0;
    seal.visible = t >= SEAL_ON && S.crack < 1;
    seal.position.y = 0.372 + S.sealY;
    shards.forEach((m, i) => {
      if (t < SEAL_CRACK) {
        m.visible = false;
        return;
      }
      m.visible = t < SEAL_CRACK + 1.4;
      const k = t - SEAL_CRACK;
      const ang = (i / 7) * Math.PI * 2;
      m.position.set(0.2 + Math.cos(ang) * 0.25 * k, 0.31 + 0.5 * k - 1.9 * k * k + 0.05, 0.23 + Math.sin(ang) * 0.12 * k + 0.2 * k);
      m.rotation.set(k * 9, k * 7, k * 5);
    });
    const pk = (cam.aspect < 1.5 ? 1 + (1.5 - cam.aspect) * 0.75 : cam.aspect > 2 ? 0.8 : 1) * (opts.tight ? 0.85 : 1);
    cam.position.set(Math.sin(S.orbit) * S.camD * pk, S.camY * (cam.aspect < 1.5 ? 1.12 : 1), Math.cos(S.orbit) * S.camD * pk);
    cam.lookAt(0, S.camTY, 0);
    orbs.forEach((o) => {
      const k = scripted ? (t - o.t0) / o.dur : -1;
      if (k < 0 || k > 1) {
        o.sp.visible = false;
        return;
      }
      o.sp.visible = true;
      const c = o.from.clone().lerp(mouth, 0.5);
      c.y += 0.9;
      o.sp.position.copy(bez(o.from, c, mouth, eo(k)));
      o.sp.scale.setScalar(0.17 * (1 - 0.82 * k) + 0.03);
      o.sp.material.opacity = 1 - Math.max(0, (k - 0.7) / 0.3);
    });
    liveOrbs.forEach((o) => {
      const k = o.born < 0 ? -1 : (wall - o.born) / 0.95;
      if (k < 0 || k > 1) {
        o.sp.visible = false;
        return;
      }
      o.sp.visible = true;
      const c = o.from.clone().lerp(mouth, 0.5);
      c.y += 0.9;
      o.sp.position.copy(bez(o.from, c, mouth, eo(k)));
      o.sp.scale.setScalar(0.17 * (1 - 0.82 * k) + 0.03);
      o.sp.material.opacity = 1 - Math.max(0, (k - 0.7) / 0.3);
    });
    refunds.forEach((r) => {
      const k = scripted ? (t - r.t0) / 3.2 : -1;
      if (k < 0 || k > 1) {
        r.sp.visible = false;
        return;
      }
      r.sp.visible = true;
      r.sp.position.set(Math.cos(r.ang) * (0.3 + 2.3 * eo(k)), 0.45 + 0.9 * Math.sin(k * 2.2), 0.2 + Math.sin(r.ang) * 0.5 + 0.5 * k);
      r.sp.material.opacity = 0.9 * (1 - k);
    });
    coins.forEach((c) => {
      if (!c.spawned) return;
      c.mesh.position.set(c.body.position.x, c.body.position.y, c.body.position.z);
      const q = c.body.quaternion.mult(align);
      c.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    });
    composer.render();
  };

  return {
    render,
    fireOrb,
    resize,
    setQuality,
    dispose: () => {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      [art, glow, env, ...Object.values(bidTex)].forEach((x) => x.dispose());
      target.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
