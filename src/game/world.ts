import * as THREE from "three";
import { cutoutMat, type GameArt } from "@/game/art";

export const HOUSE_Z = -650;
export const ROAD_HALF = 3.55;

type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rand(rng: Rng, a: number, b: number) {
  return a + rng() * (b - a);
}

function makeSteamTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d");
  ctx.clearRect(0, 0, 128, 128);
  const puff = (x: number, y: number, r: number, a: number) => {
    const g = ctx.createRadialGradient(x, y, r * 0.05, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.35, `rgba(230,236,238,${a * 0.28})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  puff(64, 72, 38, 0.85);
  puff(50, 58, 22, 0.55);
  puff(78, 60, 20, 0.48);
  puff(62, 48, 16, 0.4);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeSilhouette(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w = 256, h = 256) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d");
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stdMat(
  mat: <T extends THREE.Material>(m: T) => T,
  color: number,
  extra: ConstructorParameters<typeof THREE.MeshStandardMaterial>[0] = {},
) {
  return mat(
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.78,
      metalness: 0.04,
      ...extra,
    }),
  );
}

function makeDigitHand(
  track: (g: THREE.BufferGeometry) => THREE.BufferGeometry,
  skin: THREE.Material,
  side: number,
) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(track(new THREE.BoxGeometry(0.075, 0.028, 0.1)), skin);
  palm.position.y = -0.02;
  g.add(palm);
  const tips = [-0.028, -0.01, 0.01, 0.028];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.008, 0.055, 3, 6)), skin);
    f.position.set(tips[i], -0.015, -0.07);
    f.rotation.x = 0.35 + i * 0.04;
    g.add(f);
  }
  const thumb = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.009, 0.04, 3, 6)), skin);
  thumb.position.set(-side * 0.042, -0.01, -0.02);
  thumb.rotation.z = -side * 0.7;
  thumb.rotation.x = 0.5;
  g.add(thumb);
  return g;
}

type PersonOpts = {
  coat: number;
  pants: number;
  boot: number;
  skin: number;
  hat?: "brim" | "peak" | "none";
  hatColor?: number;
  voidFace?: boolean;
  scale?: number;
  gaunt?: boolean;
};

function makePerson(
  track: (g: THREE.BufferGeometry) => THREE.BufferGeometry,
  mat: <T extends THREE.Material>(m: T) => T,
  opts: PersonOpts,
) {
  const root = new THREE.Group();
  const coatM = stdMat(mat, opts.coat, { roughness: 0.9 });
  const pantsM = stdMat(mat, opts.pants, { roughness: 0.84 });
  const bootM = stdMat(mat, opts.boot, { roughness: 0.52 });
  const skinM = stdMat(mat, opts.skin, { roughness: 0.62 });
  const hatM = stdMat(mat, opts.hatColor ?? 0x1a1a18, { roughness: 0.7 });
  const darkM = stdMat(mat, 0x050505, { roughness: 1 });
  const gaunt = opts.gaunt ? 0.78 : 1;
  const s = opts.scale ?? 1;

  const bootL = new THREE.Mesh(track(new THREE.BoxGeometry(0.11, 0.14, 0.22)), bootM);
  bootL.position.set(-0.09, 0.07, 0.02);
  const bootR = bootL.clone();
  bootR.position.x = 0.09;
  const calfL = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.058, 0.42, 10)), pantsM);
  calfL.position.set(-0.09, 0.34, 0);
  const calfR = calfL.clone();
  calfR.position.x = 0.09;
  const thighL = new THREE.Mesh(track(new THREE.CylinderGeometry(0.062, 0.055, 0.4, 10)), pantsM);
  thighL.position.set(-0.09, 0.72, 0);
  const thighR = thighL.clone();
  thighR.position.x = 0.09;
  const hips = new THREE.Mesh(track(new THREE.SphereGeometry(0.16, 12, 8)), pantsM);
  hips.scale.set(1.15, 0.7, 0.9);
  hips.position.y = 0.92;

  const coat = new THREE.Mesh(track(new THREE.CylinderGeometry(0.2 * gaunt, 0.28 * gaunt, 0.85, 12)), coatM);
  coat.position.y = 1.28;
  const lapel = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.38, 0.04)), coatM);
  lapel.position.set(0, 1.42, 0.2 * gaunt);
  const collar = new THREE.Mesh(track(new THREE.TorusGeometry(0.11, 0.035, 6, 12, Math.PI)), coatM);
  collar.position.set(0, 1.68, 0.02);
  collar.rotation.x = 0.4;
  const shoulders = new THREE.Mesh(track(new THREE.SphereGeometry(0.2, 12, 8)), coatM);
  shoulders.scale.set(1.15 * gaunt, 0.55, 0.8);
  shoulders.position.y = 1.66;

  const headPivot = new THREE.Group();
  headPivot.position.y = 1.78;
  const neck = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 10)), skinM);
  neck.position.y = -0.08;
  const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.145, 16, 12)), opts.voidFace ? darkM : skinM);
  head.scale.set(0.92, 1.12, 0.95);
  head.position.y = 0.12;
  headPivot.add(neck, head);
  if (opts.voidFace) {
    const hole = new THREE.Mesh(track(new THREE.CircleGeometry(0.08, 12)), darkM);
    hole.position.set(0, 0.1, 0.13);
    headPivot.add(hole);
  } else {
    const brow = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.025, 0.04)), skinM);
    brow.position.set(0, 0.16, 0.12);
    const nose = new THREE.Mesh(track(new THREE.BoxGeometry(0.028, 0.05, 0.04)), skinM);
    nose.position.set(0, 0.08, 0.14);
    headPivot.add(brow, nose);
  }

  const hatKind = opts.hat ?? "none";
  if (hatKind === "brim") {
    const brim = new THREE.Mesh(track(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16)), hatM);
    brim.position.y = 0.22;
    const crown = new THREE.Mesh(track(new THREE.CylinderGeometry(0.12, 0.14, 0.14, 12)), hatM);
    crown.position.y = 0.3;
    headPivot.add(brim, crown);
  } else if (hatKind === "peak") {
    const cap = new THREE.Mesh(track(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), hatM);
    cap.position.y = 0.2;
    cap.scale.set(1.05, 0.7, 1.05);
    const peak = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.02, 0.12)), hatM);
    peak.position.set(0, 0.16, 0.14);
    peak.rotation.x = -0.25;
    headPivot.add(cap, peak);
  }

  function arm(side: number) {
    const g = new THREE.Group();
    g.position.set(side * 0.24 * gaunt, 1.58, 0);
    const upper = new THREE.Mesh(track(new THREE.CylinderGeometry(0.045, 0.04, 0.34, 10)), coatM);
    upper.position.y = -0.17;
    const lower = new THREE.Mesh(track(new THREE.CylinderGeometry(0.038, 0.032, 0.32, 10)), coatM);
    lower.position.y = -0.48;
    const hand = makeDigitHand(track, skinM, side);
    hand.position.y = -0.68;
    hand.rotation.x = 0.2;
    g.add(upper, lower, hand);
    g.rotation.z = side * 0.12;
    return g;
  }
  const armL = arm(-1);
  const armR = arm(1);

  root.add(bootL, bootR, calfL, calfR, thighL, thighR, hips, coat, lapel, collar, shoulders, headPivot, armL, armR);
  root.scale.setScalar(s);
  return { root, headPivot, armL, armR, head };
}

function jitterIcosahedron(scale: number, rng: Rng) {
  const geo = new THREE.IcosahedronGeometry(scale, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + (rng() - 0.5) * scale * 0.28,
      pos.getY(i) + (rng() - 0.5) * scale * 0.22,
      pos.getZ(i) + (rng() - 0.5) * scale * 0.28,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

export type Viewmodel = {
  root: THREE.Group;
  carry: THREE.Group;
  tray: THREE.Group;
  ramen: THREE.Group;
  contents: THREE.Group;
  broth: THREE.Mesh;
  steam: THREE.Sprite[];
  noodles: THREE.Mesh[];
  noodleRest: { pos: THREE.Vector3; rot: THREE.Euler }[];
};

export type World = {
  mailbox: THREE.Group;
  mailboxFlag: THREE.Object3D;
  mailboxEye: THREE.Object3D;
  mailboxEyeMat: THREE.MeshStandardMaterial;
  stranger: THREE.Group;
  strangerHead: THREE.Object3D;
  monster: THREE.Group;
  monsterGlow: THREE.PointLight;
  monsterArms: THREE.Object3D[];
  house: THREE.Group;
  porchLight: THREE.PointLight;
  scareFace: THREE.Group;
  bushHands: THREE.Group;
  glimpse: THREE.Group;
  lampDying: THREE.PointLight;
  fireflies: THREE.Points;
  viewmodel: Viewmodel;
  flashlight: THREE.SpotLight;
  fogTime: { value: number };
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
};

export function buildWorld(scene: THREE.Scene, camera: THREE.Camera, art: GameArt): World {
  const rng = mulberry32(0x5a1e);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const track = (g: THREE.BufferGeometry) => (geos.push(g), g);
  const mat = <T extends THREE.Material>(m: T) => (mats.push(m), m);

  const roadMat = mat(
    new THREE.MeshStandardMaterial({
      map: art.asphalt,
      color: 0x9aa0a6,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  const trackMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xc4b89a, roughness: 0.7, emissive: 0x3a3428, emissiveIntensity: 0.12 }),
  );
  const groundMat = mat(
    new THREE.MeshStandardMaterial({
      map: art.floor,
      color: 0x8a9284,
      roughness: 0.95,
    }),
  );
  const dirtMap = art.floor.clone();
  dirtMap.repeat.set(3, 80);
  const dirtMat = mat(
    new THREE.MeshStandardMaterial({
      map: dirtMap,
      color: 0x6e6658,
      roughness: 0.96,
    }),
  );
  const barkMat = mat(
    new THREE.MeshStandardMaterial({
      map: art.bark,
      color: 0x8a7a68,
      roughness: 0.9,
    }),
  );
  const treeMat = mat(cutoutMat(art.tree, 0xb8c2b0));
  const fernMat = mat(cutoutMat(art.fern, 0xa8c0a0));
  const bushMat = mat(cutoutMat(art.bush, 0x9ab094));
  const grassMat = mat(cutoutMat(art.grass, 0xb0c4a4));
  const railMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x7a6850, roughness: 0.72, flatShading: true }),
  );
  const railDark = mat(
    new THREE.MeshStandardMaterial({ color: 0x564636, roughness: 0.78, flatShading: true }),
  );

  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(280, 1600)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.04, -700);
  scene.add(ground);

  const road = new THREE.Mesh(track(new THREE.PlaneGeometry(8.4, 800)), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -380);
  scene.add(road);
  const stripe = new THREE.Mesh(track(new THREE.PlaneGeometry(0.11, 760)), trackMat);
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.012, -380);
  scene.add(stripe);
  const shoulderL = new THREE.Mesh(track(new THREE.PlaneGeometry(2.2, 800)), dirtMat);
  shoulderL.rotation.x = -Math.PI / 2;
  shoulderL.position.set(-5.1, 0.006, -380);
  scene.add(shoulderL);
  const shoulderR = shoulderL.clone();
  shoulderR.position.x = 5.1;
  scene.add(shoulderR);

  // Railings — posts + two rails, both sides
  const postGeo = track(new THREE.BoxGeometry(0.11, 1.15, 0.11));
  const railGeo = track(new THREE.BoxGeometry(0.07, 0.055, 2.8));
  const postCount = 560;
  const posts = new THREE.InstancedMesh(postGeo, railDark, postCount);
  const railCount = 1100;
  const rails = new THREE.InstancedMesh(railGeo, railMat, railCount);
  const dummy = new THREE.Object3D();
  let pi = 0;
  let ri = 0;
  for (const side of [-1, 1]) {
    const x = side * 4.25;
    for (let z = 52; z > -720 && pi < postCount; z -= 2.8) {
      dummy.position.set(x, 0.52, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(pi++, dummy.matrix);
      dummy.position.set(x, 0.42, z - 1.4);
      dummy.updateMatrix();
      if (ri < railCount) rails.setMatrixAt(ri++, dummy.matrix);
      dummy.position.set(x, 0.78, z - 1.4);
      dummy.updateMatrix();
      if (ri < railCount) rails.setMatrixAt(ri++, dummy.matrix);
    }
  }
  posts.count = pi;
  rails.count = ri;
  posts.instanceMatrix.needsUpdate = true;
  rails.instanceMatrix.needsUpdate = true;
  posts.computeBoundingSphere();
  rails.computeBoundingSphere();
  scene.add(posts, rails);

  const cardGeo = track(new THREE.PlaneGeometry(1, 1));
  cardGeo.translate(0, 0.5, 0);

  function scatterCards(
    material: THREE.Material,
    count: number,
    place: (d: THREE.Object3D, i: number) => void,
    copies = 1,
  ) {
    const mesh = new THREE.InstancedMesh(cardGeo, material, count * copies);
    let n = 0;
    for (let i = 0; i < count; i++) {
      place(dummy, i);
      const x = dummy.position.x;
      const y = dummy.position.y;
      const z = dummy.position.z;
      const sx = dummy.scale.x;
      const sy = dummy.scale.y;
      const baseY = dummy.rotation.y;
      for (let c = 0; c < copies; c++) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, baseY + (c * Math.PI) / copies, 0);
        dummy.scale.set(sx, sy, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(n++, dummy.matrix);
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  }

  scatterCards(treeMat, 980, (d, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const row = i % 8;
    d.position.set(
      side * (5.05 + row * 1.28 + rand(rng, -0.3, 0.45)),
      0,
      14 - Math.floor(i / 2) * 1.55 + rand(rng, -0.65, 0.65),
    );
    const h = rand(rng, 8.2, 15.5) * (row > 4 ? 1.22 : row < 2 ? 0.92 : 1);
    d.scale.set(h * 0.52, h, 1);
    d.rotation.y = rng() * Math.PI;
  }, 2);

  scatterCards(fernMat, 1600, (d) => {
    const side = rng() > 0.5 ? 1 : -1;
    d.position.set(side * rand(rng, 4.38, 8.8), 0, rand(rng, 46, -730));
    const h = rand(rng, 0.65, 1.75);
    d.scale.set(h * 1.05, h, 1);
    d.rotation.y = rng() * Math.PI;
  }, 2);

  scatterCards(bushMat, 640, (d) => {
    const side = rng() > 0.5 ? 1 : -1;
    d.position.set(side * rand(rng, 4.7, 10.5), 0, rand(rng, 44, -720));
    const h = rand(rng, 1.15, 2.55);
    d.scale.set(h * 1.4, h, 1);
    d.rotation.y = rng() * Math.PI;
  }, 2);

  scatterCards(grassMat, 2200, (d) => {
    const side = rng() > 0.5 ? 1 : -1;
    d.position.set(side * rand(rng, 4.32, 11.5), 0, rand(rng, 46, -730));
    const h = rand(rng, 0.45, 1.25);
    d.scale.set(h * 1.25, h, 1);
    d.rotation.y = rng() * Math.PI;
  }, 1);

  scatterCards(treeMat, 280, (d, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const row = i % 6;
    const blockRoad = i > 50 && i % 19 === 0;
    d.position.set(
      blockRoad ? rand(rng, -2.5, 2.5) : side * (4.35 + row * 1.18 + rand(rng, -0.2, 0.35)),
      0,
      1.7 + Math.floor(i / 2) * 1.12 + rand(rng, -0.4, 0.4),
    );
    const h = rand(rng, 7.8, 15.2) * (blockRoad ? 0.9 : 1);
    d.scale.set(h * 0.52, h, 1);
    d.rotation.y = rng() * Math.PI;
  }, 2);

  scatterCards(bushMat, 200, (d, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    d.position.set(side * rand(rng, 1.9, 3.6), 0, 4.2 + (i % 48) * 0.72 + rand(rng, -0.25, 0.25));
    const h = rand(rng, 1.05, 2.15);
    d.scale.set(h * 1.55, h, 1);
    d.rotation.y = rng() * Math.PI;
  }, 2);

  scatterCards(fernMat, 240, (d) => {
    const side = rng() > 0.5 ? 1 : -1;
    d.position.set(side * rand(rng, 1.6, 3.6), 0, rand(rng, 2.4, 34));
    const h = rand(rng, 0.7, 1.65);
    d.scale.set(h, h, 1);
    d.rotation.y = rng() * Math.PI;
  }, 2);

  scatterCards(grassMat, 280, (d) => {
    d.position.set(rand(rng, -3.6, 3.6), 0, rand(rng, 2.2, 38));
    const h = rand(rng, 0.4, 1.1);
    d.scale.set(h * 1.3, h, 1);
    d.rotation.y = rng() * Math.PI;
  }, 1);

  const overgrown = new THREE.Mesh(track(new THREE.PlaneGeometry(8.6, 72)), dirtMat);
  overgrown.rotation.x = -Math.PI / 2;
  overgrown.position.set(0, 0.01, 42);
  scene.add(overgrown);

  const fillBehind = new THREE.PointLight(0xe8d4a8, 5.2, 16, 1.6);
  fillBehind.position.set(0.2, 2.6, 6.2);
  scene.add(fillBehind);

  const deerTex = makeSilhouette((ctx, w, h) => {
    ctx.fillStyle = "#5c5348";
    ctx.strokeStyle = "#5c5348";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(w * 0.36, h * 0.52);
    ctx.lineTo(w * 0.34, h * 0.9);
    ctx.moveTo(w * 0.45, h * 0.52);
    ctx.lineTo(w * 0.47, h * 0.9);
    ctx.moveTo(w * 0.58, h * 0.5);
    ctx.lineTo(w * 0.56, h * 0.9);
    ctx.moveTo(w * 0.66, h * 0.5);
    ctx.lineTo(w * 0.7, h * 0.88);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.46, w * 0.2, h * 0.11, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(w * 0.66, h * 0.4);
    ctx.quadraticCurveTo(w * 0.76, h * 0.26, w * 0.84, h * 0.24);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w * 0.87, h * 0.22, w * 0.055, h * 0.038, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.85, h * 0.18);
    ctx.lineTo(w * 0.82, h * 0.05);
    ctx.lineTo(w * 0.76, h * 0.1);
    ctx.moveTo(w * 0.86, h * 0.17);
    ctx.lineTo(w * 0.9, h * 0.04);
    ctx.lineTo(w * 0.95, h * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(w * 0.3, h * 0.42, w * 0.035, h * 0.028, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }, 320, 240);
  const foxTex = makeSilhouette((ctx, w, h) => {
    ctx.fillStyle = "#c8b4a0";
    ctx.beginPath();
    ctx.ellipse(w * 0.46, h * 0.58, w * 0.2, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.62, h * 0.56);
    ctx.quadraticCurveTo(w * 0.86, h * 0.42, w * 0.92, h * 0.62);
    ctx.quadraticCurveTo(w * 0.72, h * 0.7, w * 0.6, h * 0.62);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.56);
    ctx.lineTo(w * 0.16, h * 0.5);
    ctx.lineTo(w * 0.28, h * 0.6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.48);
    ctx.lineTo(w * 0.26, h * 0.34);
    ctx.lineTo(w * 0.34, h * 0.5);
    ctx.moveTo(w * 0.34, h * 0.48);
    ctx.lineTo(w * 0.38, h * 0.32);
    ctx.lineTo(w * 0.4, h * 0.5);
    ctx.fill();
    ctx.fillRect(w * 0.36, h * 0.64, 4, h * 0.2);
    ctx.fillRect(w * 0.52, h * 0.64, 4, h * 0.2);
  }, 280, 160);
  const hareTex = makeSilhouette((ctx, w, h) => {
    ctx.fillStyle = "#cfc8bc";
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.68, w * 0.18, h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.62, h * 0.52, w * 0.09, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.58, h * 0.28, w * 0.035, h * 0.2, -0.2, 0, Math.PI * 2);
    ctx.ellipse(w * 0.66, h * 0.26, w * 0.032, h * 0.2, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(w * 0.42, h * 0.76, 4, h * 0.16);
    ctx.fillRect(w * 0.54, h * 0.76, 4, h * 0.16);
  }, 180, 180);
  const crowTex = makeSilhouette((ctx, w, h) => {
    ctx.fillStyle = "#2a2a30";
    ctx.beginPath();
    ctx.ellipse(w * 0.48, h * 0.52, w * 0.16, h * 0.1, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.6, h * 0.5);
    ctx.lineTo(w * 0.88, h * 0.4);
    ctx.lineTo(w * 0.7, h * 0.56);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.5);
    ctx.lineTo(w * 0.16, h * 0.46);
    ctx.lineTo(w * 0.34, h * 0.56);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.4, h * 0.48);
    ctx.quadraticCurveTo(w * 0.3, h * 0.22, w * 0.55, h * 0.42);
    ctx.fill();
  }, 192, 128);
  const owlTex = makeSilhouette((ctx, w, h) => {
    ctx.fillStyle = "#3a3228";
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.58, w * 0.22, h * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.32, h * 0.36);
    ctx.lineTo(w * 0.28, h * 0.16);
    ctx.lineTo(w * 0.42, h * 0.34);
    ctx.moveTo(w * 0.68, h * 0.36);
    ctx.lineTo(w * 0.72, h * 0.16);
    ctx.lineTo(w * 0.58, h * 0.34);
    ctx.fill();
    ctx.fillStyle = "#c9a227";
    ctx.beginPath();
    ctx.arc(w * 0.42, h * 0.5, w * 0.055, 0, Math.PI * 2);
    ctx.arc(w * 0.58, h * 0.5, w * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0a0806";
    ctx.beginPath();
    ctx.arc(w * 0.42, h * 0.5, w * 0.022, 0, Math.PI * 2);
    ctx.arc(w * 0.58, h * 0.5, w * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }, 160, 200);

  const deerMat = mat(cutoutMat(deerTex, 0xb8a890));
  deerMat.emissive = new THREE.Color(0x3d342c);
  deerMat.emissiveIntensity = 0.55;
  const foxMat = mat(cutoutMat(foxTex, 0xc4a078));
  foxMat.emissive = new THREE.Color(0x4a3828);
  foxMat.emissiveIntensity = 0.5;
  const hareMat = mat(cutoutMat(hareTex, 0xc8c0b0));
  hareMat.emissive = new THREE.Color(0x3a3830);
  hareMat.emissiveIntensity = 0.45;
  const crowMat = mat(cutoutMat(crowTex, 0x4a4a52));
  crowMat.emissive = new THREE.Color(0x1a1a20);
  crowMat.emissiveIntensity = 0.35;
  const owlMat = mat(
    new THREE.MeshBasicMaterial({
      map: owlTex,
      transparent: true,
      alphaTest: 0.28,
      fog: true,
      side: THREE.DoubleSide,
    }),
  );
  const faunaGeo = track(new THREE.PlaneGeometry(1, 1));
  faunaGeo.translate(0, 0.5, 0);

  const plantFauna = (material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number) => {
    const m = new THREE.Mesh(faunaGeo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, 1);
    m.rotation.y = Math.atan2(-x, -z);
    scene.add(m);
  };
  plantFauna(deerMat, 2.7, 0, 6.2, 1.7, 1.35);
  plantFauna(deerMat, -6.2, 0, 8.4, 1.45, 1.15);
  plantFauna(deerMat, 6.5, 0, 11.2, 1.25, 1.0);
  plantFauna(foxMat, -2.05, 0, 4.9, 1.25, 0.75);
  plantFauna(hareMat, 1.55, 0, 4.2, 0.48, 0.48);
  plantFauna(hareMat, -4.5, 0, 6.4, 0.4, 0.4);
  plantFauna(owlMat, -5.15, 2.35, 5.6, 0.32, 0.4);
  for (let i = 0; i < 7; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    plantFauna(
      crowMat,
      side * rand(rng, 4.8, 8.4),
      rand(rng, 2.6, 6.2),
      5.2 + i * 2.4,
      0.42,
      0.26,
    );
  }

  const logGeo = track(new THREE.CylinderGeometry(0.12, 0.16, 2.4, 6));
  const logs = new THREE.InstancedMesh(logGeo, barkMat, 70);
  for (let i = 0; i < 70; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    dummy.position.set(side * rand(rng, 5.4, 8.8), 0.14, rand(rng, 42, -700));
    dummy.rotation.set(rand(rng, 0.1, 0.4), rng() * Math.PI, Math.PI / 2 + rand(rng, -0.2, 0.2));
    dummy.scale.set(rand(rng, 0.7, 1.3), rand(rng, 0.8, 1.4), rand(rng, 0.7, 1.2));
    dummy.updateMatrix();
    logs.setMatrixAt(i, dummy.matrix);
  }
  logs.instanceMatrix.needsUpdate = true;
  logs.computeBoundingSphere();
  scene.add(logs);

  for (let i = 0; i < 6; i++) {
    const fallen = new THREE.Mesh(logGeo, barkMat);
    const side = i % 2 === 0 ? -1 : 1;
    fallen.position.set(side * rand(rng, 1.6, 2.8), 0.16, 8 + i * 4.2);
    fallen.rotation.set(0.12, rand(rng, 0.4, 1.2), Math.PI / 2);
    fallen.scale.set(rand(rng, 1.1, 1.8), rand(rng, 0.9, 1.3), rand(rng, 1.1, 1.6));
    scene.add(fallen);
  }

  const rockGeo = track(jitterIcosahedron(0.38, rng));
  const rockMat = mat(
    new THREE.MeshStandardMaterial({ map: art.floor, color: 0x6a6660, roughness: 0.92, flatShading: true }),
  );
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 140);
  for (let i = 0; i < 140; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    dummy.position.set(side * rand(rng, 4.7, 10), 0.12, rand(rng, 38, -710));
    dummy.rotation.set(rng() * 0.6, rng() * Math.PI, rng() * 0.4);
    const s = rand(rng, 0.5, 1.6);
    dummy.scale.set(s, s * rand(rng, 0.45, 0.8), s);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.computeBoundingSphere();
  scene.add(rocks);

  const fogTime = { value: 0 };
  const fogMat = mat(
    new THREE.ShaderMaterial({
      uniforms: {
        map: { value: art.fog },
        time: fogTime,
        opacity: { value: 0.5 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying float vDist;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = length(mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform float time;
        uniform float opacity;
        varying vec2 vUv;
        varying float vDist;
        void main() {
          vec2 uv = vUv * vec2(1.6, 1.0) + vec2(time * 0.012, sin(time * 0.07) * 0.04);
          vec4 c = texture2D(map, uv);
          float fade = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          float sides = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          float distFade = 1.0 - smoothstep(5.0, 12.0, vDist);
          float a = c.a * opacity * fade * sides * distFade;
          if (a < 0.02) discard;
          gl_FragColor = vec4(c.rgb, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  const fogGeo = track(new THREE.PlaneGeometry(14, 3.4, 1, 1));
  for (let i = 0; i < 95; i++) {
    const z = 5 - i * 7.2;
    const sheet = new THREE.Mesh(fogGeo, fogMat);
    sheet.position.set((i % 2 === 0 ? -1 : 1) * 1.35, 0.85 + (i % 3) * 0.22, z);
    sheet.rotation.y = (i % 2 === 0 ? 0.12 : -0.12);
    scene.add(sheet);
    const low = new THREE.Mesh(fogGeo, fogMat);
    low.position.set((i % 3 === 0 ? 0.4 : -0.4), 0.28, z + 2.2);
    low.scale.set(1.25, 0.42, 1);
    low.rotation.x = -0.18;
    scene.add(low);
  }
  for (let i = 0; i < 12; i++) {
    const z = 8 + i * 5.4;
    const sheet = new THREE.Mesh(fogGeo, fogMat);
    sheet.position.set((i % 2 === 0 ? -1 : 1) * 1.2, 0.9 + (i % 3) * 0.2, z);
    sheet.rotation.y = (i % 2 === 0 ? 0.1 : -0.1);
    scene.add(sheet);
    const low = new THREE.Mesh(fogGeo, fogMat);
    low.position.set((i % 3 === 0 ? 0.35 : -0.35), 0.3, z + 1.6);
    low.scale.set(1.2, 0.4, 1);
    low.rotation.x = -0.16;
    scene.add(low);
  }

  // Street lamps
  const poleGeo = track(new THREE.CylinderGeometry(0.07, 0.1, 5.4, 6));
  const armGeo = track(new THREE.BoxGeometry(1.55, 0.07, 0.07));
  const lampMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x2a2824, roughness: 0.55, metalness: 0.35 }),
  );
  const hoodMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x1a1814, roughness: 0.5, metalness: 0.4 }),
  );
  const bulbLit = mat(
    new THREE.MeshStandardMaterial({
      color: 0xffe6b8,
      emissive: 0xffc878,
      emissiveIntensity: 3.2,
      roughness: 0.35,
    }),
  );
  const bulbDead = mat(
    new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8, emissive: 0x000000 }),
  );
  const bulbGeo = track(new THREE.SphereGeometry(0.11, 8, 6));
  const hoodGeo = track(new THREE.ConeGeometry(0.22, 0.16, 6));
  let lampDying: THREE.PointLight | null = null;
  for (let i = 0; i < 22; i++) {
    const z = -8 - i * 29;
    const side = i % 2 === 0 ? -1 : 1;
    const pole = new THREE.Mesh(poleGeo, lampMat);
    pole.position.set(side * 3.85, 2.7, z);
    const arm = new THREE.Mesh(armGeo, lampMat);
    arm.position.set(side * 3.15, 5.28, z);
    const hood = new THREE.Mesh(hoodGeo, hoodMat);
    hood.position.set(side * 2.55, 5.18, z);
    hood.rotation.z = side * 0.15;
    scene.add(pole, arm, hood);
    const dead = i % 6 === 4;
    const bulb = new THREE.Mesh(bulbGeo, dead ? bulbDead : bulbLit);
    bulb.position.set(side * 2.55, 5.02, z);
    scene.add(bulb);
    if (dead) continue;
    const light = new THREE.PointLight(0xffd4a0, 9.5, 12.5, 1.65);
    light.position.set(side * 2.55, 4.85, z);
    scene.add(light);
    if (i === 7) {
      lampDying = light;
      light.intensity = 6.5;
    }
  }

  {
    const z = 12;
    const side = 1;
    const pole = new THREE.Mesh(poleGeo, lampMat);
    pole.position.set(side * 3.85, 2.7, z);
    const arm = new THREE.Mesh(armGeo, lampMat);
    arm.position.set(side * 3.15, 5.28, z);
    const hood = new THREE.Mesh(hoodGeo, hoodMat);
    hood.position.set(side * 2.55, 5.18, z);
    hood.rotation.z = side * 0.15;
    const bulb = new THREE.Mesh(bulbGeo, bulbLit);
    bulb.position.set(side * 2.55, 5.02, z);
    scene.add(pole, arm, hood, bulb);
    const light = new THREE.PointLight(0xffd4a0, 7.2, 11, 1.7);
    light.position.set(side * 2.55, 4.85, z);
    scene.add(light);
  }

  // Sentinel — roadside watchman
  const sentry = makePerson(track, mat, {
    coat: 0x3e433c,
    pants: 0x2c2e2a,
    boot: 0x1a1714,
    skin: 0x8d7b68,
    hat: "peak",
    hatColor: 0x2a2824,
    scale: 1.08,
  });
  const mailbox = sentry.root;
  const mailboxFlag = sentry.armR;
  mailboxFlag.rotation.x = 0.35;
  const mailboxEyeMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0x1a0806,
      emissive: 0xc4a030,
      emissiveIntensity: 0,
      roughness: 0.35,
    }),
  );
  const mailboxEye = new THREE.Group();
  mailboxEye.position.set(0, 0.1, 0.13);
  const sentryEyeGeo = track(new THREE.SphereGeometry(0.026, 10, 8));
  const sentryEyeL = new THREE.Mesh(sentryEyeGeo, mailboxEyeMat);
  sentryEyeL.position.set(-0.042, 0, 0);
  const sentryEyeR = sentryEyeL.clone();
  sentryEyeR.position.x = 0.042;
  mailboxEye.add(sentryEyeL, sentryEyeR);
  mailboxEye.scale.setScalar(0.01);
  sentry.headPivot.add(mailboxEye);
  const lanternPole = stdMat(mat, 0x1c1a16, { roughness: 0.45, metalness: 0.35 });
  const lanternGlowM = mat(
    new THREE.MeshStandardMaterial({
      color: 0xffc878,
      emissive: 0xffb24a,
      emissiveIntensity: 1.4,
      roughness: 0.4,
    }),
  );
  const lantern = new THREE.Group();
  const cage = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.11, 0.08)), lanternPole);
  const pane = new THREE.Mesh(track(new THREE.BoxGeometry(0.055, 0.07, 0.055)), lanternGlowM);
  const handle = new THREE.Mesh(track(new THREE.TorusGeometry(0.028, 0.006, 6, 10)), lanternPole);
  handle.position.y = 0.07;
  handle.rotation.x = Math.PI / 2;
  lantern.add(cage, pane, handle);
  lantern.position.set(0.02, -0.74, 0.04);
  sentry.armR.add(lantern);
  const lanternLight = new THREE.PointLight(0xffc070, 1.8, 4.5, 1.8);
  lanternLight.position.set(0, -0.74, 0.04);
  sentry.armR.add(lanternLight);
  mailbox.position.set(-3.15, 0, -68);
  mailbox.rotation.y = Math.PI / 2;
  scene.add(mailbox);

  // Watcher
  const watch = makePerson(track, mat, {
    coat: 0x141310,
    pants: 0x0e0d0c,
    boot: 0x090908,
    skin: 0x2a2420,
    hat: "brim",
    hatColor: 0x0c0c0b,
    voidFace: true,
    scale: 1.14,
  });
  const stranger = watch.root;
  const head = watch.headPivot;
  stranger.position.set(1.4, 0, -148);
  stranger.visible = false;
  scene.add(stranger);

  // Hunger
  const hunger = makePerson(track, mat, {
    coat: 0x0a0908,
    pants: 0x070706,
    boot: 0x050504,
    skin: 0x1a1210,
    hat: "none",
    voidFace: true,
    gaunt: true,
    scale: 1.72,
  });
  const monster = hunger.root;
  hunger.armL.scale.set(1.15, 2.35, 1.15);
  hunger.armR.scale.set(1.15, 2.35, 1.15);
  const armL = hunger.armL;
  const armR = hunger.armR;
  const eyeGlowM = mat(
    new THREE.MeshStandardMaterial({
      color: 0x9e2a22,
      emissive: 0x9e2a22,
      emissiveIntensity: 2.6,
      roughness: 0.4,
    }),
  );
  const hungerEyeGeo = track(new THREE.SphereGeometry(0.04, 10, 8));
  const e1 = new THREE.Mesh(hungerEyeGeo, eyeGlowM);
  e1.position.set(-0.05, 0.12, 0.12);
  const e2 = e1.clone();
  e2.position.x = 0.05;
  const e3 = e1.clone();
  e3.position.set(0, 0.2, 0.1);
  e3.scale.setScalar(0.7);
  hunger.headPivot.add(e1, e2, e3);
  const jaw = new THREE.Mesh(track(new THREE.BoxGeometry(0.12, 0.03, 0.08)), stdMat(mat, 0x1a1210, { roughness: 0.7 }));
  jaw.position.set(0, 0.02, 0.12);
  hunger.headPivot.add(jaw);
  monster.position.set(0, 0, -470);
  monster.visible = false;
  scene.add(monster);
  const monsterGlow = new THREE.PointLight(0x9e2a22, 0, 10);
  monsterGlow.position.set(0, 3.1, -468);
  scene.add(monsterGlow);

  // House
  const house = new THREE.Group();
  const wallM = mat(
    new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 0.88, flatShading: true }),
  );
  const trimM = mat(
    new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 0.86, flatShading: true }),
  );
  const roofM = mat(
    new THREE.MeshStandardMaterial({ color: 0x221c16, roughness: 0.92, flatShading: true }),
  );
  const glowM = mat(
    new THREE.MeshStandardMaterial({
      color: 0x6a3a12,
      emissive: 0x5a2e0c,
      emissiveIntensity: 0.7,
      flatShading: true,
    }),
  );
  const foundation = new THREE.Mesh(track(new THREE.BoxGeometry(6.6, 0.32, 6.6)), trimM);
  foundation.position.y = 0.16;
  const wall = new THREE.Mesh(track(new THREE.BoxGeometry(6.1, 4.1, 6.1)), wallM);
  wall.position.y = 2.3;
  const roof = new THREE.Mesh(track(new THREE.ConeGeometry(5.4, 2.5, 4)), roofM);
  roof.position.y = 5.55;
  roof.rotation.y = Math.PI / 4;
  const chimney = new THREE.Mesh(track(new THREE.BoxGeometry(0.55, 1.7, 0.55)), trimM);
  chimney.position.set(1.7, 6.15, -0.9);
  const door = new THREE.Mesh(track(new THREE.PlaneGeometry(1.15, 2.35)), glowM);
  door.position.set(0, 1.4, 3.08);
  const win = (x: number) => {
    const f = new THREE.Mesh(track(new THREE.BoxGeometry(1.05, 1.05, 0.1)), trimM);
    f.position.set(x, 2.65, 3.05);
    const p = new THREE.Mesh(track(new THREE.PlaneGeometry(0.82, 0.82)), glowM);
    p.position.set(x, 2.65, 3.12);
    house.add(f, p);
  };
  house.add(foundation, wall, roof, chimney, door);
  win(-1.85);
  win(1.85);
  house.scale.setScalar(1.28);
  house.position.set(0, 0, HOUSE_Z);
  scene.add(house);
  const porchLight = new THREE.PointLight(0xffb060, 6, 18, 1.6);
  porchLight.position.set(0, 3.2, HOUSE_Z + 5);
  scene.add(porchLight);

  // Scare face
  const scareFace = new THREE.Group();
  const pale = mat(new THREE.MeshBasicMaterial({ color: 0xf3eee6, fog: false }));
  const pit = mat(new THREE.MeshBasicMaterial({ color: 0x050303, fog: false }));
  const toothM = mat(new THREE.MeshBasicMaterial({ color: 0xe8e0d4, fog: false }));
  const face = new THREE.Mesh(track(new THREE.SphereGeometry(0.26, 18, 14)), pale);
  face.scale.set(0.86, 1.18, 0.78);
  const brow = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.04, 0.06)), pale);
  brow.position.set(0, 0.12, 0.16);
  brow.rotation.x = -0.35;
  const nose = new THREE.Mesh(track(new THREE.BoxGeometry(0.04, 0.07, 0.06)), pale);
  nose.position.set(0, 0.02, 0.2);
  const earL = new THREE.Mesh(track(new THREE.SphereGeometry(0.05, 8, 6)), pale);
  earL.position.set(-0.2, 0.02, 0);
  earL.scale.set(0.45, 1, 0.7);
  const earR = earL.clone();
  earR.position.x = 0.2;
  const sockL = new THREE.Mesh(track(new THREE.SphereGeometry(0.055, 10, 8)), pit);
  sockL.position.set(-0.075, 0.06, 0.17);
  sockL.scale.set(1, 1.35, 0.5);
  const sockR = sockL.clone();
  sockR.position.x = 0.075;
  const mouth = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.055, 0.04)), pit);
  mouth.position.set(0, -0.1, 0.18);
  scareFace.add(face, brow, nose, earL, earR, sockL, sockR, mouth);
  for (let i = 0; i < 5; i++) {
    const tooth = new THREE.Mesh(track(new THREE.BoxGeometry(0.018, 0.028, 0.012)), toothM);
    tooth.position.set(-0.048 + i * 0.024, -0.08, 0.2);
    scareFace.add(tooth);
  }
  scareFace.visible = false;
  scene.add(scareFace);

  // Hands from the brush
  const bushHands = new THREE.Group();
  const skinBush = stdMat(mat, 0x6e5744, { roughness: 0.82 });
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(track(new THREE.CylinderGeometry(0.042, 0.036, 0.55, 10)), skinBush);
    upper.position.y = 0.2;
    upper.rotation.x = 1.05;
    const palm = makeDigitHand(track, skinBush, side);
    palm.position.set(side * 0.02, 0.38, -0.42);
    palm.rotation.x = 0.4;
    palm.scale.setScalar(1.35);
    arm.add(upper, palm);
    arm.position.x = side * 0.18;
    bushHands.add(arm);
  }
  bushHands.position.set(4.4, 0, -338);
  bushHands.visible = false;
  scene.add(bushHands);

  const glimp = makePerson(track, mat, {
    coat: 0x0c0c0c,
    pants: 0x090909,
    boot: 0x060606,
    skin: 0x161412,
    hat: "none",
    voidFace: true,
    gaunt: true,
    scale: 1.06,
  });
  const glimpse = glimp.root;
  glimpse.position.set(7.4, 0, -358);
  glimpse.visible = false;
  scene.add(glimpse);

  // Fireflies
  const fireflyCount = 70;
  const fPos = new Float32Array(fireflyCount * 3);
  for (let i = 0; i < fireflyCount; i++) {
    fPos[i * 3] = (rng() - 0.5) * 36;
    fPos[i * 3 + 1] = 0.4 + rng() * 3.4;
    fPos[i * 3 + 2] = rand(rng, 38, -700);
  }
  const fGeo = track(new THREE.BufferGeometry());
  fGeo.setAttribute("position", new THREE.BufferAttribute(fPos, 3));
  const fMat = mat(
    new THREE.PointsMaterial({
      color: 0x6a8860,
      size: 0.07,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const fireflies = new THREE.Points(fGeo, fMat);
  scene.add(fireflies);

  // Flashlight
  const flashlight = new THREE.SpotLight(0xfff0d8, 6.2, 14, Math.PI / 5.4, 0.38, 1.2);
  flashlight.position.set(0.12, -0.04, 0.08);
  const flashTarget = new THREE.Object3D();
  flashTarget.position.set(0, -0.08, -1);
  camera.add(flashlight);
  camera.add(flashTarget);
  flashlight.target = flashTarget;

  const viewmodel = buildViewmodel(camera, mat, track);

  return {
    mailbox,
    mailboxFlag,
    mailboxEye,
    mailboxEyeMat,
    stranger,
    strangerHead: head,
    monster,
    monsterGlow,
    monsterArms: [armL, armR],
    house,
    porchLight,
    scareFace,
    bushHands,
    glimpse,
    lampDying: lampDying ?? new THREE.PointLight(0x000000, 0),
    fireflies,
    viewmodel,
    flashlight,
    fogTime,
    geos,
    mats,
  };
}

function buildViewmodel(
  camera: THREE.Camera,
  mat: <T extends THREE.Material>(m: T) => T,
  track: (g: THREE.BufferGeometry) => THREE.BufferGeometry,
): Viewmodel {
  const root = new THREE.Group();
  camera.add(root);

  const carry = new THREE.Group();
  carry.position.set(0, -0.4, -0.68);
  root.add(carry);

  const wood = mat(
    new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.68, flatShading: true }),
  );
  const woodDark = mat(
    new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.78, flatShading: true }),
  );
  const skin = mat(
    new THREE.MeshStandardMaterial({ color: 0x8a6a4e, roughness: 0.78, flatShading: true }),
  );
  const sleeve = mat(
    new THREE.MeshStandardMaterial({ color: 0x242018, roughness: 0.9, flatShading: true }),
  );
  const bowlM = mat(
    new THREE.MeshStandardMaterial({
      color: 0xe2d4c0,
      roughness: 0.28,
      metalness: 0.06,
    }),
  );
  const glazeM = mat(
    new THREE.MeshStandardMaterial({
      color: 0x5a2214,
      roughness: 0.22,
      metalness: 0.08,
    }),
  );
  const brothM = mat(
    new THREE.MeshStandardMaterial({
      color: 0x8a4a18,
      roughness: 0.18,
      metalness: 0.12,
      emissive: 0x3a1808,
      emissiveIntensity: 0.22,
    }),
  );
  const noodleM = mat(
    new THREE.MeshStandardMaterial({ color: 0xd4b26a, roughness: 0.42, metalness: 0.02 }),
  );
  const noriM = mat(
    new THREE.MeshStandardMaterial({ color: 0x1a2a1c, roughness: 0.65 }),
  );
  const eggWhite = mat(
    new THREE.MeshStandardMaterial({ color: 0xf0e6d4, roughness: 0.45 }),
  );
  const eggYolk = mat(
    new THREE.MeshStandardMaterial({
      color: 0xe8a030,
      roughness: 0.35,
      emissive: 0x5a3008,
      emissiveIntensity: 0.15,
    }),
  );
  const chopM = mat(
    new THREE.MeshStandardMaterial({ color: 0xc4a070, roughness: 0.55 }),
  );

  const tray = new THREE.Group();
  const board = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.016, 0.42)), wood);
  const rimF = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.028, 0.016)), woodDark);
  rimF.position.set(0, 0.02, 0.202);
  const rimB = rimF.clone();
  rimB.position.z = -0.202;
  const rimL = new THREE.Mesh(track(new THREE.BoxGeometry(0.016, 0.028, 0.42)), woodDark);
  rimL.position.set(-0.302, 0.02, 0);
  const rimR = rimL.clone();
  rimR.position.x = 0.302;
  tray.add(board, rimF, rimB, rimL, rimR);
  carry.add(tray);

  function makeHand(side: number) {
    const g = new THREE.Group();
    const sl = new THREE.Mesh(track(new THREE.CylinderGeometry(0.055, 0.07, 0.28, 6)), sleeve);
    sl.rotation.z = side * 1.15;
    sl.rotation.x = 0.4;
    sl.position.set(side * 0.12, 0.02, 0.16);
    const arm = new THREE.Mesh(track(new THREE.CylinderGeometry(0.042, 0.05, 0.16, 6)), skin);
    arm.rotation.z = side * 1.05;
    arm.rotation.x = 0.15;
    arm.position.set(side * 0.02, 0.01, 0.04);
    const palm = new THREE.Mesh(track(new THREE.SphereGeometry(0.055, 7, 5)), skin);
    palm.scale.set(1.15, 0.55, 1.35);
    palm.position.set(0, 0.03, -0.04);
    g.add(sl, arm, palm);
    const tips = [-0.045, -0.015, 0.015, 0.045];
    for (const x of tips) {
      const f = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.01, 0.07, 5)), skin);
      f.rotation.x = Math.PI / 2 - 0.35;
      f.position.set(x, 0.025, -0.11);
      g.add(f);
    }
    const thumb = new THREE.Mesh(track(new THREE.CylinderGeometry(0.013, 0.011, 0.055, 5)), skin);
    thumb.rotation.z = -side * 0.9;
    thumb.rotation.x = 0.4;
    thumb.position.set(-side * 0.055, 0.03, -0.02);
    g.add(thumb);
    g.position.set(side * 0.32, 0.02, 0.05);
    g.rotation.y = -side * 0.12;
    return g;
  }
  carry.add(makeHand(-1), makeHand(1));

  const chopA = new THREE.Mesh(track(new THREE.CylinderGeometry(0.005, 0.004, 0.22, 6)), chopM);
  chopA.rotation.z = Math.PI / 2;
  chopA.rotation.y = 0.18;
  chopA.position.set(0.24, 0.018, -0.16);
  const chopB = chopA.clone();
  chopB.position.z = -0.148;
  chopB.rotation.y = 0.12;
  tray.add(chopA, chopB);

  const bowlPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.03, 0.0),
    new THREE.Vector2(0.032, 0.006),
    new THREE.Vector2(0.024, 0.014),
    new THREE.Vector2(0.05, 0.02),
    new THREE.Vector2(0.092, 0.042),
    new THREE.Vector2(0.11, 0.072),
    new THREE.Vector2(0.114, 0.088),
    new THREE.Vector2(0.108, 0.094),
    new THREE.Vector2(0.1, 0.09),
    new THREE.Vector2(0.084, 0.055),
    new THREE.Vector2(0.038, 0.03),
    new THREE.Vector2(0.0, 0.028),
  ];
  const ramen = new THREE.Group();
  ramen.position.set(0, 0.01, 0);
  const bowl = new THREE.Mesh(track(new THREE.LatheGeometry(bowlPts, 24)), bowlM);
  const glaze = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.108, 0.007, 8, 24)),
    glazeM,
  );
  glaze.rotation.x = Math.PI / 2;
  glaze.position.y = 0.09;
  ramen.add(bowl, glaze);

  const contents = new THREE.Group();
  ramen.add(contents);
  const broth = new THREE.Mesh(track(new THREE.CircleGeometry(0.086, 24)), brothM);
  broth.rotation.x = -Math.PI / 2;
  broth.position.y = 0.052;
  contents.add(broth);

  const noodles: THREE.Mesh[] = [];
  const noodleRest: { pos: THREE.Vector3; rot: THREE.Euler }[] = [];
  for (let i = 0; i < 9; i++) {
    const pts: THREE.Vector3[] = [];
    const a0 = i * 0.7;
    for (let k = 0; k < 7; k++) {
      const u = k / 6;
      pts.push(
        new THREE.Vector3(
          Math.sin(a0 + u * 4.2) * (0.018 + u * 0.028),
          0.054 + Math.sin(u * Math.PI) * 0.012 + (i % 3) * 0.003,
          Math.cos(a0 * 0.8 + u * 3.4) * (0.016 + u * 0.026),
        ),
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const t = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 12, 0.0045, 5, false)), noodleM);
    contents.add(t);
    noodles.push(t);
    noodleRest.push({ pos: t.position.clone(), rot: t.rotation.clone() });
  }

  const nori = new THREE.Mesh(track(new THREE.BoxGeometry(0.038, 0.002, 0.07)), noriM);
  nori.rotation.x = 0.55;
  nori.rotation.z = -0.2;
  nori.position.set(0.038, 0.072, 0.01);
  contents.add(nori);

  const egg = new THREE.Group();
  const white = new THREE.Mesh(track(new THREE.SphereGeometry(0.028, 10, 8, 0, Math.PI)), eggWhite);
  white.rotation.z = Math.PI / 2;
  white.scale.set(1, 0.72, 1);
  const yolk = new THREE.Mesh(track(new THREE.CircleGeometry(0.014, 12)), eggYolk);
  yolk.rotation.y = Math.PI / 2;
  yolk.position.x = 0.002;
  egg.add(white, yolk);
  egg.position.set(-0.03, 0.06, -0.012);
  egg.rotation.y = 0.4;
  egg.rotation.z = -0.35;
  contents.add(egg);

  const steamTex = makeSteamTexture();
  const steam: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const sm = mat(
      new THREE.SpriteMaterial({
        map: steamTex,
        color: 0xeef4f6,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        alphaTest: 0.01,
      }),
    );
    const s = new THREE.Sprite(sm);
    s.center.set(0.5, 0.35);
    s.renderOrder = 8;
    ramen.add(s);
    steam.push(s);
  }

  tray.add(ramen);
  return { root, carry, tray, ramen, contents, broth, steam, noodles, noodleRest };
}

export function disposeWorld(world: World) {
  for (const g of world.geos) g.dispose();
  for (const m of world.mats) m.dispose();
}
