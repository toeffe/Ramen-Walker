import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { cutoutMat, type GameArt } from "@/game/art";
import { CHARACTER_SKIN, type CharacterAssets, type CharacterKey } from "@/game/characters";

/** The shared rig (see characters.ts) is authored at ~3.7 native units tall
 * (head to toe). Scale it down so a default character reads as a normal
 * ~1.8m adult in this game's meter-scale world. */
const BASE_CHAR_SCALE = 1.8 / 3.7;

/** Map original 1200m story meters onto the stretched road. Later segments
 * grow more because those holds are longer — walking time matches talk time. */
export function roadAt(oldMeters: number): number {
  const segs: readonly [from: number, to: number, scale: number][] = [
    [0, 90, 1],
    [90, 220, 1.25],
    [220, 640, 1.22],
    [640, 900, 1.28],
    [900, 1100, 1.45],
    [1100, 1200, 1.55],
  ];
  let out = 0;
  let remaining = Math.max(0, oldMeters);
  for (const [from, to, scale] of segs) {
    const span = to - from;
    if (remaining <= 0) break;
    const take = Math.min(remaining, span);
    out += take * scale;
    remaining -= take;
  }
  if (remaining > 0) out += remaining;
  return out;
}

export const HOUSE_Z = -roadAt(1200);
export const ROAD_HALF = 3.55;
export const SENTINEL_Z = -roadAt(90);
export const WATCHER_Z = -roadAt(220);
export const HUNGER_Z = -roadAt(640);
export const OTHER_Z = -roadAt(900);
export const WATCHER2_Z = -roadAt(1100);
export const WRONG_HOUSE_Z = -roadAt(1085);
export const WRONG_HOUSE_LIGHT_INTENSITY = 2.4;
const ROAD_END = HOUSE_Z - 50;

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

/** Weathered horizontal-plank siding, procedurally painted (same canvas-texture
 * pipeline as the rest of the game's art instead of a downloaded photo). */
function makePlankTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d");
  ctx.fillStyle = "#584636";
  ctx.fillRect(0, 0, 128, 128);
  const rows = 8;
  for (let i = 0; i < rows; i++) {
    const y = (i / rows) * 128;
    const h = 128 / rows;
    const shade = 60 + ((i * 37) % 26) - 13;
    ctx.fillStyle = `rgb(${shade + 40},${shade + 28},${shade + 16})`;
    ctx.fillRect(0, y, 128, h - 2);
    ctx.fillStyle = "rgba(20,14,8,0.55)";
    ctx.fillRect(0, y + h - 2, 128, 2);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    for (let g = 0; g < 5; g++) {
      const gx = (g / 5) * 128 + ((i % 2) * 12);
      ctx.fillRect(gx, y, 1, h - 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Overlapping roof shingles, same procedural approach as the siding. */
function makeShingleTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d");
  ctx.fillStyle = "#1e1a16";
  ctx.fillRect(0, 0, 128, 128);
  const rows = 10;
  for (let i = 0; i < rows; i++) {
    const y = (i / rows) * 128;
    const h = 128 / rows;
    const offset = (i % 2) * 10;
    ctx.fillStyle = i % 2 === 0 ? "#28221c" : "#211c17";
    for (let x = -10; x < 128; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x + offset, y + h);
      ctx.lineTo(x + offset + 10, y);
      ctx.lineTo(x + offset + 20, y + h);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, y + h - 1.5, 128, 1.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Small roadside marker with a scratched, half-legible name scored into it. */
const POST_NAMES = ["HELEN", "MARK", "JUNE", "ARI", "TOMAS", "ELLIE", "RIN", "PAUL", "NADIA"] as const;

function makeNamePostTexture(seed: number, name: string) {
  const rng = mulberry32(seed);
  const tex = makeSilhouette((ctx, w, h) => {
    ctx.fillStyle = "#3a2e22";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(0, (i / 8) * h, w, 2);
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.08 + rng() * 0.18})`;
      ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.floor(h * 0.46)}px "Times New Roman", "Georgia", serif`;
    ctx.fillStyle = "rgba(148, 36, 28, 0.38)";
    ctx.fillText(name, w * 0.5 + 3, h * 0.52 + 4);
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = "rgba(28, 18, 12, 0.85)";
    ctx.lineWidth = 8;
    ctx.strokeText(name, w * 0.5, h * 0.5);
    ctx.strokeStyle = "rgba(214, 206, 190, 0.92)";
    ctx.lineWidth = 3.5;
    ctx.strokeText(name, w * 0.5, h * 0.5);
    ctx.fillStyle = "rgba(232, 220, 198, 0.88)";
    ctx.fillText(name, w * 0.5, h * 0.5);
    ctx.strokeStyle = "rgba(214,206,190,0.35)";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(rand(rng, 8, w - 8), rand(rng, 8, h - 8));
      ctx.lineTo(rand(rng, 8, w - 8), rand(rng, 8, h - 8));
      ctx.stroke();
    }
  }, 512, 256);
  tex.anisotropy = 8;
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

// ---------------------------------------------------------------------------
// GLTF character rigs (Kenney "Blocky Characters", CC0 — see
// public/game/chars/ATTRIBUTION.txt). Each GLB shares the same rig:
// root -> leg-left, leg-right, torso -> arm-left, arm-right, head. Only
// `head` carries its own local scale (0.1), so prop anchors on the head
// need a compensating wrapper; everything else is unscaled.
// ---------------------------------------------------------------------------

export type CharacterRig = {
  /** Add this to the scene / reposition every frame — matches the old NPC roots. */
  outer: THREE.Group;
  head: THREE.Object3D;
  torso: THREE.Object3D;
  /** Upper-arm bones. Bind pose carries a big roll/twist on these, so only
   * use them for one-time SCALE effects (e.g. Hunger's stretched arms) —
   * their visible mesh deformation responds to bone transforms directly.
   * Do not directly set .rotation on these; see foreArmL/foreArmR. */
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  /** Forearm bones — near-identity bind rotation, safe to drive per-frame
   * gestures (raise/reach) with plain .rotation.x/.set() like the old rig. */
  foreArmL: THREE.Object3D;
  foreArmR: THREE.Object3D;
  /** Hand bones — good, stable attachment points for held props (lantern, tray). */
  handL: THREE.Object3D;
  handR: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  idleAction: THREE.AnimationAction | null;
  runAction: THREE.AnimationAction | null;
};

const neutralizeScale = new THREE.Vector3();

function neutralize(parent: THREE.Object3D) {
  const g = new THREE.Group();
  parent.add(g);
  parent.updateWorldMatrix(true, false);
  parent.getWorldScale(neutralizeScale);
  g.scale.set(
    1 / Math.max(1e-6, neutralizeScale.x),
    1 / Math.max(1e-6, neutralizeScale.y),
    1 / Math.max(1e-6, neutralizeScale.z),
  );
  return g;
}

/**
 * Builds one NPC from the shared human-proportioned rig (see characters.ts):
 * clones the base skeleton+mesh, gives it its own skin texture + tint, and
 * wires up bone references other code hangs props/lights/gestures off of.
 * Real GLTF geometry with a proper skeleton — not primitive shapes, and not
 * Kenney's blocky/voxel "Blocky Characters" kit either.
 */
function kitCharacter(
  chars: CharacterAssets,
  key: CharacterKey,
  track: (g: THREE.BufferGeometry) => THREE.BufferGeometry,
  mat: <T extends THREE.Material>(m: T) => T,
  opts: { tint: number; roughness?: number; scale?: number | [number, number, number] },
): CharacterRig {
  const inner = SkeletonUtils.clone(chars.baseScene) as THREE.Group;
  const s = opts.scale ?? 1;
  if (Array.isArray(s)) inner.scale.set(s[0] * BASE_CHAR_SCALE, s[1] * BASE_CHAR_SCALE, s[2] * BASE_CHAR_SCALE);
  else inner.scale.setScalar(s * BASE_CHAR_SCALE);

  const bones: Partial<Record<string, THREE.Object3D>> = {};
  let material: THREE.MeshStandardMaterial | null = null;
  const skinTex = chars.skins[CHARACTER_SKIN[key]];

  inner.traverse((o) => {
    if (
      o.name === "Head" ||
      o.name === "Chest" ||
      o.name === "LeftArm" ||
      o.name === "RightArm" ||
      o.name === "LeftForeArm" ||
      o.name === "RightForeArm" ||
      o.name === "LeftHand" ||
      o.name === "RightHand"
    ) {
      bones[o.name] = o;
    }
    if ((o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh;
      track(mesh.geometry);
      if (!material) {
        material = mat(
          new THREE.MeshStandardMaterial({
            map: skinTex,
            color: opts.tint,
            roughness: opts.roughness ?? 0.94,
            metalness: 0.02,
            fog: true,
          }),
        );
      }
      mesh.material = material;
    }
  });

  const head = bones.Head;
  const torso = bones.Chest;
  const armL = bones.LeftArm;
  const armR = bones.RightArm;
  const foreArmL = bones.LeftForeArm;
  const foreArmR = bones.RightForeArm;
  const handL = bones.LeftHand;
  const handR = bones.RightHand;
  if (!head || !torso || !armL || !armR || !foreArmL || !foreArmR || !handL || !handR) {
    throw new Error("character GLB is missing an expected rig bone");
  }

  const outer = new THREE.Group();
  outer.add(inner);

  const mixer = new THREE.AnimationMixer(inner);
  const idleClip = THREE.AnimationClip.findByName(chars.clips, "idle");
  const runClip = THREE.AnimationClip.findByName(chars.clips, "run");
  const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
  const runAction = runClip ? mixer.clipAction(runClip) : null;
  idleAction?.play();

  return { outer, head, torso, armL, armR, foreArmL, foreArmR, handL, handR, mixer, idleAction, runAction };
}

export type Viewmodel = {
  root: THREE.Group;
  carry: THREE.Group;
  hands: THREE.Group;
  /** Palms on the tray rims, fingers along the board — waiter-only, so the
   * FPS finger sticks don't point at the balancer camera. */
  grips: THREE.Group;
  tray: THREE.Group;
  ramen: THREE.Group;
  contents: THREE.Group;
  broth: THREE.Mesh;
  steam: THREE.Sprite[];
  noodles: THREE.Mesh[];
  noodleMound: THREE.Mesh;
  noodleRest: { pos: THREE.Vector3; rot: THREE.Euler }[];
};

export type LampLight = {
  point: THREE.PointLight;
  spot: THREE.SpotLight;
  z: number;
  pointIntensity: number;
  spotIntensity: number;
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
  wrongHouse: THREE.Group;
  wrongHouseLight: THREE.PointLight;
  scareFace: THREE.Group;
  bushHands: THREE.Group;
  glimpse: THREE.Group;
  otherWalker: THREE.Group;
  otherWalkerHead: THREE.Object3D;
  namePosts: THREE.Group;
  offerings: THREE.Group;
  lampLights: LampLight[];
  lampDying: THREE.PointLight;
  fireflies: THREE.Points;
  mixers: THREE.AnimationMixer[];
  viewmodel: Viewmodel;
  /** Kenney CC0 human (same pack as the NPCs). Waiter camera only. */
  walkerBody: CharacterRig;
  flashlight: THREE.SpotLight;
  fogTime: { value: number };
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
};

/** Reusable night-house builder — the real destination and the decoy
 * "wrong house" both come out of this, per the plan's house remodel. */
function buildHouse(
  track: (g: THREE.BufferGeometry) => THREE.BufferGeometry,
  mat: <T extends THREE.Material>(m: T) => T,
  plankTex: THREE.Texture,
  shingleTex: THREE.Texture,
  opts: { warm: boolean; silhouette: boolean; withYard: boolean },
) {
  const group = new THREE.Group();
  const W = 6.2;
  const D = 6.2;
  const wallH = 4.0;
  const rise = 2.4;
  const eaveY = wallH + 0.32; // + foundation

  const wallM = mat(
    new THREE.MeshStandardMaterial({
      map: plankTex,
      color: opts.warm ? 0x8a8272 : 0x5c5c60,
      roughness: 0.9,
    }),
  );
  const trimM = mat(
    new THREE.MeshStandardMaterial({ color: opts.warm ? 0x241e16 : 0x1c1c1e, roughness: 0.85, flatShading: true }),
  );
  const roofM = mat(
    new THREE.MeshStandardMaterial({ map: shingleTex, color: opts.warm ? 0x9a9284 : 0x6a6a70, roughness: 0.92 }),
  );
  const glowM = mat(
    new THREE.MeshStandardMaterial({
      color: opts.warm ? 0x6a3a12 : 0x1c2430,
      emissive: opts.warm ? 0x6a380c : 0x223040,
      emissiveIntensity: opts.warm ? 0.85 : 0.3,
      flatShading: true,
    }),
  );

  const foundation = new THREE.Mesh(track(new THREE.BoxGeometry(W + 0.4, 0.32, D + 0.4)), trimM);
  foundation.position.y = 0.16;
  const wall = new THREE.Mesh(track(new THREE.BoxGeometry(W, wallH, D)), wallM);
  wall.position.y = 0.32 + wallH / 2;
  group.add(foundation, wall);

  // Gable roof — two sloped pitches meeting at a ridge, plus a flat front
  // gable-end panel (the only face the player ever really sees head-on).
  const theta = Math.atan2(rise, W / 2 + 0.5);
  const slopeLen = Math.hypot(W / 2 + 0.5, rise);
  const pitchGeo = track(new THREE.BoxGeometry(slopeLen, 0.1, D + 0.8));
  const pitchL = new THREE.Mesh(pitchGeo, roofM);
  pitchL.position.set(-(W / 4 + 0.25), eaveY + rise / 2, 0);
  pitchL.rotation.z = theta;
  const pitchR = new THREE.Mesh(pitchGeo, roofM);
  pitchR.position.set(W / 4 + 0.25, eaveY + rise / 2, 0);
  pitchR.rotation.z = -theta;
  group.add(pitchL, pitchR);

  const gableShape = new THREE.Shape();
  gableShape.moveTo(-W / 2, 0);
  gableShape.lineTo(W / 2, 0);
  gableShape.lineTo(0, rise);
  gableShape.closePath();
  const gableFront = new THREE.Mesh(track(new THREE.ShapeGeometry(gableShape)), wallM);
  gableFront.position.set(0, eaveY, D / 2 - 0.02);
  group.add(gableFront);

  const chimney = new THREE.Mesh(track(new THREE.BoxGeometry(0.55, 1.9, 0.55)), trimM);
  chimney.position.set(1.7, eaveY + rise * 0.55 + 0.9, -0.9);
  group.add(chimney);

  // Porch: raised deck, steps down to the road, posts + railing.
  const porchDepth = 1.7;
  const porchY = 0.42;
  const deck = new THREE.Mesh(track(new THREE.BoxGeometry(W * 0.72, 0.12, porchDepth)), trimM);
  deck.position.set(0, porchY, D / 2 + porchDepth / 2);
  group.add(deck);
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(track(new THREE.BoxGeometry(W * 0.5, 0.1, 0.32)), trimM);
    step.position.set(0, porchY - 0.12 - s * 0.12, D / 2 + porchDepth + 0.16 + s * 0.32);
    group.add(step);
  }
  const postGeo = track(new THREE.CylinderGeometry(0.06, 0.06, 2.1, 8));
  const railGeo = track(new THREE.BoxGeometry(0.05, 0.05, porchDepth - 0.1));
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, trimM);
    post.position.set(side * (W * 0.32), porchY + 1.05, D / 2 + porchDepth - 0.15);
    group.add(post);
    const rail = new THREE.Mesh(railGeo, trimM);
    rail.position.set(side * (W * 0.32), porchY + 0.45, D / 2 + porchDepth / 2 - 0.05);
    group.add(rail);
  }
  const canopy = new THREE.Mesh(track(new THREE.BoxGeometry(W * 0.78, 0.08, porchDepth + 0.3)), roofM);
  canopy.position.set(0, porchY + 2.05, D / 2 + porchDepth / 2);
  group.add(canopy);

  // Door + frame.
  const doorFrame = new THREE.Mesh(track(new THREE.BoxGeometry(1.3, 2.5, 0.12)), trimM);
  doorFrame.position.set(0, porchY + 1.35, D / 2 + 0.02);
  const door = new THREE.Mesh(track(new THREE.PlaneGeometry(0.95, 2.15)), glowM);
  door.position.set(0, porchY + 1.28, D / 2 + 0.09);
  group.add(doorFrame, door);

  // Windows with sills; the destination gets a standing silhouette in one.
  const winFrame = track(new THREE.BoxGeometry(1.05, 1.05, 0.14));
  const winGlow = track(new THREE.PlaneGeometry(0.82, 0.82));
  const sillGeo = track(new THREE.BoxGeometry(1.2, 0.08, 0.16));
  const winX = [-1.95, 1.95];
  for (let i = 0; i < winX.length; i++) {
    const x = winX[i];
    const f = new THREE.Mesh(winFrame, trimM);
    f.position.set(x, eaveY - 1.15, D / 2 + 0.02);
    const p = new THREE.Mesh(winGlow, glowM);
    p.position.set(x, eaveY - 1.15, D / 2 + 0.1);
    const sill = new THREE.Mesh(sillGeo, trimM);
    sill.position.set(x, eaveY - 1.7, D / 2 + 0.08);
    group.add(f, p, sill);
    if (opts.silhouette && i === 0) {
      const silTex = makeSilhouette((ctx, w, h) => {
        ctx.fillStyle = "#0a0806";
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.28, w * 0.16, h * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(w * 0.3, h * 0.42, w * 0.4, h * 0.6);
      }, 96, 128);
      const silM = mat(
        new THREE.MeshBasicMaterial({ map: silTex, transparent: true, alphaTest: 0.4, fog: true }),
      );
      const sil = new THREE.Mesh(track(new THREE.PlaneGeometry(0.62, 0.78)), silM);
      sil.position.set(x, eaveY - 1.18, D / 2 + 0.06);
      group.add(sil);
    }
  }

  // Mailbox + short path + one yard tree (destination only).
  if (opts.withYard) {
    const mailPostM = stdMat(mat, 0x2a241c, { roughness: 0.7 });
    const mailBoxM = stdMat(mat, 0x3a4a3a, { roughness: 0.6, metalness: 0.15 });
    const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6)), mailPostM);
    post.position.set(-2.6, 0.45, D / 2 + porchDepth + 1.4);
    const box = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.12, 0.22, 3, 8)), mailBoxM);
    box.rotation.z = Math.PI / 2;
    box.position.set(-2.6, 0.92, D / 2 + porchDepth + 1.4);
    group.add(post, box);
    const pathM = mat(new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.95 }));
    const path = new THREE.Mesh(track(new THREE.PlaneGeometry(1.1, porchDepth + 1.6)), pathM);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.005, D / 2 + porchDepth + 0.8);
    group.add(path);
  }

  const porchLight = new THREE.PointLight(
    opts.warm ? 0xffb060 : 0x8098c0,
    opts.warm ? 6 : WRONG_HOUSE_LIGHT_INTENSITY,
    opts.warm ? 18 : 10,
    1.6,
  );
  porchLight.position.set(0, porchY + 2, D / 2 + porchDepth * 0.6);
  group.add(porchLight);

  const fixtureM = stdMat(mat, 0x18140f, { roughness: 0.5, metalness: 0.4 });
  const fixture = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.1, 0.16, 8)), fixtureM);
  fixture.position.set(0, porchY + 1.95, D / 2 + porchDepth * 0.55);
  group.add(fixture);

  return { group, porchLight };
}

