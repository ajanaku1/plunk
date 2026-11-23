import * as THREE from 'three';

/** Shared by the small Peek (lib/peek3d.ts) and the opening ceremony (lib/ceremony3d.ts): the mascot's geometry and a small studio environment map. */

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

export function slab(w: number, d: number, h: number, r: number, bevel: number): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bevel, d - 2 * bevel, r), { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 8, curveSegments: 20 });
  g.translate(0, 0, bevel);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A tiny studio baked into an environment map, so the clear coat has something to reflect without downloading a light map. */
export function studio(renderer: THREE.WebGLRenderer): THREE.Texture {
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


/** Peek built from the brand mark: smooth green body, dark band, an overhanging lid on a back hinge, two purple eyes. Parts are returned so they can be animated. */
export function createPeek() {
  const root = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#2ee89c'), roughness: 0.34, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.22 });
  const BODY_H = 0.314;
  const CZ = 0.009;
  const body = new THREE.Mesh(slab(0.826, 0.408, BODY_H, 0.07, 0.022), paint);
  body.position.set(0, 0, CZ);
  body.castShadow = body.receiveShadow = true;
  root.add(body);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.004, 0.33), new THREE.MeshStandardMaterial({ color: '#1c1826', roughness: 0.9 }));
  plate.position.set(0, BODY_H + 0.002, CZ);
  root.add(plate);
  const hinge = new THREE.Group();
  hinge.position.set(0, BODY_H + 0.004, CZ - 0.25);
  root.add(hinge);
  const lid = new THREE.Mesh(slab(0.92, 0.5, 0.048, 0.07, 0.014), paint);
  lid.position.set(0, 0, 0.25);
  lid.castShadow = lid.receiveShadow = true;
  hinge.add(lid);
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.42, 1.0) });
  const eyes = new THREE.Group();
  for (const x of [-0.1, 0.1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), eyeMat);
    e.scale.set(1, 1.1, 1);
    e.position.set(x, 0, 0);
    eyes.add(e);
  }
  eyes.position.set(0, BODY_H + 0.022, CZ + 0.14);
  root.add(eyes);
  return { root, paint, hinge, lid, eyes, BODY_H, CZ, base: BODY_H + 0.004 };
}
