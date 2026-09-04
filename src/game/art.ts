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

/**
 * Removes the magenta chroma-key backdrop these renders were shot against.
 * Gappy foliage (thin pine needles, twig tips) leaves thousands of
 * anti-aliased pixels that are a blend of magenta and foreground color,
 * scattered all through the canopy — not just at the outer silhouette. Two
 * problems that causes if handled naively:
 *  1. An edge-connected flood fill can't reach magenta trapped in gaps deep
 *     inside the silhouette, leaving solid opaque magenta blotches — the
 *     "purple sprite" look that shows up once a bright light (a street lamp)
 *     hits the card.
 *  2. Even after keying the solid magenta, the anti-aliased blend pixels
 *     around every needle edge are still magenta-tinted; a hard alpha cutoff
 *     leaves them as visible colored specks instead of fading cleanly.
 * Fix: key every backdrop-matching pixel globally (not edge-flood-fill), then
 * fade + de-tint ("spill suppress") every partially-magenta blend pixel.
 */
function keyFromEdges(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;

  const SPILL_FLOOR = 4;
  const SPILL_RANGE = 40;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const r = d[o];
    const g = d[o + 1];
    const b = d[o + 2];

    if (isBackdrop(r, g, b)) {
      d[o + 3] = 0;
      continue;
    }

    // Magenta = high R & B, low G, so (min(r,b) - g) measures how much
    // magenta is blended into this pixel even though it didn't cross the
    // hard isBackdrop threshold. Fade alpha and pull the tint back out.
    const spill = Math.max(0, Math.min(r, b) - g);
    if (spill > SPILL_FLOOR) {
      const t = Math.min(1, (spill - SPILL_FLOOR) / SPILL_RANGE);
      d[o + 3] = Math.round(d[o + 3] * (1 - t));
      d[o] = Math.max(0, Math.round(r - spill * t));
      d[o + 2] = Math.max(0, Math.round(b - spill * t));
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