export function buildWorld(scene: THREE.Scene, camera: THREE.Camera, art: GameArt, chars: CharacterAssets): World {
  const rng = mulberry32(0x5a1e);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const mixers: THREE.AnimationMixer[] = [];
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

  const groundLen = -HOUSE_Z + 500;
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(280, groundLen)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.04, HOUSE_Z / 2 - 40);
  scene.add(ground);

  const roadLen = -HOUSE_Z + 120;
  const ROAD_Z = HOUSE_Z / 2 - 10;
  const road = new THREE.Mesh(track(new THREE.PlaneGeometry(8.4, roadLen)), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, ROAD_Z);
  scene.add(road);
  const stripe = new THREE.Mesh(track(new THREE.PlaneGeometry(0.11, roadLen - 40)), trackMat);
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, 0.012, ROAD_Z);
  scene.add(stripe);
  const shoulderL = new THREE.Mesh(track(new THREE.PlaneGeometry(2.2, roadLen)), dirtMat);
  shoulderL.rotation.x = -Math.PI / 2;
  shoulderL.position.set(-5.1, 0.006, ROAD_Z);
  scene.add(shoulderL);
  const shoulderR = shoulderL.clone();
  shoulderR.position.x = 5.1;
  scene.add(shoulderR);

  // Railings — posts + two rails, both sides. Extended to the new road length.
  const postGeo = track(new THREE.BoxGeometry(0.11, 1.15, 0.11));
  const railGeo = track(new THREE.BoxGeometry(0.07, 0.055, 2.8));
  const postCount = 1250;
  const posts = new THREE.InstancedMesh(postGeo, railDark, postCount);
  const railCount = 2500;
  const rails = new THREE.InstancedMesh(railGeo, railMat, railCount);
  const dummy = new THREE.Object3D();
  let pi = 0;
  let ri = 0;
  for (const side of [-1, 1]) {
    const x = side * 4.25;
    for (let z = 52; z > ROAD_END && pi < postCount; z -= 2.8) {
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

  scatterCards(treeMat, 1650, (d, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const row = i % 8;
    d.position.set(
      side * (5.05 + row * 1.28 + rand(rng, -0.3, 0.45)),
      0,
      14 - Math.floor(i / 2) * 1.95 + rand(rng, -0.65, 0.65),
    );
    const h = rand(rng, 8.2, 15.5) * (row > 4 ? 1.22 : row < 2 ? 0.92 : 1);
    d.scale.set(h * 0.52, h, 1);
    d.rotation.y = rng() * Math.PI;
  }, 2);

  scatterCards(fernMat, 2550, (d) => {
    const side = rng() > 0.5 ? 1 : -1;
    d.position.set(side * rand(rng, 4.38, 8.8), 0, rand(rng, 46, ROAD_END));
    const h = rand(rng, 0.65, 1.75);
    d.scale.set(h * 1.05, h, 1);
    d.rotation.y = rng() * Math.PI;
  }, 2);

  scatterCards(bushMat, 1050, (d) => {
    const side = rng() > 0.5 ? 1 : -1;
    d.position.set(side * rand(rng, 4.7, 10.5), 0, rand(rng, 44, ROAD_END));
    const h = rand(rng, 1.15, 2.55);
    d.scale.set(h * 1.4, h, 1);
    d.rotation.y = rng() * Math.PI;
  }, 2);

  scatterCards(grassMat, 3500, (d) => {
    const side = rng() > 0.5 ? 1 : -1;
    d.position.set(side * rand(rng, 4.32, 11.5), 0, rand(rng, 46, ROAD_END));
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
  const logs = new THREE.InstancedMesh(logGeo, barkMat, 120);
  for (let i = 0; i < 120; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    dummy.position.set(side * rand(rng, 5.4, 8.8), 0.14, rand(rng, 42, ROAD_END));
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
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 230);
  for (let i = 0; i < 230; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    dummy.position.set(side * rand(rng, 4.7, 10), 0.12, rand(rng, 38, ROAD_END));
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
  for (let i = 0; i < 230; i++) {
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

  // Street lamps — Three r185 uses physical light units, so old intensities
  // (~9.5) were candle-dim. Bumped to real streetlamp candela, plus a
  // downward SpotLight per hood for a visible pool on the asphalt. Only the
  // nearest handful stay lit at once (see engine.ts's per-frame pooling);
  // the rest sit at intensity 0 / invisible until the player gets close.
  const LAMP_POINT_INTENSITY = 230;
  const LAMP_POINT_DISTANCE = 22;
  const LAMP_POINT_DECAY = 2;
  const LAMP_SPOT_INTENSITY = 340;
  const LAMP_SPOT_DISTANCE = 15;
  const LAMP_SPOT_ANGLE = THREE.MathUtils.degToRad(50);
  const LAMP_SPOT_PENUMBRA = 0.55;

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
  const lampLights: LampLight[] = [];
  let lampDying: THREE.PointLight | null = null;
  const LAMP_COUNT = 56;
  for (let i = 0; i < LAMP_COUNT; i++) {
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

    const point = new THREE.PointLight(0xffd4a0, LAMP_POINT_INTENSITY, LAMP_POINT_DISTANCE, LAMP_POINT_DECAY);
    point.position.set(side * 2.55, 4.85, z);
    scene.add(point);

    const spot = new THREE.SpotLight(
      0xffdcae,
      LAMP_SPOT_INTENSITY,
      LAMP_SPOT_DISTANCE,
      LAMP_SPOT_ANGLE,
      LAMP_SPOT_PENUMBRA,
      1.4,
    );
    spot.position.set(side * 2.55, 5.0, z);
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(side * 2.55, 0, z);
    scene.add(spotTarget);
    spot.target = spotTarget;
    scene.add(spot);

    if (i === 7) {
      lampDying = point;
      point.intensity = LAMP_POINT_INTENSITY * 0.65;
      point.visible = true;
      spot.visible = true;
      // The dying lamp is a dedicated narrative light (see engine.ts's
      // blackout beat) — kept out of the generic distance pool below.
      continue;
    }

    point.visible = false;
    spot.visible = false;
    lampLights.push({ point, spot, z, pointIntensity: LAMP_POINT_INTENSITY, spotIntensity: LAMP_SPOT_INTENSITY });
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
    const point = new THREE.PointLight(0xffd4a0, LAMP_POINT_INTENSITY * 0.8, LAMP_POINT_DISTANCE * 0.85, 1.7);
    point.position.set(side * 2.55, 4.85, z);
    point.visible = false;
    scene.add(point);
    const spot = new THREE.SpotLight(
      0xffdcae,
      LAMP_SPOT_INTENSITY * 0.8,
      LAMP_SPOT_DISTANCE,
      LAMP_SPOT_ANGLE,
      LAMP_SPOT_PENUMBRA,
      1.4,
    );
    spot.position.set(side * 2.55, 5.0, z);
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(side * 2.55, 0, z);
    scene.add(spotTarget);
    spot.target = spotTarget;
    spot.visible = false;
    scene.add(spot);
    lampLights.push({
      point,
      spot,
      z,
      pointIntensity: LAMP_POINT_INTENSITY * 0.8,
      spotIntensity: LAMP_SPOT_INTENSITY * 0.8,
    });
  }

  // Sentinel — roadside watchman, GLTF humanoid with the lantern + gold-eye
  // reveal kept as attached Three.js props.
  const sentinelRig = kitCharacter(chars, "sentinel", track, mat, { tint: 0x6a6a5c, roughness: 0.92, scale: 1.02 });
  mixers.push(sentinelRig.mixer);
  const mailbox = sentinelRig.outer;
  // Forearm, not upper-arm: the upper-arm bone carries a big bind-pose twist,
  // the forearm is near-identity so plain .rotation.x reads as a clean raise.
  const mailboxFlag = sentinelRig.foreArmR;
  mailboxFlag.rotation.x = 0.35;
  const mailboxEyeMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0x1a0806,
      emissive: 0xc4a030,
      emissiveIntensity: 0,
      roughness: 0.35,
    }),
  );
  const mailboxEyeAnchor = neutralize(sentinelRig.head);
  const mailboxEye = new THREE.Group();
  mailboxEye.position.set(0, 0.11, 0.08);
  const sentryEyeGeo = track(new THREE.SphereGeometry(0.028, 10, 8));
  const sentryEyeL = new THREE.Mesh(sentryEyeGeo, mailboxEyeMat);
  sentryEyeL.position.set(-0.035, 0, 0);
  const sentryEyeR = sentryEyeL.clone();
  sentryEyeR.position.x = 0.035;
  mailboxEye.add(sentryEyeL, sentryEyeR);
  mailboxEyeAnchor.add(mailboxEye);
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
  const handAnchor = neutralize(sentinelRig.handR);
  lantern.position.set(0, -0.04, 0.05);
  handAnchor.add(lantern);
  const lanternLight = new THREE.PointLight(0xffc070, 1.8, 4.5, 1.8);
  lanternLight.position.copy(lantern.position);
  handAnchor.add(lanternLight);
  mailbox.position.set(-3.15, 0, SENTINEL_Z);
  mailbox.rotation.y = Math.PI / 2;
  scene.add(mailbox);

  // Watcher — taller, paler, suit-coated.
  const watcherRig = kitCharacter(chars, "watcher", track, mat, { tint: 0x383a42, roughness: 0.82, scale: 1.14 });
  mixers.push(watcherRig.mixer);
  const stranger = watcherRig.outer;
  const strangerHead = watcherRig.head;
  stranger.position.set(1.4, 0, WATCHER_Z);
  stranger.visible = false;
  scene.add(stranger);

  // Hunger — largest, darkest, wet, stretched-arm horror.
  const hungerRig = kitCharacter(chars, "hunger", track, mat, {
    tint: 0x281a16,
    roughness: 0.5,
    scale: 1.42,
  });
  mixers.push(hungerRig.mixer);
  const monster = hungerRig.outer;
  // Scaling the actual upper-arm BONE (not a decorative wrapper) is what
  // makes this visibly stretch the skinned mesh — a real deformed reach.
  hungerRig.armL.scale.set(1.1, 2.1, 1.1);
  hungerRig.armR.scale.set(1.1, 2.1, 1.1);
  // Forearms (near-identity bind rotation) drive the per-frame reach gesture.
  const armL = hungerRig.foreArmL;
  const armR = hungerRig.foreArmR;
  const eyeGlowM = mat(
    new THREE.MeshStandardMaterial({
      color: 0x9e2a22,
      emissive: 0x9e2a22,
      emissiveIntensity: 2.6,
      roughness: 0.4,
    }),
  );
  const hungerEyeAnchor = neutralize(hungerRig.head);
  const hungerEyeGeo = track(new THREE.SphereGeometry(0.045, 10, 8));
  const e1 = new THREE.Mesh(hungerEyeGeo, eyeGlowM);
  e1.position.set(-0.04, 0.08, 0.1);
  const e2 = e1.clone();
  e2.position.x = 0.04;
  const e3 = e1.clone();
  e3.position.set(0, 0.14, 0.09);
  e3.scale.setScalar(0.7);
  hungerEyeAnchor.add(e1, e2, e3);
  const jaw = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 0.04, 0.1)), stdMat(mat, 0x1a1210, { roughness: 0.7 }));
  jaw.position.set(0, -0.04, 0.1);
  hungerEyeAnchor.add(jaw);
  monster.position.set(0, 0, HUNGER_Z);
  monster.visible = false;
  scene.add(monster);
  const monsterGlow = new THREE.PointLight(0x9e2a22, 0, 10);
  monsterGlow.position.set(0, 3.1, HUNGER_Z + 2);
  scene.add(monsterGlow);

  // Wrong house first, since the real house reuses the same builder just
  // below and both share the plank/shingle textures.
  const plankTex = makePlankTexture();
  const shingleTex = makeShingleTexture();

  const wrongBuilt = buildHouse(track, mat, plankTex, shingleTex, {
    warm: false,
    silhouette: false,
    withYard: false,
  });
  wrongBuilt.group.position.set(0, 0, WRONG_HOUSE_Z);
  wrongBuilt.group.visible = false;
  scene.add(wrongBuilt.group);

  const houseBuilt = buildHouse(track, mat, plankTex, shingleTex, {
    warm: true,
    silhouette: true,
    withYard: true,
  });
  houseBuilt.group.position.set(0, 0, HOUSE_Z);
  scene.add(houseBuilt.group);
  const house = houseBuilt.group;
  const porchLight = houseBuilt.porchLight;
  const wrongHouse = wrongBuilt.group;
  const wrongHouseLight = wrongBuilt.porchLight;

  // Name posts — a fence stretch with carved names, after the Sentinel.
  const namePosts = new THREE.Group();
  const postWoodM = stdMat(mat, 0x2a2018, { roughness: 0.85 });
  for (let i = 0; i < 9; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -roadAt(112 + i * 6.4);
    const post = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, 1.7, 0.12)), postWoodM);
    post.position.set(side * 3.95, 0.85, z);
    namePosts.add(post);
    const plaqueTex = makeNamePostTexture(0x1000 + i, POST_NAMES[i]);
    const plaqueM = mat(
      new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.85, side: THREE.DoubleSide }),
    );
    const plaque = new THREE.Mesh(track(new THREE.PlaneGeometry(0.72, 0.42)), plaqueM);
    plaque.position.set(side * 3.86, 1.22, z);
    // Face the road; flip local X so letters read L→R when looking from the asphalt
    // (plane UVs otherwise mirror after the ±90° yaw).
    plaque.rotation.y = side * (Math.PI / 2);
    plaque.scale.x = -1;
    namePosts.add(plaque);
  }
  scene.add(namePosts);

  // Offerings — empty bowls left on the shoulder, ~695m-760m. First hint
  // that something has already been paid before The Other confirms it.
  const offerings = new THREE.Group();
  const offerBowlM = stdMat(mat, 0xd8c8ac, { roughness: 0.3 });
  const stainM = mat(
    new THREE.MeshStandardMaterial({ color: 0x1a1006, roughness: 0.95, transparent: true, opacity: 0.55 }),
  );
  const offerBowlGeo = track(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62));
  const stainGeo = track(new THREE.CircleGeometry(0.24, 16));
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -roadAt(696 + i * 12);
    const stain = new THREE.Mesh(stainGeo, stainM);
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(side * rand(rng, 4.6, 6.4), 0.008, z);
    offerings.add(stain);
    const bowl = new THREE.Mesh(offerBowlGeo, offerBowlM);
    bowl.rotation.x = Math.PI;
    bowl.position.set(stain.position.x + rand(rng, -0.15, 0.15), 0.1, z + rand(rng, -0.15, 0.15));
    offerings.add(bowl);
  }
  scene.add(offerings);

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
  bushHands.position.set(4.4, 0, -roadAt(507));
  bushHands.visible = false;
  scene.add(bushHands);

  const glimpseRig = kitCharacter(chars, "glimpse", track, mat, {
    tint: 0x2a2420,
    roughness: 1,
    scale: [0.92, 1.05, 0.92],
  });
  mixers.push(glimpseRig.mixer);
  const glimpse = glimpseRig.outer;
  glimpse.position.set(4.2, 0, -roadAt(495));
  glimpse.visible = false;
  scene.add(glimpse);

  // The Other — a figure walking the opposite way, tray empty.
  const otherRig = kitCharacter(chars, "other", track, mat, { tint: 0x5c4a38, roughness: 0.9, scale: 1.0 });
  mixers.push(otherRig.mixer);
  const otherWalker = otherRig.outer;
  const otherWalkerHead = otherRig.head;
  const otherTrayM = stdMat(mat, 0x3a281a, { roughness: 0.75 });
  const otherTray = new THREE.Mesh(track(new THREE.BoxGeometry(0.46, 0.02, 0.3)), otherTrayM);
  otherTray.position.set(0, 0.9, 0.24);
  otherWalker.add(otherTray);
  otherWalker.position.set(-1.1, 0, OTHER_Z);
  otherWalker.rotation.y = Math.PI;
  otherWalker.visible = false;
  scene.add(otherWalker);

  // Co-op walker — Kenney "Animated Characters 3" (CC0), same rig as every
  // NPC. Hidden from the first-person camera; the waiter sees this instead
  // of the FPS arms. Hands are IK'd onto the tray each frame.
  const walkerBody = kitCharacter(chars, "player", track, mat, {
    tint: 0xb9a890,
    roughness: 0.88,
    scale: 1.0,
  });
  mixers.push(walkerBody.mixer);
  walkerBody.outer.visible = false;
  const walkerFill = new THREE.PointLight(0xffe6c4, 0.7, 4, 1.8);
  walkerFill.position.set(0, 1.4, -0.45);
  walkerBody.outer.add(walkerFill);
  scene.add(walkerBody.outer);

  // Fireflies
  const fireflyCount = 90;
  const fPos = new Float32Array(fireflyCount * 3);
  for (let i = 0; i < fireflyCount; i++) {
    fPos[i * 3] = (rng() - 0.5) * 36;
    fPos[i * 3 + 1] = 0.4 + rng() * 3.4;
    fPos[i * 3 + 2] = rand(rng, 38, ROAD_END);
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

  const viewmodel = buildViewmodel(scene, mat, track);

  return {
    mailbox,
    mailboxFlag,
    mailboxEye,
    mailboxEyeMat,
    stranger,
    strangerHead,
    monster,
    monsterGlow,
    monsterArms: [armL, armR],
    house,
    porchLight,
    wrongHouse,
    wrongHouseLight,
    scareFace,
    bushHands,
    glimpse,
    otherWalker,
    otherWalkerHead,
    namePosts,
    offerings,
    lampLights,
    lampDying: lampDying ?? new THREE.PointLight(0x000000, 0),
    fireflies,
    mixers,
    viewmodel,
    walkerBody,
    flashlight,
    fogTime,
    geos,
    mats,
  };
}

