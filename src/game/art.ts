import * as THREE from "three";

export type GameArt = {
  tree: THREE.Texture;
  fern: THREE.Texture;
  bush: THREE.Texture;
  grass: THREE.Texture;
  fog: THREE.Texture;
  bark: THREE.Texture;
  floor: THREE.Texture;
  asphalt: THREE.Texture;
};

const FILES = {
  tree: "/game/pine-tree.png",
  fern: "/game/forest-fern.png",
  bush: "/game/forest-bush.png",
  grass: "/game/grass-clump.png",
  fog: "/game/fog-wisp.png",
  bark: "/game/pine-bark.png",
  floor: "/game/forest-floor.png",
  asphalt: "/game/asphalt.png",
} as const;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`missing ${src}`));
    img.src = src;
  });
}

function drawScaled(img: HTMLImageElement, max: number) {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(2, Math.round(img.width * scale));
  const h = Math.max(2, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

function isBackdrop(r: number, g: number, b: number) {
  if (r > 118 && b > 118 && g < r * 0.58 && g < b * 0.58) return true;
  if (r > 198 && g > 198 && b > 198 && Math.abs(r - g) < 22 && Math.abs(g - b) < 22) return true;
  return false;
}

function keyFromEdges(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  const seen = new Uint8Array(n);
  const q = new Int32Array(n);
  let head = 0;
  let tail = 0;

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i]) return;
    const o = i * 4;
    if (!isBackdrop(d[o], d[o + 1], d[o + 2])) return;
    seen[i] = 1;
    q[tail++] = i;
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  while (head < tail) {
    const i = q[head++];
    const x = i % w;
    const y = (i / w) | 0;
    d[i * 4 + 3] = 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  for (let i = 0; i < n; i++) {
    if (d[i * 4 + 3] === 0) continue;
    const x = i % w;
    const y = (i / w) | 0;
    const edge =
      (x > 0 && d[(i - 1) * 4 + 3] === 0) ||
      (x + 1 < w && d[(i + 1) * 4 + 3] === 0) ||
      (y > 0 && d[(i - w) * 4 + 3] === 0) ||
      (y + 1 < h && d[(i + w) * 4 + 3] === 0);
    if (!edge) continue;
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    if (isBackdrop(r, g, b) || r > 170 && b > 170 && g < 140) {
      d[i * 4 + 3] = 0;
    }
  }

  ctx.putImageData(img, 0, 0);
}

function nightGrade(ctx: CanvasRenderingContext2D, w: number, h: number, mul: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] = Math.round(d[i] * mul * 0.92);
    d[i + 1] = Math.round(d[i + 1] * mul);
    d[i + 2] = Math.round(d[i + 2] * mul * 0.88);
  }
  ctx.putImageData(img, 0, 0);
}

function fogAlpha(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.max(d[i], d[i + 1], d[i + 2]);
    d[i] = 210;
    d[i + 1] = 224;
    d[i + 2] = 236;
    d[i + 3] = lum;
  }
  ctx.putImageData(img, 0, 0);
}

function canvasTex(canvas: HTMLCanvasElement, repeat: boolean) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  return tex;
}

async function cutout(src: string, max: number, grade: number) {
  const img = await loadImage(src);
  const { canvas, ctx, w, h } = drawScaled(img, max);
  keyFromEdges(ctx, w, h);
  nightGrade(ctx, w, h, grade);
  return canvasTex(canvas, false);
}

async function albedo(src: string, max: number, grade: number) {
  const img = await loadImage(src);
  const { canvas, ctx, w, h } = drawScaled(img, max);
  nightGrade(ctx, w, h, grade);
  return canvasTex(canvas, true);
}

async function fogMap(src: string) {
  const img = await loadImage(src);
  const { canvas, ctx, w, h } = drawScaled(img, 768);
  fogAlpha(ctx, w, h);
  const tex = canvasTex(canvas, true);
  tex.premultiplyAlpha = true;
  return tex;
}

export async function loadGameArt(): Promise<GameArt> {
  const [tree, fern, bush, grass, fog, bark, floor, asphalt] = await Promise.all([
    cutout(FILES.tree, 1024, 0.72),
    cutout(FILES.fern, 768, 0.7),
    cutout(FILES.bush, 768, 0.68),
    cutout(FILES.grass, 768, 0.74),
    fogMap(FILES.fog),
    albedo(FILES.bark, 1024, 0.62),
    albedo(FILES.floor, 1024, 0.7),
    albedo(FILES.asphalt, 1024, 0.78),
  ]);
  bark.repeat.set(1, 3);
  floor.repeat.set(28, 140);
  asphalt.repeat.set(6, 90);
  return { tree, fern, bush, grass, fog, bark, floor, asphalt };
}

export function disposeArt(art: GameArt) {
  for (const t of Object.values(art)) t.dispose();
}

export function cutoutMat(map: THREE.Texture, tint = 0xc8d0c4) {
  const m = new THREE.MeshStandardMaterial({
    map,
    color: tint,
    roughness: 0.86,
    metalness: 0,
    transparent: true,
    alphaTest: 0.32,
    depthWrite: true,
    side: THREE.DoubleSide,
    fog: true,
  });
  m.customProgramCacheKey = () => "cutout-fog-fade";
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      `#include <fog_fragment>
       #ifdef USE_FOG
         float hide = smoothstep(0.42, 0.88, fogFactor);
         gl_FragColor.a *= 1.0 - hide;
         if (hide > 0.92) discard;
       #endif`,
    );
  };
  return m;
}
