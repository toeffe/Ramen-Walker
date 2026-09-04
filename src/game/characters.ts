import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Real, human-proportioned 3D character meshes (Kenney "Animated Characters
 * 3", CC0 — see public/game/chars/ATTRIBUTION.txt), not the flat-shape
 * primitive kits this game started with, and NOT Kenney's "Blocky
 * Characters" pack (that one is a Minecraft-style voxel/cube kit — wrong
 * look for a horror game, even though it's also GLTF).
 *
 * The pack ships one shared skeleton: a single base mesh
 * (character-base.glb, no material) plus separate animation-only clips
 * (anim-idle.glb, anim-run.glb) that share bone names with it. Every NPC
 * clones the same base + clips via SkeletonUtils and gets its own skin
 * texture + tint (see kitCharacter in world.ts) — that's what gives five
 * different-feeling characters out of one rig.
 */
export type CharacterKey = "sentinel" | "watcher" | "hunger" | "other" | "glimpse";
export type SkinKey = "humanMale" | "humanFemale" | "zombieMale" | "zombieFemale";

const SKIN_FILES: Record<SkinKey, string> = {
  humanMale: "/game/chars/skins/human-male.png",
  humanFemale: "/game/chars/skins/human-female.png",
  zombieMale: "/game/chars/skins/zombie-male.png",
  zombieFemale: "/game/chars/skins/zombie-female.png",
};

/** Which skin each NPC wears. Only 4 skins exist for 5 characters, so
 * Sentinel and The Other share a skin — they're told apart by tint/scale
 * (see the kitCharacter calls in world.ts), same as every other pair here. */
export const CHARACTER_SKIN: Record<CharacterKey, SkinKey> = {
  sentinel: "humanMale",
  watcher: "humanFemale",
  other: "humanMale",
  hunger: "zombieMale",
  glimpse: "zombieFemale",
};

export type CharacterAssets = {
  /** Shared base mesh + skeleton. Clone with SkeletonUtils.clone per NPC —
   * never reuse this scene object directly, it has no material assigned. */
  baseScene: THREE.Group;
  /** Shared animation clips, keyed by the names kitCharacter looks for. */
  clips: THREE.AnimationClip[];
  skins: Record<SkinKey, THREE.Texture>;
};

function loadGltf(loader: GLTFLoader, url: string) {
  return new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations }),
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(`failed to load ${url}`)),
    );
  });
}

function loadTexture(loader: THREE.TextureLoader, url: string) {
  return new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        tex.flipY = false; // glTF convention — matches the FBX2glTF-converted mesh's UVs
        resolve(tex);
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(`failed to load ${url}`)),
    );
  });
}

export async function loadCharacterModels(): Promise<CharacterAssets> {
  const gltfLoader = new GLTFLoader();
  const texLoader = new THREE.TextureLoader();

  const [base, idle, run, ...skinList] = await Promise.all([
    loadGltf(gltfLoader, "/game/chars/character-base.glb"),
    loadGltf(gltfLoader, "/game/chars/anim-idle.glb"),
    loadGltf(gltfLoader, "/game/chars/anim-run.glb"),
    ...(Object.keys(SKIN_FILES) as SkinKey[]).map((k) => loadTexture(texLoader, SKIN_FILES[k])),
  ]);

  // The animation GLBs also carry a "Root|0.Targeting Pose" reference clip
  // (a static T-pose used by the rig's IK tooling) ahead of the real
  // animation — must pick by name, not index [0], or every character is
  // stuck in that T-pose forever.
  const idleClip = idle.animations.find((c) => /idle/i.test(c.name)) ?? idle.animations[0];
  if (idleClip) idleClip.name = "idle";
  const runClip = run.animations.find((c) => /run/i.test(c.name)) ?? run.animations[0];
  if (runClip) runClip.name = "run";

  const skinKeys = Object.keys(SKIN_FILES) as SkinKey[];
  const skins = {} as Record<SkinKey, THREE.Texture>;
  skinKeys.forEach((k, i) => {
    skins[k] = skinList[i];
  });

  return {
    baseScene: base.scene,
    clips: [idleClip, runClip].filter((c): c is THREE.AnimationClip => !!c),
    skins,
  };
}