function buildViewmodel(
  scene: THREE.Scene,
  mat: <T extends THREE.Material>(m: T) => T,
  track: (g: THREE.BufferGeometry) => THREE.BufferGeometry,
): Viewmodel {
  // World-space rig (not camera-attached) so a second, independently
  // positioned camera (e.g. a co-op "waiter" player) can view the tray
  // and bowl from any angle, including from the front looking back at
  // the walker. The engine positions/rotates `root` every frame to
  // track the walker's head (position + yaw + pitch + bob), so it reads
  // identically to a camera-attached viewmodel for the walker itself.
  const root = new THREE.Group();
  scene.add(root);

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
    new THREE.MeshStandardMaterial({
      color: 0xd4b26a,
      roughness: 0.42,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
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
  const hands = new THREE.Group();
  hands.add(makeHand(-1), makeHand(1));
  carry.add(hands);

  function makeGrip(side: number) {
    const g = new THREE.Group();
    const palm = new THREE.Mesh(track(new THREE.SphereGeometry(0.05, 7, 5)), skin);
    palm.scale.set(0.7, 0.45, 1.15);
    palm.position.set(side * 0.02, 0.04, 0);
    g.add(palm);
    const tips = [-0.05, -0.018, 0.018, 0.05];
    for (const z of tips) {
      const f = new THREE.Mesh(track(new THREE.CylinderGeometry(0.011, 0.009, 0.08, 5)), skin);
      f.rotation.z = side * (Math.PI / 2);
      f.position.set(-side * 0.055, 0.035, z);
      g.add(f);
    }
    const thumb = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.01, 0.05, 5)), skin);
    thumb.rotation.x = Math.PI / 2;
    thumb.position.set(side * 0.01, 0.03, 0.08);
    g.add(thumb);
    g.position.set(side * 0.3, 0.0, 0.02);
    return g;
  }
  const grips = new THREE.Group();
  grips.add(makeGrip(-1), makeGrip(1));
  grips.visible = false;
  carry.add(grips);

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
    const t = new THREE.Mesh(track(new THREE.TubeGeometry(curve, 12, 0.0065, 5, false)), noodleM);
    contents.add(t);
    noodles.push(t);
    noodleRest.push({ pos: t.position.clone(), rot: t.rotation.clone() });
  }

  const noodleMound = new THREE.Mesh(track(new THREE.SphereGeometry(0.078, 12, 8)), noodleM);
  noodleMound.scale.set(1, 0.42, 1);
  noodleMound.position.set(0, 0.068, 0);
  noodleMound.visible = false;
  contents.add(noodleMound);

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
        depthTest: true,
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
  return { root, carry, hands, grips, tray, ramen, contents, broth, steam, noodles, noodleMound, noodleRest };
}

export function disposeWorld(world: World) {
  for (const g of world.geos) g.dispose();
  for (const m of world.mats) m.dispose();
}
