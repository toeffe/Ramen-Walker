import * as THREE from "three";
import { GameAudio } from "@/game/audio";
import { useGame } from "@/game/store";
import {
  buildWorld,
  disposeWorld,
  HOUSE_Z,
  HUNGER_Z,
  OTHER_Z,
  ROAD_HALF,
  SENTINEL_Z,
  WATCHER_Z,
  WATCHER2_Z,
  WRONG_HOUSE_LIGHT_INTENSITY,
  roadAt,
  type World,
} from "@/game/world";
import { disposeArt, type GameArt } from "@/game/art";
import type { CharacterAssets } from "@/game/characters";
import {
  findLine,
  getLine,
  RAMEN_ASIDES,
  YOU_ASIDES,
  type LineId,
} from "@/game/dialogue";

type ScareKind = "none" | "face" | "hunger" | "watcher" | "hands" | "mailbox";
const SCARE_KINDS: ReadonlySet<string> = new Set([
  "face",
  "hunger",
  "watcher",
  "hands",
  "mailbox",
]);

type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  setKeys: (codes: string[]) => void;
  getX: () => number;
  getZ: () => number;
  setYaw: (yaw: number) => void;
  setPitch: (pitch: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

type StoryEvent = { distance: number; triggered?: boolean; run: () => void };
type HoldKind = "sentinel" | "watcher" | "hunger" | "other" | "watcher2";
type QueuedLine = { id: LineId; after?: () => void; event?: HoldKind };

export type CoopSnapshot = {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  trayRoll: number;
  trayPitch: number;
  bowlX: number;
  bowlZ: number;
  distance: number;
  spilled: boolean;
  started: boolean;
  ended: boolean;
  speed: number;
  grabbing: boolean;
  endingKind: "home" | "taken";
  mailboxArmed: boolean;
  lampKilled: boolean;
  blackout: number;
  hungerLunging: boolean;
  hungerLunge: number;
  glimpseOn: boolean;
  glimpseSide: number;
  bushHands: boolean;
  wrongHouse: boolean;
  wrongHouseLit: number;
  strangerOn: boolean;
  strangerX: number;
  strangerZ: number;
  monsterOn: boolean;
  monsterX: number;
  monsterZ: number;
  monsterGlow: number;
  otherOn: boolean;
  otherX: number;
  otherZ: number;
  faceOn: boolean;
  faceX: number;
  faceY: number;
  faceZ: number;
  faceScale: number;
  lineSeq: number;
  lineId: string;
  scareSeq: number;
  scareKind: ScareKind;
  warnSeq: number;
  warn: string;
  fxSeq: number;
  fx: number;
  footSeq: number;
};

const HOLD_LEAVE_DIST = 14;
// How long (seconds) the camera is force-turned toward a talking NPC before
// control is handed back to the player. Dialogue keeps auto-advancing either
// way; this just stops the whole multi-line conversation from locking the
// camera for its entire length.
const HOLD_LOOK_LOCK_S = 2.6;

export class RamenGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private yawObject: THREE.Object3D;
  private world: World;
  private audio = new GameAudio();
  private keys = new Set<string>();
  private injected: string[] | null = null;
  private yaw = 0;
  private pitch = -0.08;
  private started = false;
  private ended = false;
  private distance = 0;
  private spilled = false;
  private bowlX = 0;
  private bowlZ = 0;
  private bowlVx = 0;
  private bowlVz = 0;
  private trayRoll = 0;
  private trayPitch = 0;
  private trayRollV = 0;
  private eventKickV = 0;
  private eventKickT = 0;
  // --- co-op "waiter" camera -------------------------------------------
  // A second, independently rendered camera that always looks at the
  // tray from the opposite side of the walker — i.e. facing the walker,
  // as if standing across the tray from them. Only active when
  // enableWaiterView() has been called (multiplayer mode). It shares the
  // same scene, so it needs no extra world state, just its own renderer
  // and canvas target.
  private waiterCamera: THREE.PerspectiveCamera | null = null;
  private waiterRenderer: THREE.WebGLRenderer | null = null;
  private waiterCanvas: HTMLCanvasElement | null = null;
  private waiterFocus = new THREE.Vector3();
  private waiterGrabCam = new THREE.Vector3();
  private waiterGrabFocus = new THREE.Vector3();
  // When true, this instance is a networked thin client (the Waiter's
  // machine): local WASD/tray physics are skipped and state instead
  // comes from applyHostSnapshot() each time the Host streams a frame.
  private remoteDriven = false;
  // Host-only: once a Waiter is connected they own mouse/touch tray tilt.
  // Walker mouse becomes look-only so both players aren't fighting the bowl.
  private waiterOwnsTray = false;
  private storyLineSeq = 0;
  private storyLineId = "";
  private storyScareSeq = 0;
  private storyWarnSeq = 0;
  private storyWarnText = "";
  private storyFxSeq = 0;
  private storyFx = 0;
  private storyFootSeq = 0;
  private endingKind: "home" | "taken" = "home";
  private appliedLineSeq = -1;
  private appliedScareSeq = -1;
  private appliedWarnSeq = -1;
  private appliedFxSeq = -1;
  private appliedFootSeq = -1;
  private walkerRunning = false;
  private trayPitchV = 0;
  private sloshX = 0;
  private sloshZ = 0;
  private sloshVx = 0;
  private sloshVz = 0;
  private tipT = 0;
  private resetT = 0;
  private grabbing = false;
  private grabT = 0;
  private grabFrom = new THREE.Vector3();
  private grabTo = new THREE.Vector3();
  private lookingBack = false;
  private walkCycle = 0;
  private lastFoot = 0;
  private trauma = 0;
  private scareT = 0;
  private scareKind: ScareKind = "none";
  private hungerLunge = 0;
  private hungerLunging = false;
  private flashlightFlicker = 0;
  private blackout = 0;
  private hudAcc = 0;
  private last = performance.now();
  private lastSpeed = 0;
  private dragging = false;
  private lastPtrX = 0;
  private lastPtrY = 0;
  private joyX = 0;
  private joyY = 0;
  private lookDx = 0;
  private lookDy = 0;
  private balanceDx = 0;
  private balanceDy = 0;
  private art: GameArt;
  private dialogueQ: QueuedLine[] = [];
  private typing: number | null = null;
  private fullText = "";
  private after: (() => void) | null = null;
  private lineEvent: HoldKind | null = null;
  private autoAdvanceTimer: number | null = null;
  private dialogueGen = 0;
  private events: StoryEvent[] = [];
  private seenBack = false;
  private mailboxArmed = false;
  private lampKilled = false;
  private hold: HoldKind | null = null;
  private holdGrace = 0;
  private holdLookElapsed = 0;
  private metSentinel = false;
  private metWatcher = false;
  private metHunger = false;
  private metOther = false;
  private metWatcher2 = false;
  private houseTalked = false;
  /** How many times the walk has restarted after a jumpscare-death. Zero on
   * the very first walk — `ramen_here_again` (the loop confirmation line)
   * only fires once this is > 0, so the game doesn't spoil the loop before
   * the player has actually looped. */
  private loopCount = 0;
  private hungerFrom = new THREE.Vector3(0, 0, HUNGER_Z);
  private crossing = false;
  private crossingT = 0;
  private bowlHeavy = 0;
  private glimpseUntil = 0;
  private glimpseSide = 1;
  private glimpseCaughtT = 0;
  private trayDamage = 0;
  private hurryFatigue = 0;
  private roadShake = 0;
  private otherStepT = 0;
  private otherStepGap = 3;
  private reducedMotion = false;
  private disposed = false;
  private tmp = new THREE.Vector3();
  private onKeyDown!: (e: KeyboardEvent) => void;
  private onKeyUp!: (e: KeyboardEvent) => void;
  private onPtrDown!: (e: PointerEvent) => void;
  private onPtrMove!: (e: PointerEvent) => void;
  private onPtrUp!: (e: PointerEvent) => void;
  private onBlur!: () => void;
  private onResize!: () => void;
  private onWantLock!: (e: PointerEvent) => void;
  private onLockChange!: () => void;

  constructor(
    private canvas: HTMLCanvasElement,
    art: GameArt,
    chars: CharacterAssets,
  ) {
    this.art = art;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121820);
    this.scene.fog = new THREE.FogExp2(0x121820, 0.125);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.08, 70);
    this.yawObject = new THREE.Object3D();
    this.yawObject.position.set(0, 1.62, 0);
    this.yawObject.add(this.camera);
    this.scene.add(this.yawObject);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.resize();

    const amb = new THREE.AmbientLight(0x3a4450, 0.07);
    this.scene.add(amb);
    const hemi = new THREE.HemisphereLight(0x4a5a6c, 0x12100c, 0.18);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0x8a9aac, 0.1);
    moon.position.set(-18, 28, 8);
    this.scene.add(moon);

    this.world = buildWorld(this.scene, this.camera, art, chars);
    this.buildStory();
    this.bind();
    this.installProbe();
    useGame.getState().setReady(true);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.renderer.setAnimationLoop(this.tick);
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.resizeWaiter();
  };

  private resizeWaiter = () => {
    if (!this.waiterCamera || !this.waiterRenderer || !this.waiterCanvas) return;
    const w = this.waiterCanvas.clientWidth || window.innerWidth;
    const h = this.waiterCanvas.clientHeight || window.innerHeight;
    this.waiterCamera.aspect = w / Math.max(1, h);
    this.waiterCamera.updateProjectionMatrix();
    this.waiterRenderer.setSize(w, h, false);
  };

  /**
   * Turns on the second "waiter" camera, rendered into its own canvas.
   * The waiter camera always looks at the tray from the opposite side
   * of the walker — as if standing across the tray, facing them — so it
   * needs no independent input of its own beyond being told when to
   * resize. Call disableWaiterView() / dispose() to tear it down.
   */
  enableWaiterView(canvas: HTMLCanvasElement) {
    this.waiterCanvas = canvas;
    this.waiterCamera = new THREE.PerspectiveCamera(72, 1, 0.08, 70);
    this.waiterRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.waiterRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.waiterRenderer.outputColorSpace = THREE.SRGBColorSpace;
    this.waiterRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.waiterRenderer.toneMappingExposure = 1.08;
    this.resizeWaiter();
  }

  disableWaiterView() {
    this.waiterRenderer?.dispose();
    this.waiterCamera = null;
    this.waiterRenderer = null;
    this.waiterCanvas = null;
  }

  /**
   * Across the tray, lower than a top-down shot, looking at the walker so
   * the road behind them stays in frame. Slight downward aim still shows
   * into the bowl.
   */
  private placeWaiterCamera() {
    if (!this.waiterCamera) return;
    const trayWorld = this.tmp;
    this.world.viewmodel.carry.getWorldPosition(trayWorld);

    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const stand = 1.48;
    this.waiterCamera.position.set(
      trayWorld.x + fx * stand,
      trayWorld.y + 0.28,
      trayWorld.z + fz * stand,
    );
    this.waiterFocus.set(
      trayWorld.x * 0.4 + this.yawObject.position.x * 0.6,
      1.34,
      trayWorld.z * 0.4 + this.yawObject.position.z * 0.6,
    );
    this.waiterCamera.up.set(0, 1, 0);
    this.waiterCamera.lookAt(this.waiterFocus);
  }

  private syncWaiterCamera() {
    if (!this.waiterCamera) return;
    this.resizeWaiter();
    if (this.grabbing && this.remoteDriven) {
      const t = this.last * 0.001;
      const s = this.trauma * this.trauma;
      this.waiterCamera.position.set(
        this.waiterGrabCam.x + (Math.sin(t * 47) * 0.08 + Math.sin(t * 23) * 0.04) * s,
        this.waiterGrabCam.y + Math.sin(t * 31) * 0.03 * s,
        this.waiterGrabCam.z + (Math.cos(t * 41) * 0.05) * s,
      );
      this.waiterCamera.up.set(0, 1, 0);
      this.waiterCamera.lookAt(this.waiterGrabFocus);
      return;
    }
    this.placeWaiterCamera();
    if (this.trauma > 0.02) {
      const t = this.last * 0.001;
      const s = this.trauma * this.trauma;
      this.waiterCamera.position.x +=
        (Math.sin(t * 47) * 0.08 + Math.sin(t * 23) * 0.04) * s;
      this.waiterCamera.position.y += Math.sin(t * 31) * 0.03 * s;
      this.waiterCamera.lookAt(this.waiterFocus);
    }
  }

  private bind() {
    this.onKeyDown = (e) => {
      this.keys.add(e.code);
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (this.started) this.advanceDialogue();
      }
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => this.keys.clear();
    this.onResize = () => this.resize();
    this.onWantLock = (e) => {
      if (this.remoteDriven || !this.started || this.ended) return;
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      this.tryLock();
    };
    this.onLockChange = () => {
      if (this.disposed) return;
      const locked = document.pointerLockElement === this.canvas;
      this.canvas.style.cursor = locked || (this.started && !this.ended) ? "none" : "";
    };
    this.onPtrDown = (e) => {
      if (this.remoteDriven || !this.started || this.ended) return;
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      this.tryLock();
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastPtrX = e.clientX;
      this.lastPtrY = e.clientY;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* iframe may block */
      }
    };
    this.onPtrMove = (e) => {
      if (!this.started || this.ended) return;
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (this.remoteDriven) return;

      const locked = document.pointerLockElement === this.canvas;
      const looking = this.dragging || (e.buttons & 1) === 1;
      let dx = 0;
      let dy = 0;
      if (locked) {
        dx = e.movementX;
        dy = e.movementY;
      } else if (this.dragging) {
        dx = e.clientX - this.lastPtrX;
        dy = e.clientY - this.lastPtrY;
        this.lastPtrX = e.clientX;
        this.lastPtrY = e.clientY;
      } else {
        return;
      }

      // Solo: hold LMB to look, otherwise mouse-x tilts the tray.
      // Co-op walker: a connected waiter owns tilt, so all mouse is look.
      if (looking || this.waiterOwnsTray) {
        this.yaw -= dx * 0.0028;
        this.pitch -= dy * 0.0028;
        this.pitch = Math.max(-1.15, Math.min(0.85, this.pitch));
        return;
      }

      this.balanceDx += dx;
    };
    this.onPtrUp = (e) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      if (e.button !== 0 && e.type !== "pointercancel") return;
      this.dragging = false;
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onBlur);
    document.addEventListener("pointerlockchange", this.onLockChange);
    window.addEventListener("pointerdown", this.onWantLock);
    this.canvas.addEventListener("pointerdown", this.onPtrDown);
    window.addEventListener("pointermove", this.onPtrMove);
    window.addEventListener("pointerup", this.onPtrUp);
    window.addEventListener("pointercancel", this.onPtrUp);
  }

  private tryLock() {
    if (!this.started || this.ended || this.disposed) return;
    if (!document.hasFocus()) return;
    const el = this.canvas as HTMLCanvasElement & {
      requestPointerLock: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
    };
    if (document.pointerLockElement === el) return;
    this.canvas.style.cursor = "none";
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof r.then === "function") r.catch(() => undefined);
    } catch {
      try {
        el.requestPointerLock();
      } catch {
        /* preview iframes often block pointer lock */
      }
    }
  }

  private exitLock() {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        /* ignore */
      }
    }
  }

  unlockAudio() {
    this.audio.unlock();
  }

  start() {
    if (this.ended) return;
    this.audio.unlock();
    if (this.started) return;
    this.started = true;
    this.canvas.style.cursor = "none";
    this.tryLock();
    useGame.getState().setPhase("playing");
    useGame.getState().setLookHint(true);
    window.setTimeout(() => useGame.getState().setLookHint(false), 5200);
    this.say("you_okay");
  }

  setMoveAxis(x: number, y: number) {
    this.joyX = x;
    this.joyY = y;
  }

  addLookDelta(dx: number, dy: number) {
    this.lookDx += dx;
    this.lookDy += dy;
  }

  addBalanceDelta(dx: number, dy = 0) {
    this.balanceDx += dx;
    this.balanceDy += dy;
  }

  // --- co-op networking surface -----------------------------------------
  //
  // The Host (Walker's machine) calls getHostSnapshot() once per frame
  // and streams it to the Guest. The Guest calls applyHostSnapshot()
  // each time one arrives instead of running its own physics — physics
  // uses Math.random() internally, so two independent sims would drift
  // apart and desync within seconds.

  getHostSnapshot(): CoopSnapshot {
    const w = this.world;
    const face = w.scareFace;
    return {
      x: this.yawObject.position.x,
      z: this.yawObject.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
      trayRoll: this.trayRoll,
      trayPitch: this.trayPitch,
      bowlX: this.bowlX,
      bowlZ: this.bowlZ,
      distance: this.distance,
      spilled: this.spilled,
      started: this.started,
      ended: this.ended,
      speed: this.lastSpeed,
      grabbing: this.grabbing,
      endingKind: this.endingKind,
      mailboxArmed: this.mailboxArmed,
      lampKilled: this.lampKilled,
      blackout: this.blackout,
      hungerLunging: this.hungerLunging,
      hungerLunge: this.hungerLunge,
      glimpseOn: w.glimpse.visible,
      glimpseSide: this.glimpseSide,
      bushHands: w.bushHands.visible,
      wrongHouse: w.wrongHouse.visible,
      wrongHouseLit: w.wrongHouseLight.intensity,
      strangerOn: w.stranger.visible,
      strangerX: w.stranger.position.x,
      strangerZ: w.stranger.position.z,
      monsterOn: w.monster.visible,
      monsterX: w.monster.position.x,
      monsterZ: w.monster.position.z,
      monsterGlow: w.monsterGlow.intensity,
      otherOn: w.otherWalker.visible,
      otherX: w.otherWalker.position.x,
      otherZ: w.otherWalker.position.z,
      faceOn: face.visible,
      faceX: face.position.x,
      faceY: face.position.y,
      faceZ: face.position.z,
      faceScale: face.scale.x,
      lineSeq: this.storyLineSeq,
      lineId: this.storyLineId,
      scareSeq: this.storyScareSeq,
      scareKind: this.scareKind,
      warnSeq: this.storyWarnSeq,
      warn: this.storyWarnText,
      fxSeq: this.storyFxSeq,
      fx: this.storyFx,
      footSeq: this.storyFootSeq,
    };
  }

  /**
   * Puts the engine into thin-client "remote" mode: local WASD move
   * input and hurry-fatigue/story triggers are skipped so nothing here
   * fights with the Host's authoritative simulation, but the tray/bowl
   * visual physics (roll, slosh, bob) still run locally each frame for
   * smoothness between snapshots — applyHostSnapshot() then corrects
   * position/yaw/tray state back onto the Host's truth every time a
   * network frame arrives, so any local drift never accumulates.
   */
  setRemoteDriven(remote: boolean) {
    this.remoteDriven = remote;
  }

  setWaiterOwnsTray(owns: boolean) {
    this.waiterOwnsTray = owns;
    if (owns) {
      this.balanceDx = 0;
      this.balanceDy = 0;
    }
  }

  applyHostSnapshot(s: CoopSnapshot) {
    const justStarted = this.remoteDriven && s.started && !this.started;
    const grabStarted = this.remoteDriven && s.grabbing && !this.grabbing;
    const grabEnded = this.remoteDriven && !s.grabbing && this.grabbing;
    const justSpilled = this.remoteDriven && s.spilled && !this.spilled;
    const justEnded = this.remoteDriven && s.ended && !this.ended;

    if (grabEnded) this.resetRun();

    this.yawObject.position.x = s.x;
    this.yawObject.position.z = s.z;
    this.yaw = s.yaw;
    this.pitch = s.pitch;
    this.trayRoll = s.trayRoll;
    this.trayPitch = s.trayPitch;
    this.bowlX = s.bowlX;
    this.bowlZ = s.bowlZ;
    this.distance = s.distance;
    this.spilled = s.spilled;
    this.started = s.started;
    this.lastSpeed = s.speed;
    this.applyHostWorld(s);
    useGame.getState().setSpilled(s.spilled);
    if (justSpilled && !s.grabbing) this.audio.spill();
    if (justEnded) this.triggerEnding(s.endingKind);
    this.ended = s.ended;
    if (grabStarted) this.startGrab();
    if (justStarted) this.audio.unlock();
    this.applyHostStoryCues(s);
  }

  private applyHostWorld(s: CoopSnapshot) {
    const w = this.world;
    this.mailboxArmed = s.mailboxArmed;
    this.lampKilled = s.lampKilled;
    this.blackout = s.blackout;
    this.hungerLunging = s.hungerLunging;
    this.hungerLunge = s.hungerLunge;
    this.glimpseSide = s.glimpseSide < 0 ? -1 : 1;
    w.glimpse.visible = s.glimpseOn;
    if (s.glimpseOn) this.placeGlimpse();
    w.bushHands.visible = s.bushHands;
    w.wrongHouse.visible = s.wrongHouse;
    w.wrongHouseLight.intensity = s.wrongHouseLit;
    w.stranger.visible = s.strangerOn;
    w.stranger.position.x = s.strangerX;
    w.stranger.position.z = s.strangerZ;
    w.monster.visible = s.monsterOn;
    w.monster.position.x = s.monsterX;
    w.monster.position.z = s.monsterZ;
    w.monsterGlow.position.set(s.monsterX, 3.1, s.monsterZ + 0.4);
    w.monsterGlow.intensity = s.monsterGlow;
    w.otherWalker.visible = s.otherOn;
    w.otherWalker.position.x = s.otherX;
    w.otherWalker.position.z = s.otherZ;
    if (!this.grabbing) {
      w.scareFace.visible = s.faceOn;
      w.scareFace.position.set(s.faceX, s.faceY, s.faceZ);
      w.scareFace.scale.setScalar(s.faceScale);
    }
  }

  private applyHostStoryCues(s: CoopSnapshot) {
    if (s.lineSeq !== this.appliedLineSeq) {
      this.appliedLineSeq = s.lineSeq;
      this.audio.stopSpeak();
      if (s.lineId) {
        const line = findLine(s.lineId);
        if (line) this.audio.speak(line.file);
      }
    }
    if (s.scareSeq !== this.appliedScareSeq) {
      this.appliedScareSeq = s.scareSeq;
      if (SCARE_KINDS.has(s.scareKind) && !this.grabbing) {
        this.scare(s.scareKind as Exclude<ScareKind, "none">);
      }
    }
    if (s.warnSeq !== this.appliedWarnSeq) {
      this.appliedWarnSeq = s.warnSeq;
      if (s.warn) this.warn(s.warn);
    }
    if (s.fxSeq !== this.appliedFxSeq) {
      const had = this.appliedFxSeq >= 0;
      this.appliedFxSeq = s.fxSeq;
      if (had) {
        if (s.fx === 1) this.audio.whisper();
        else if (s.fx === 2) this.audio.twig();
        else if (s.fx === 3) this.audio.heartbeat(true);
      }
    }
    if (s.footSeq !== this.appliedFootSeq) {
      const had = this.appliedFootSeq >= 0;
      this.appliedFootSeq = s.footSeq;
      if (had) this.audio.footstep(s.speed > 4.5);
    }
  }

  advanceDialogue() {
    const st = useGame.getState();
    if (!st.dialogue) return;
    if (!st.dialogue.complete) {
      if (this.typing) window.clearInterval(this.typing);
      this.typing = null;
      useGame.getState().setDialogue({ speaker: st.dialogue.speaker, text: this.fullText, complete: true });
      return;
    }
    this.completeLine();
  }

  /** Finishes the current line and moves to the next queued one. Called
   * both by manual advance (Space/Enter/tap) and automatically once a
   * line's voice audio ends (or, for lines with no recorded audio yet,
   * after a text-timed delay) — dialogue has no on-screen text anymore, so
   * it can't rely on the player reading a "press to continue" prompt. */
  private completeLine() {
    if (this.autoAdvanceTimer !== null) {
      window.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    this.audio.stopSpeak();
    const cb = this.after;
    this.after = null;
    if (cb) cb();
    this.showNext();
  }

  private spill() {
    if (this.spilled) return;
    this.spilled = true;
    this.tipT = 0.01;
    this.resetT = 0.01;
    this.audio.spill();
    useGame.getState().setSpilled(true);
    this.warn("NOODLES.");
  }

  private startGrab() {
    if (this.grabbing || this.ended) return;
    this.grabbing = true;
    this.grabT = 0;
    useGame.getState().setWarning(null);
    useGame.getState().setDialogue(null);
    if (this.typing) {
      window.clearInterval(this.typing);
      this.typing = null;
    }
    if (this.autoAdvanceTimer !== null) {
      window.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    this.dialogueGen++;
    this.dialogueQ = [];
    this.after = null;
    this.lineEvent = null;
    this.hold = null;
    this.holdGrace = 0;
    this.audio.stopSpeak();
    if (!this.remoteDriven) this.publishLine("");
    const p = this.yawObject.position;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.world.monster.visible = false;
    this.world.monsterGlow.intensity = 0;
    const face = this.world.scareFace;
    face.visible = true;
    face.scale.setScalar(2.4);
    // Waiter stands in front of the walker looking at them. Lunge the
    // face from the walker's chest at the waiter camera so the balancer
    // actually sees the death beat (the FPS path flies at yawObject,
    // which is behind the waiter camera).
    if (this.remoteDriven && this.waiterCamera) {
      this.placeWaiterCamera();
      this.waiterGrabCam.copy(this.waiterCamera.position);
      this.waiterGrabFocus.copy(this.waiterFocus);
      const lx = this.waiterGrabFocus.x - this.waiterGrabCam.x;
      const ly = this.waiterGrabFocus.y - this.waiterGrabCam.y;
      const lz = this.waiterGrabFocus.z - this.waiterGrabCam.z;
      const len = Math.hypot(lx, ly, lz) || 1;
      this.grabFrom.set(p.x + fx * 0.22, 1.58, p.z + fz * 0.22);
      this.grabTo.set(
        this.waiterGrabCam.x + (lx / len) * 0.38,
        this.waiterGrabCam.y + (ly / len) * 0.38,
        this.waiterGrabCam.z + (lz / len) * 0.38,
      );
      face.position.copy(this.grabFrom);
      face.lookAt(this.waiterGrabCam.x, this.waiterGrabCam.y, this.waiterGrabCam.z);
    } else {
      this.grabFrom.set(p.x + fx * 5.4, 1.58, p.z + fz * 5.4);
      this.grabTo.set(p.x + fx * 0.1, 1.58, p.z + fz * 0.1);
      face.position.copy(this.grabFrom);
      face.lookAt(p.x, 1.58, p.z);
    }
    this.world.viewmodel.carry.visible = false;
    this.audio.jumpscare();
    this.trauma = 1;
    this.trayDamage = Math.min(1, this.trayDamage + 0.08);
    this.flashlightFlicker = 0.4;
    useGame.getState().pulseHit("death");
    useGame.getState().setFlash(1);
    window.setTimeout(() => useGame.getState().setFlash(0), 220);
  }

  private resetRun() {
    this.loopCount++;
    if (this.typing) {
      window.clearInterval(this.typing);
      this.typing = null;
    }
    if (this.autoAdvanceTimer !== null) {
      window.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    this.dialogueGen++;
    this.dialogueQ = [];
    this.audio.stopSpeak();
    this.after = null;
    this.fullText = "";
    this.lineEvent = null;
    useGame.getState().setDialogue(null);
    useGame.getState().setSpilled(false);
    useGame.getState().setWarning(null);
    useGame.getState().setFlash(0);
    useGame.getState().setWhiteout(0);
    useGame.getState().pulseHit("none");
    useGame.getState().setHud(0, 100);
    useGame.getState().setLookHint(true);
    window.setTimeout(() => useGame.getState().setLookHint(false), 4200);

    this.ended = false;
    this.started = true;
    this.spilled = false;
    this.distance = 0;
    this.yaw = 0;
    this.pitch = -0.08;
    this.yawObject.position.set(0, 1.62, 0);
    this.yawObject.rotation.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.position.set(0, 0, 0);
    this.bowlX = 0;
    this.bowlZ = 0;
    this.bowlVx = 0;
    this.bowlVz = 0;
    this.trayRoll = 0;
    this.trayPitch = 0;
    this.trayRollV = 0;
    this.eventKickV = 0;
    this.eventKickT = 0;
    this.trayPitchV = 0;
    this.sloshX = 0;
    this.sloshZ = 0;
    this.sloshVx = 0;
    this.sloshVz = 0;
    this.tipT = 0;
    this.resetT = 0;
    this.grabbing = false;
    this.grabT = 0;
    this.walkCycle = 0;
    this.lastFoot = 0;
    this.trauma = 0;
    this.scareT = 0;
    this.scareKind = "none";
    this.hungerLunge = 0;
    this.hungerLunging = false;
    this.flashlightFlicker = 0;
    this.blackout = 0;
    this.seenBack = false;
    this.mailboxArmed = false;
    this.lampKilled = false;
    this.hold = null;
    this.holdGrace = 0;
    this.metSentinel = false;
    this.metWatcher = false;
    this.metHunger = false;
    this.metOther = false;
    this.metWatcher2 = false;
    this.houseTalked = false;
    this.hungerFrom.set(0, 0, HUNGER_Z);
    this.crossing = false;
    this.crossingT = 0;
    this.bowlHeavy = 0;
    this.glimpseUntil = 0;
    this.glimpseCaughtT = 0;
    this.trayDamage = Math.min(1, this.trayDamage * 0.72 + 0.1);
    this.hurryFatigue = 0;
    this.roadShake = 0;
    this.otherStepT = 0;
    this.lookingBack = false;
    this.balanceDx = 0;
    this.balanceDy = 0;
    for (const ev of this.events) ev.triggered = false;

    const w = this.world;
    w.mailbox.position.set(-3.15, 0, SENTINEL_Z);
    w.mailbox.rotation.set(0, Math.PI / 2, 0);
    w.mailboxFlag.rotation.x = 0.35;
    w.mailboxEye.scale.setScalar(0.01);
    w.mailboxEyeMat.emissiveIntensity = 0;
    w.stranger.visible = false;
    w.stranger.position.set(1.4, 0, WATCHER_Z);
    w.monster.visible = false;
    w.monster.position.set(0, 0, HUNGER_Z);
    w.monster.rotation.set(0, 0, 0);
    w.monsterGlow.intensity = 0;
    w.monsterGlow.position.set(0, 3.1, HUNGER_Z + 2);
    w.monsterArms[0].rotation.set(0, 0, -0.12);
    w.monsterArms[1].rotation.set(0, 0, 0.12);
    w.scareFace.visible = false;
    w.scareFace.scale.setScalar(1);
    w.viewmodel.carry.visible = true;
    w.bushHands.visible = false;
    w.bushHands.position.set(4.4, 0, -roadAt(507));
    w.glimpse.visible = false;
    w.glimpse.position.set(4.2, 0, -roadAt(495));
    w.otherWalker.visible = false;
    w.otherWalker.position.set(-1.1, 0, OTHER_Z);
    w.wrongHouse.visible = false;
    w.wrongHouseLight.intensity = WRONG_HOUSE_LIGHT_INTENSITY;
    w.lampDying.intensity = 5;

    const vm = w.viewmodel;
    vm.carry.position.set(0, -0.4, -0.68);
    vm.carry.rotation.set(0, 0, 0);
    vm.ramen.position.set(0, 0.01, 0);
    vm.ramen.rotation.set(0, 0, 0);
    vm.contents.rotation.set(0, 0, 0);
    vm.broth.rotation.set(-Math.PI / 2, 0, 0);
    vm.noodles.forEach((n, i) => {
      n.visible = true;
      n.position.copy(vm.noodleRest[i].pos);
      n.rotation.copy(vm.noodleRest[i].rot);
    });
    this.say("you_okay_again");
    if (!this.remoteDriven) this.tryLock();
  }

  private kickTray(amount: number) {
    if (!this.waiterOwnsTray) {
      this.trayRollV += amount;
      return;
    }
    // Co-op: story kicks used to dump the bowl before the waiter could
    // see them (network delay). Soften and spread over 2s so the warning
    // and the tilt arrive as something they can fight.
    this.eventKickV += amount * 0.46;
    this.eventKickT = Math.max(this.eventKickT, 2);
  }

  private warn(text: string) {
    if (!this.remoteDriven) {
      this.storyWarnSeq += 1;
      this.storyWarnText = text;
    }
    useGame.getState().setWarning(text);
    window.setTimeout(() => {
      if (useGame.getState().warning === text) useGame.getState().setWarning(null);
    }, 1600);
  }

  private pick<T extends LineId>(ids: readonly T[]) {
    return ids[Math.floor(Math.random() * ids.length)]!;
  }

  private say(id: LineId, after?: () => void, event?: HoldKind) {
    // Dialogue/story lines are driven by distance, which the Waiter's
    // machine receives from the Host every frame — without this guard
    // both machines would independently re-trigger the same line's
    // audio and subtitle UI every playthrough.
    if (this.remoteDriven) return;
    this.dialogueQ.push({ id, after, event });
    if (!useGame.getState().dialogue) this.showNext();
  }

  private publishLine(id: LineId | "") {
    this.storyLineSeq += 1;
    this.storyLineId = id;
  }

  private hostFx(kind: 1 | 2 | 3) {
    this.storyFxSeq += 1;
    this.storyFx = kind;
  }

  private showNext() {
    if (this.dialogueQ.length === 0) {
      this.publishLine("");
      this.audio.stopSpeak();
      this.after = null;
      this.lineEvent = null;
      useGame.getState().setDialogue(null);
      return;
    }
    const entry = this.dialogueQ.shift();
    if (!entry) {
      this.publishLine("");
      this.audio.stopSpeak();
      this.after = null;
      this.lineEvent = null;
      useGame.getState().setDialogue(null);
      return;
    }
    this.publishLine(entry.id);
    const line = getLine(entry.id);
    this.after = entry.after ?? null;
    this.lineEvent = entry.event ?? null;
    this.fullText = line.text;
    if (this.autoAdvanceTimer !== null) {
      window.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    const gen = ++this.dialogueGen;
    const hasAudio = this.audio.speak(line.file, () => {
      if (gen !== this.dialogueGen) return;
      this.completeLine();
    });
    if (!hasAudio) {
      // No recorded audio yet for this line — auto-advance after a
      // text-timed pause instead of waiting on player input forever.
      const delay = Math.min(6000, Math.max(900, line.text.length * 45));
      this.autoAdvanceTimer = window.setTimeout(() => {
        if (gen !== this.dialogueGen) return;
        this.autoAdvanceTimer = null;
        this.completeLine();
      }, delay);
    }
    useGame.getState().setDialogue({ speaker: line.speaker, text: "", complete: false });
    let i = 0;
    if (this.typing) window.clearInterval(this.typing);
    this.typing = window.setInterval(() => {
      i += 1;
      const slice = line.text.slice(0, i);
      useGame.getState().setDialogue({
        speaker: line.speaker,
        text: slice,
        complete: i >= line.text.length,
      });
      if (i >= line.text.length && this.typing) {
        window.clearInterval(this.typing);
        this.typing = null;
      }
    }, 18);
  }

  private scare(kind: ScareKind) {
    if (kind === "none") return;
    if (!this.remoteDriven) this.storyScareSeq += 1;
    this.scareKind = kind;
    this.scareT = 1;
    this.trauma = Math.min(1, this.trauma + (this.reducedMotion ? 0.35 : 0.9));
    this.trayDamage = Math.min(1, this.trayDamage + 0.11);
    this.flashlightFlicker = 0.55;
    this.audio.jumpscare();
    useGame.getState().setFlash(1);
    useGame.getState().pulseHit("scare");
    window.setTimeout(() => useGame.getState().setFlash(0), 180);
  }

  private talking() {
    return this.hold !== null || this.dialogueQ.length > 0 || !!useGame.getState().dialogue;
  }

  private beginHold(kind: HoldKind) {
    this.hold = kind;
    this.holdGrace = 0.45;
    this.holdLookElapsed = 0;
  }

  private holdSpeakerPos() {
    if (this.hold === "sentinel") return this.world.mailbox.position;
    if (this.hold === "watcher" || this.hold === "watcher2") return this.world.stranger.position;
    if (this.hold === "hunger") return this.world.monster.position;
    if (this.hold === "other") return this.world.otherWalker.position;
    return null;
  }

  private maybeSkipHoldTalk(dt: number) {
    if (!this.hold || this.grabbing || this.spilled) return;
    this.holdGrace = Math.max(0, this.holdGrace - dt);
    if (this.holdGrace > 0) return;
    const target = this.holdSpeakerPos();
    if (!target) return;
    const p = this.yawObject.position;
    const dist = Math.hypot(target.x - p.x, target.z - p.z);
    if (dist < HOLD_LEAVE_DIST) return;
    this.abortHoldTalk();
  }

  private abortHoldTalk() {
    const ev = this.hold;
    if (!ev) return;
    this.dialogueQ = this.dialogueQ.filter((line) => line.event !== ev);
    const cutCurrent = this.lineEvent === ev;
    if (cutCurrent) {
      if (this.typing) {
        window.clearInterval(this.typing);
        this.typing = null;
      }
      if (this.autoAdvanceTimer !== null) {
        window.clearTimeout(this.autoAdvanceTimer);
        this.autoAdvanceTimer = null;
      }
      this.dialogueGen++;
      this.audio.stopSpeak();
      this.after = null;
      this.fullText = "";
      this.lineEvent = null;
    }
    if (ev === "hunger") {
      this.world.monster.visible = false;
      this.world.monsterGlow.intensity = 0;
      this.hungerLunging = false;
    }
    this.releaseHold();
    if (cutCurrent) this.showNext();
  }

  private releaseHold() {
    if (this.hold === "watcher") {
      this.world.stranger.visible = false;
      this.world.stranger.position.set(1.4, 0, WATCHER_Z);
    }
    if (this.hold === "watcher2") {
      this.world.stranger.visible = false;
      this.world.stranger.position.set(1.4, 0, WATCHER_Z);
    }
    if (this.hold === "other") {
      this.world.otherWalker.visible = false;
      this.world.otherWalker.position.set(-1.1, 0, OTHER_Z);
    }
    if (this.hold === "hunger") {
      this.hungerFrom.copy(this.world.monster.position);
    }
    this.hold = null;
    this.holdGrace = 0;
  }

  private startGlimpseTrail(side: number) {
    this.glimpseSide = side < 0 ? -1 : 1;
    this.glimpseUntil = this.distance + 28;
    this.glimpseCaughtT = 0;
    this.otherStepT = 0;
    this.world.glimpse.visible = true;
    this.placeGlimpse();
  }

  private placeGlimpse() {
    const p = this.yawObject.position;
    const g = this.world.glimpse;
    g.position.set(this.glimpseSide * 4.2, 0, p.z + 5.5);
    g.lookAt(p.x, 1.4, p.z);
  }

  private startSentinel() {
    this.beginHold("sentinel");
    this.mailboxArmed = true;
    this.say("sentinel_excuse", undefined, "sentinel");
    this.say("you_home", undefined, "sentinel");
    this.say("sentinel_all_say", undefined, "sentinel");
    this.say("sentinel_name", undefined, "sentinel");
    this.say("sentinel_keep", undefined, "sentinel");
    this.say("you_not_leaving", undefined, "sentinel");
    this.say("sentinel_already", undefined, "sentinel");
    this.say("sentinel_warm", () => {
      this.scare("mailbox");
      this.releaseHold();
      this.say("you_didnt_blink");
    }, "sentinel");
  }

  private startWatcher() {
    this.beginHold("watcher");
    this.world.stranger.visible = true;
    this.say("watcher_evening", undefined, "watcher");
    this.say("you_evening", undefined, "watcher");
    this.say("watcher_carrying", undefined, "watcher");
    this.say("you_ramen", undefined, "watcher");
    this.say("watcher_asked", undefined, "watcher");
    this.say("you_soup", undefined, "watcher");
    this.say("watcher_is_it", undefined, "watcher");
    this.say("watcher_careful", () => {
      this.releaseHold();
      this.say("ramen_counting");
    }, "watcher");
  }

  private startHunger() {
    this.beginHold("hunger");
    const z = this.yawObject.position.z - 9;
    this.world.monster.visible = true;
    this.world.monster.position.set(0.55, 0, z);
    this.world.monsterGlow.position.set(0.55, 3.1, z + 0.4);
    this.world.monsterGlow.intensity = 2.1;
    this.hungerFrom.copy(this.world.monster.position);
    this.say("hunger_beef", undefined, "hunger");
    this.say("hunger_smell", undefined, "hunger");
    this.say("you_chicken", undefined, "hunger");
    this.say("hunger_liar", undefined, "hunger");
    this.say("hunger_share", () => {
      this.releaseHold();
      this.hungerLunging = true;
      this.hungerLunge = 0;
      this.scare("hunger");
    }, "hunger");
  }

  private startOther() {
    this.beginHold("other");
    const side = Math.random() > 0.5 ? 1 : -1;
    const z = this.yawObject.position.z - 7;
    this.world.otherWalker.visible = true;
    this.world.otherWalker.position.set(side * 1.3, 0, z);
    this.say("other_evening", undefined, "other");
    this.say("you_other_hello", undefined, "other");
    this.say("other_empty", undefined, "other");
    this.say("you_other_where", undefined, "other");
    this.say("other_no_wrong_way", undefined, "other");
    this.say("ramen_dont_ask", undefined, "other");
    this.say("other_she_talks", undefined, "other");
    this.say("you_first_time", undefined, "other");
    this.say("other_lost_count", undefined, "other");
    this.say("ramen_walk_now", undefined, "other");
    this.say("other_see_you_again", () => {
      this.releaseHold();
      this.say("you_other_aftershock");
    }, "other");
  }

  private startWatcher2() {
    this.beginHold("watcher2");
    this.world.stranger.visible = true;
    this.world.stranger.position.set(1.4, 0, this.yawObject.position.z - 7);
    this.say("watcher2_again", undefined, "watcher2");
    this.say("you_watcher2_surprised", undefined, "watcher2");
    this.say("watcher2_we_always", undefined, "watcher2");
    this.say("watcher2_carrying_still", undefined, "watcher2");
    this.say("you_watcher2_almost_home", undefined, "watcher2");
    this.say("watcher2_almost", undefined, "watcher2");
    this.say("ramen_ignore_him", undefined, "watcher2");
    this.say("watcher2_farewell", () => {
      this.releaseHold();
    }, "watcher2");
  }

  private startHouseTalk() {
    this.say("ramen_good");
    this.say("you_just_ramen");
    this.say("ramen_no_isnt");
    this.say("ramen_names_kept");
    this.say("you_home_final");
    this.say("ramen_home_final");
  }

  private steerLookToSpeaker(dt: number) {
    if (!this.hold || this.grabbing) return;
    this.holdLookElapsed += dt;
    if (this.holdLookElapsed > HOLD_LOOK_LOCK_S) return;
    const target =
      this.hold === "sentinel"
        ? this.world.mailbox.position
        : this.hold === "watcher" || this.hold === "watcher2"
          ? this.world.stranger.position
          : this.hold === "other"
            ? this.world.otherWalker.position
            : this.world.monster.position;
    const p = this.yawObject.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) return;
    const wantYaw = Math.atan2(-dx, -dz);
    let dyaw = wantYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const k = 1 - Math.exp(-5.4 * dt);
    if (dz < 0) {
      this.yaw += dyaw * k;
      this.yaw = THREE.MathUtils.clamp(this.yaw, -1.12, 1.12);
    } else {
      this.yaw += dyaw * k;
    }
    const wantPitch = THREE.MathUtils.clamp(Math.atan2(1.7 - p.y, dist), -0.28, 0.38);
    this.pitch += (wantPitch - this.pitch) * k;
    this.yawObject.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  private trayStrain() {
    return THREE.MathUtils.clamp(
      (this.distance / (-HOUSE_Z * 0.955)) * 0.62 + this.trayDamage * 0.95 + this.hurryFatigue * 0.45,
      0,
      1.28,
    );
  }

  private updateEncounters() {
    const z = this.yawObject.position.z;
    if (!this.metSentinel && z <= SENTINEL_Z) {
      this.metSentinel = true;
      this.startSentinel();
    }
    if (!this.metWatcher && z <= WATCHER_Z && !this.hold) {
      this.metWatcher = true;
      this.startWatcher();
    }
    if (!this.metHunger && z <= HUNGER_Z && !this.hold) {
      this.metHunger = true;
      this.startHunger();
    }
    if (!this.metOther && z <= OTHER_Z && !this.hold) {
      this.metOther = true;
      this.startOther();
    }
    if (!this.metWatcher2 && z <= WATCHER2_Z && !this.hold) {
      this.metWatcher2 = true;
      this.startWatcher2();
    }
    if (!this.houseTalked && z <= HOUSE_Z + 22 && !this.hold) {
      this.houseTalked = true;
      this.startHouseTalk();
    }
    if (
      !this.ended &&
      !this.spilled &&
      !this.grabbing &&
      z <= HOUSE_Z + 8 &&
      !this.talking()
    ) {
      this.triggerEnding(this.trayDamage >= 0.85 ? "taken" : "home");
    }
  }

  private buildStory() {
    this.events = [
      // --- Act 1: mundane walk, sensory only, no lore (~0-80m, before the Sentinel@90) ---
      {
        distance: 4,
        run: () => {
          if (this.loopCount > 0) this.say("ramen_here_again");
        },
      },
      { distance: 11, run: () => this.say("you_later") },
      { distance: 22, run: () => this.say(this.pick(YOU_ASIDES)) },
      { distance: 29, run: () => this.say("you_warm") },
      { distance: 40, run: () => this.say("you_count") },
      {
        distance: 51,
        run: () => {
          this.say("ramen_dont_spill");
          this.hostFx(1);
          this.audio.whisper();
        },
      },
      { distance: 65, run: () => this.say("you_yeah") },
      { distance: 73, run: () => this.say(this.pick(RAMEN_ASIDES)) },
      { distance: 80, run: () => this.say("ramen_deal") },

      // --- Name posts: the ledger made visible (~110-165m, after the Sentinel@90) ---
      { distance: 120, run: () => this.say("you_names_posts") },
      { distance: 145, run: () => this.say("ramen_names_posts") },

      // --- Act 3: the road hunts (~230-630m, between the first Watcher@220 and the Hunger@640) ---
      {
        distance: 230,
        run: () => {
          this.say("ramen_hey");
          this.say("you_bowl_talk");
          this.say("ramen_level");
        },
      },
      {
        distance: 245,
        run: () => {
          this.bowlHeavy = 8;
          this.trayDamage = Math.min(1, this.trayDamage + 0.08);
          this.kickTray(0.7);
          this.warn("THE BOWL GOT HEAVIER");
        },
      },
      {
        distance: 261,
        run: () => {
          this.say("ramen_with_us");
          this.hostFx(1);
          this.audio.whisper();
        },
      },
      { distance: 276, run: () => this.say("you_not_mine") },
      { distance: 292, run: () => this.say("you_heard") },
      {
        distance: 310,
        run: () => {
          this.kickTray(1.2);
          this.hostFx(2);
          this.audio.twig();
          this.warn("COLD PATCH");
        },
      },
      { distance: 322, run: () => this.say("ramen_wind") },
      {
        distance: 328,
        run: () => {
          this.startGlimpseTrail(-1);
          this.hostFx(2);
          this.audio.twig();
        },
      },
      { distance: 344, run: () => this.say("ramen_dont_look") },
      {
        distance: 369,
        run: () => {
          if (this.lookingBack) {
            this.backScare();
            this.say("ramen_said_dont");
            this.say("you_nothing");
            this.say("ramen_not_anymore");
          } else {
            this.say("ramen_good_walk");
            this.say("you_what_see");
            this.say("ramen_remember");
          }
        },
      },
      {
        distance: 399,
        run: () => {
          this.say("ramen_gaps");
          this.hostFx(1);
          this.audio.whisper();
        },
      },
      {
        distance: 415,
        run: () => {
          this.startGlimpseTrail(1);
          this.hostFx(2);
          this.audio.twig();
          this.warn("SOMETHING IN THE TREES");
        },
      },
      { distance: 436, run: () => this.say("you_rock") },
      { distance: 448, run: () => this.say("you_how_long") },
      { distance: 461, run: () => this.say("ramen_how_long") },
      { distance: 470, run: () => this.say("ramen_road") },
      {
        distance: 485,
        run: () => {
          this.crossing = true;
          this.crossingT = 0;
          this.say("watcher_again");
        },
      },
      {
        distance: 507,
        run: () => {
          this.world.bushHands.visible = true;
          this.scare("hands");
          this.warn("DON'T REACH BACK");
          this.say("you_what_was");
          this.say("ramen_dont_answer");
        },
      },
      { distance: 525, run: () => this.say("ramen_dont_thank") },
      {
        distance: 541,
        run: () => {
          this.say("ramen_names");
          this.say("you_name");
        },
      },
      {
        distance: 553,
        run: () => {
          this.kickTray(1.8);
          this.trayDamage = Math.min(1, this.trayDamage + 0.06);
          this.hostFx(2);
          this.audio.twig();
          this.warn("THE TRAY SHUDDERED");
        },
      },
      { distance: 584, run: () => this.say("ramen_faster") },
      {
        distance: 596,
        run: () => {
          this.say("ramen_second_look");
          if (this.lookingBack) this.backScare();
        },
      },
      {
        distance: 615,
        run: () => {
          this.blackout = 1.35;
          this.lampKilled = true;
          this.hostFx(3);
          this.audio.heartbeat(true);
        },
      },
      {
        distance: 630,
        run: () => {
          this.frontScare();
          this.scare("face");
          this.say("you_no");
          this.say("you_face");
          this.say("ramen_tray");
        },
      },

      // --- Act 4: aftermath of the Hunger@640, offerings, bridge to The Other@900 ---
      { distance: 650, run: () => this.say("ramen_try_again") },
      { distance: 670, run: () => this.say("you_why") },
      { distance: 682, run: () => this.say("ramen_warm") },
      { distance: 707, run: () => this.say("ramen_eat_you") },
      { distance: 710, run: () => this.say("you_offerings") },
      { distance: 717, run: () => this.say("ramen_offerings") },
      { distance: 724, run: () => this.say("you_still_here") },
      { distance: 742, run: () => this.say("ramen_others") },
      { distance: 761, run: () => this.say("you_others") },
      { distance: 781, run: () => this.say("ramen_others_answer") },
      {
        distance: 801,
        run: () => {
          this.kickTray(1.6);
          this.hostFx(2);
          this.audio.twig();
          this.warn("THE ROAD NARROWS");
        },
      },
      { distance: 821, run: () => this.say("you_narrow") },
      { distance: 841, run: () => this.say("ramen_narrow") },
      {
        distance: 860,
        run: () => {
          this.startGlimpseTrail(-1);
          this.hostFx(2);
          this.audio.twig();
          this.warn("SOMETHING IS PACING YOU");
        },
      },
      { distance: 880, run: () => this.say("you_close_now") },

      // --- Act 5: after The Other@900 — the loop confirmed, the wrong house, before Watcher2@1100 ---
      { distance: 933, run: () => this.say("ramen_shaken") },
      { distance: 970, run: () => this.say("you_yeah") },
      { distance: 1000, run: () => this.say("ramen_toll") },
      { distance: 1027, run: () => this.say("you_toll") },
      { distance: 1053, run: () => this.say("ramen_toll_answer") },
      {
        distance: 1063,
        run: () => {
          this.world.wrongHouse.visible = true;
          this.say("you_wrong_house_sight");
        },
      },
      { distance: 1075, run: () => this.say("ramen_wrong_house_sight") },
      {
        distance: 1092,
        run: () => {
          this.world.wrongHouseLight.intensity = 0;
          this.say("you_light_moved");
          this.say("ramen_not_porch");
          window.setTimeout(() => {
            this.world.wrongHouse.visible = false;
          }, 1800);
        },
      },

      // --- Act 6: final approach, after Watcher2@1100, before the house@1200 ---
      { distance: 1126, run: () => this.say("you_last_stretch") },
      { distance: 1146, run: () => this.say("ramen_last_stretch") },
      { distance: 1161, run: () => this.say("you_almost") },
    ];
    for (const ev of this.events) ev.distance = roadAt(ev.distance);
  }

  private backScare() {
    this.seenBack = true;
    const p = this.yawObject.position;
    this.world.scareFace.position.set(p.x, 1.55, p.z + 1.35);
    this.world.scareFace.lookAt(p.x, 1.55, p.z);
    this.world.scareFace.visible = true;
    this.scare("face");
    this.world.stranger.position.set(p.x, 0, p.z + 2.1);
    this.world.stranger.visible = true;
  }

  private frontScare() {
    const p = this.yawObject.position;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.world.scareFace.position.set(p.x + fx * 0.95, 1.55, p.z + fz * 0.95);
    this.world.scareFace.lookAt(p.x, 1.62, p.z);
    this.world.scareFace.visible = true;
  }

  private triggerEnding(kind: "home" | "taken") {
    if (this.ended) return;
    this.ended = true;
    this.started = true;
    this.endingKind = kind;
    if (document.exitPointerLock) document.exitPointerLock();
    const spilled = this.spilled;
    let title = "HOME";
    let html =
      "The bowl is waiting. It is always waiting.<br><br>You made it. This time.<br><br>The silhouette in the kitchen window turns its head slightly. It knows you are here. It knows you brought the bowl.<br><br><em>You are home. For now.</em>";
    if (kind === "taken") {
      title = "IT WAS NEVER YOURS";
      html =
        "The porch light is on. You don't reach it.<br><br>The Sentinel already has your name. The Hunger already had its taste. The road just needed one more thing to go wrong.<br><br>Something warm settles where the bowl used to be. It remembers being carried. It remembers being dropped. It is already coaching the next person the way it coached you.<br><br><em>You are gone. But the road is not empty.</em>";
    } else if (spilled) {
      title = "HOME (EMPTY HANDS)";
      html =
        "The tray is wet. Your hands are empty. The door does not open.<br><br>You sit on the porch, waiting for a knock that never comes. The Sentinel is still there. The Watcher is probably still there.<br><br><em>You paid the toll. The road took everything.</em>";
    }
    window.setTimeout(() => useGame.getState().setEnding(title, html), 900);
  }

  private held(code: string) {
    if (this.injected) return this.injected.includes(code);
    return this.keys.has(code);
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min((now - this.last) / 1000, 0.08);
    this.last = now;
    const t = now * 0.001;

    if (!this.remoteDriven && (this.lookDx || this.lookDy)) {
      this.yaw -= this.lookDx * 0.0034;
      this.pitch -= this.lookDy * 0.0034;
      this.pitch = Math.max(-1.15, Math.min(0.85, this.pitch));
    }
    this.lookDx = 0;
    this.lookDy = 0;

    this.yawObject.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    if (this.started && !this.ended) this.updatePlay(dt, t);
    else this.updateIdle(t);

    this.applyShake(t);
    this.syncViewmodelToCarrier(this.world.viewmodel.root, this.camera);
    this.syncWalkerBody();

    const vm = this.world.viewmodel;
    const body = this.world.walkerBody.outer;
    vm.hands.visible = true;
    vm.grips.visible = false;
    vm.noodleMound.visible = false;
    for (const n of vm.noodles) n.visible = true;
    body.visible = false;
    this.renderer.render(this.scene, this.camera);

    if (this.waiterCamera && this.waiterRenderer) {
      body.visible = true;
      vm.hands.visible = false;
      vm.grips.visible = !this.grabbing;
      vm.noodleMound.visible = !this.spilled;
      for (const n of vm.noodles) n.visible = this.spilled;
      this.syncWaiterCamera();
      this.waiterRenderer.render(this.scene, this.waiterCamera);
      vm.hands.visible = true;
      vm.grips.visible = false;
      vm.noodleMound.visible = false;
      for (const n of vm.noodles) n.visible = true;
      body.visible = false;
    }
  };

  /**
   * Kenney CC0 body for the waiter. Arms are collapsed so the skinned mesh
   * can't stretch into streaks. Tray grip meshes sit on the rims.
   */
  private syncWalkerBody() {
    const body = this.world.walkerBody;
    const p = this.yawObject.position;
    const back = 0.14;
    body.outer.position.set(
      p.x + Math.sin(this.yaw) * back,
      0,
      p.z + Math.cos(this.yaw) * back,
    );
    body.outer.rotation.y = this.yaw + Math.PI;

    const wantRun = this.started && !this.ended && !this.spilled && this.lastSpeed > 0.4;
    const idle = body.idleAction;
    const run = body.runAction;
    if (idle && run && wantRun !== this.walkerRunning) {
      this.walkerRunning = wantRun;
      if (wantRun) {
        idle.fadeOut(0.18);
        run.reset().setEffectiveWeight(1).fadeIn(0.18).play();
      } else {
        run.fadeOut(0.18);
        idle.reset().setEffectiveWeight(1).fadeIn(0.18).play();
      }
    }
    if (run && wantRun) {
      run.setEffectiveTimeScale(THREE.MathUtils.clamp(this.lastSpeed / 3.35, 0.75, 1.35));
    }

    body.armL.scale.setScalar(0.001);
    body.armR.scale.setScalar(0.001);
  }

  /**
   * The tray/bowl viewmodel lives in world space (so a second camera can
   * view it from any angle) but should still read, from the given
   * carrier camera, exactly as it did when it was camera-attached. This
   * copies the carrier's world transform onto the viewmodel root each
   * frame, so all the existing camera-space offsets inside the rig
   * (carry.position etc.) stay correct.
   */
  private syncViewmodelToCarrier(root: THREE.Object3D, carrier: THREE.Camera) {
    carrier.updateWorldMatrix(true, false);
    root.position.setFromMatrixPosition(carrier.matrixWorld);
    root.quaternion.setFromRotationMatrix(carrier.matrixWorld);
  }

  private updateIdle(t: number) {
    this.world.viewmodel.carry.rotation.z = Math.sin(t * 0.7) * 0.02;
    this.world.viewmodel.carry.rotation.x = Math.sin(t * 0.5) * 0.01;
    this.animateSteam(t, 1);
    this.audio.setBreath(0);
  }

  private updatePlay(dt: number, t: number) {
    for (const mixer of this.world.mixers) mixer.update(dt);

    let forward = 0;
    let right = 0;
    let running = false;
    let moving = false;
    let bob = 0;
    const LIM_X = 0.255;
    const BOWL_Y = 0.01;

    if (!this.remoteDriven) {
      if (this.held("KeyW") || this.held("ArrowUp")) forward += 1;
      if (this.held("KeyS") || this.held("ArrowDown")) forward -= 1;
      if (this.held("KeyD") || this.held("ArrowRight")) right += 1;
      if (this.held("KeyA") || this.held("ArrowLeft")) right -= 1;
      forward += this.joyY;
      right += this.joyX;
      const mlen = Math.hypot(forward, right);
      if (mlen > 1) {
        forward /= mlen;
        right /= mlen;
      }
      running = this.held("ShiftLeft") || this.held("ShiftRight");
      const speed = running ? 5.4 : 3.35;
      moving = mlen > 0.08;
      this.lastSpeed = moving ? speed * Math.min(1, mlen) : 0;

      if (running && moving && !this.spilled) {
        this.hurryFatigue += dt / 8;
      } else {
        this.hurryFatigue -= dt / 5;
      }
      this.hurryFatigue = THREE.MathUtils.clamp(this.hurryFatigue, 0, 1);

      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      if (moving && !this.spilled) {
        this.yawObject.position.x += (fx * forward + rx * right) * speed * dt;
        this.yawObject.position.z += (fz * forward + rz * right) * speed * dt;
      }
      this.yawObject.position.x = Math.max(-ROAD_HALF, Math.min(ROAD_HALF, this.yawObject.position.x));
      this.yawObject.position.z = Math.min(6, this.yawObject.position.z);
      if (this.yawObject.position.z < HOUSE_Z + 6) this.yawObject.position.z = HOUSE_Z + 6;

      this.distance = Math.max(this.distance, -this.yawObject.position.z);
      this.maybeSkipHoldTalk(dt);
      this.steerLookToSpeaker(dt);
      const yawMod = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      this.lookingBack = Math.abs(yawMod - Math.PI) < 0.95;
      this.roadShake = THREE.MathUtils.smoothstep(this.distance / -HOUSE_Z, 0.12, 1);

      bob = moving ? Math.sin(this.walkCycle) * 0.028 : 0;
      if (moving) {
        this.walkCycle += dt * (running ? 11 : 8);
        if (this.walkCycle - this.lastFoot > Math.PI) {
          this.lastFoot = this.walkCycle;
          this.storyFootSeq += 1;
          this.audio.footstep(running);
        }
      }
      this.camera.position.y = bob;

      const strain = this.trayStrain();
      const coop = this.waiterOwnsTray;
      const G =
        (this.bowlHeavy > 0 ? (coop ? 10.2 : 12.4) : 9.1) * (1 + strain * 0.42);
      const MU_S = 0.2 * (1 - strain * 0.55);
      const MU_K = 0.11 * (1 - strain * 0.5);
      const restore = 4.2 * (1 - strain * 0.48) * (1 - this.hurryFatigue * 0.55) * (1 - this.roadShake * 0.4);
      const damp = 5.5 * (1 - strain * 0.38) * (1 - this.hurryFatigue * 0.5) * (1 - this.roadShake * 0.4);
      const walkKick = coop ? 0.32 : 1;

      if (this.eventKickT > 0) {
        const inject = this.eventKickV * Math.min(1, dt / this.eventKickT);
        this.trayRollV += inject;
        this.eventKickV -= inject;
        this.eventKickT = Math.max(0, this.eventKickT - dt);
        if (this.eventKickT <= 0) this.eventKickV = 0;
      }

      const tiltGain = coop ? (this.eventKickT > 0 ? 0.09 : 0.058) : 0.024;
      this.trayRollV += this.balanceDx * (tiltGain * (1 - strain * 0.22));
      this.balanceDx = 0;
      this.balanceDy = 0;
      if (moving) {
        this.trayRollV += right * (1.25 + strain * 1.4) * dt * walkKick;
        const runWobble = running ? THREE.MathUtils.lerp(1.85, 3.1, this.hurryFatigue) : 0.82;
        this.trayRollV += Math.sin(this.walkCycle) * (runWobble + strain * 1.7) * dt * walkKick;
      }
      if (this.hold) this.trayRollV += (Math.random() - 0.5) * (2.4 + strain * 4) * dt * (coop ? 0.45 : 1);
      if (this.scareT > 0) {
        this.trayRollV += (Math.random() - 0.5) * (8 + strain * 6) * dt * (coop ? 0.55 : 1);
      }
      this.trayRollV += (Math.random() - 0.5) * strain * 5.5 * dt * (coop ? 0.4 : 1);
      this.trayRollV += (Math.random() - 0.5) * this.hurryFatigue * 9 * dt * (coop ? 0.4 : 1);
      this.trayRollV += (Math.random() - 0.5) * this.roadShake * 8 * dt * (coop ? 0.4 : 1);
      this.trayRollV += -this.trayRoll * restore * dt;
      this.trayRollV *= Math.exp(-damp * dt);
      this.trayRoll += this.trayRollV * dt;
      this.trayRoll = THREE.MathUtils.clamp(this.trayRoll, -0.48, 0.48);
      this.trayPitch = THREE.MathUtils.lerp(
        this.trayPitch,
        this.lookingBack ? 0.12 : 0,
        1 - Math.exp(-8 * dt),
      );

      const ax = G * Math.sin(this.trayRoll);

      if (!this.spilled) {
        if (Math.abs(this.bowlVx) < 0.03 && Math.abs(ax) < MU_S * G * 0.92) {
          this.bowlVx = 0;
        } else {
          this.bowlVx += ax * dt;
          const sp = Math.abs(this.bowlVx);
          if (sp > 1e-4) {
            const f = MU_K * G * dt;
            this.bowlVx -= Math.sign(this.bowlVx) * Math.min(f, sp);
          }
        }
        this.bowlX += this.bowlVx * dt;
        this.bowlZ = 0;
        this.bowlVz = 0;

        if (Math.abs(this.bowlX) > LIM_X) {
          const out = Math.sign(this.bowlX);
          if (this.bowlVx * out > 0.08 || Math.abs(ax) > 2.4) this.spill();
          else {
            this.bowlX = out * LIM_X;
            this.bowlVx *= -0.06;
          }
        }
        if (!this.spilled && Math.abs(this.bowlX) > LIM_X * 0.86) {
          this.warn("THE BOWL IS AT THE RIM");
        }
      } else {
        this.bowlVx += ax * dt;
        this.bowlX += this.bowlVx * dt;
        this.bowlZ = 0;
        this.bowlVz = 0;
        this.tipT += dt;
      }
    } else {
      const yawMod = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      this.lookingBack = Math.abs(yawMod - Math.PI) < 0.95;
      this.roadShake = THREE.MathUtils.smoothstep(this.distance / -HOUSE_Z, 0.12, 1);
      this.balanceDx = 0;
      this.balanceDy = 0;
      if (this.spilled) this.tipT += dt;
    }

    const ax =
      (this.bowlHeavy > 0 ? 12.4 : 9.1) * (1 + this.trayStrain() * 0.42) * Math.sin(this.trayRoll);
    this.sloshVx += (ax * 0.12 - this.sloshX * 18) * dt;
    this.sloshVx *= Math.exp(-6 * dt);
    this.sloshX += this.sloshVx * dt;
    this.sloshVz *= Math.exp(-8 * dt);
    this.sloshZ *= Math.exp(-8 * dt);

    const absSlide = Math.abs(this.bowlX / LIM_X);

    const carry = this.world.viewmodel.carry;
    carry.rotation.z = -this.trayRoll;
    carry.rotation.x = this.trayPitch + (moving ? Math.sin(this.walkCycle) * 0.012 : 0);
    carry.position.y = -0.4 + bob * 0.4;
    const ramen = this.world.viewmodel.ramen;
    ramen.position.x = this.bowlX;
    ramen.position.z = this.bowlZ;
    if (this.spilled) {
      const u = Math.min(1, this.tipT / 0.55);
      const dirX = Math.sign(this.bowlVx || this.bowlX) || 1;
      const dirZ = Math.sign(this.bowlVz || this.bowlZ);
      ramen.position.y = BOWL_Y - u * u * 0.55;
      ramen.rotation.z = -dirX * u * 1.6;
      ramen.rotation.x = dirZ * u * 1.1;
      this.world.viewmodel.contents.rotation.z = -dirX * u * 0.4;
      this.world.viewmodel.contents.position.y = -u * 0.04;
    } else {
      ramen.position.y = BOWL_Y;
      ramen.rotation.set(0, 0, 0);
      this.world.viewmodel.contents.position.y = 0;
      this.world.viewmodel.contents.rotation.z = THREE.MathUtils.clamp(this.sloshX, -0.18, 0.18);
      this.world.viewmodel.contents.rotation.x = THREE.MathUtils.clamp(this.sloshZ, -0.16, 0.16);
      this.world.viewmodel.broth.rotation.x = -Math.PI / 2 + this.sloshZ * 0.35;
      this.world.viewmodel.broth.rotation.z = this.sloshX * 0.35;
    }
    this.animateSteam(t, this.spilled ? 0 : 1);
    if (this.spilled) {
      for (let i = 0; i < this.world.viewmodel.noodles.length; i++) {
        const n = this.world.viewmodel.noodles[i];
        n.position.y -= dt * (0.18 + i * 0.03);
        n.position.x += dt * 0.08 * (i % 2 === 0 ? 1 : -1);
      }
    }

    const stability = this.spilled ? 0 : Math.max(0, 100 - absSlide * 100);
    this.audio.setTension(
      (this.distance / -HOUSE_Z) * 0.5 + (this.spilled ? 0.5 : 0) + (1 - stability / 100) * 0.5,
    );
    if (stability < 38 && !this.spilled) this.audio.heartbeat();
    this.audio.setBreath(
      this.spilled ? 0 : Math.max(this.roadShake * 0.55, this.hurryFatigue, 1 - stability / 100),
    );
    this.otherStepT += dt;
    if (this.world.glimpse.visible) {
      if (this.otherStepT >= 0.55) {
        this.otherStepT = 0;
        this.audio.otherStep(this.glimpseSide);
        if (Math.random() < 0.38) this.audio.otherBreath(this.glimpseSide);
      }
    } else if (this.roadShake > 0.28 && (moving || (this.remoteDriven && this.lastSpeed > 0.4))) {
      if (this.otherStepT >= this.otherStepGap) {
        this.otherStepT = 0;
        this.otherStepGap = 2.5 + Math.random() * 1.5;
        this.audio.otherStep(Math.random() > 0.5 ? 1 : -1);
      }
    }

    this.bowlHeavy = Math.max(0, this.bowlHeavy - dt);

    // Characters
    if (this.mailboxArmed) {
      this.world.mailboxFlag.rotation.x = THREE.MathUtils.lerp(
        this.world.mailboxFlag.rotation.x,
        -0.55,
        1 - Math.exp(-2 * dt),
      );
      const eye = this.world.mailboxEye;
      eye.scale.lerp(this.tmp.set(1, 1, 1), 1 - Math.exp(-1.6 * dt));
      this.world.mailboxEyeMat.emissiveIntensity = 0.9 + Math.sin(t * 6) * 0.45;
      this.world.mailbox.lookAt(
        this.yawObject.position.x,
        this.world.mailbox.position.y,
        this.yawObject.position.z,
      );
    }
    if (this.crossing && !this.remoteDriven) {
      this.crossingT += dt;
      const u = Math.min(1, this.crossingT / 2.6);
      this.world.stranger.visible = true;
      this.world.stranger.position.set(
        THREE.MathUtils.lerp(-3.5, 3.5, u),
        0,
        this.yawObject.position.z - 9,
      );
      if (u >= 1) {
        this.crossing = false;
        this.world.stranger.visible = false;
        this.world.stranger.position.set(1.4, 0, WATCHER_Z);
      }
    } else if (this.world.stranger.visible) {
      this.world.strangerHead.lookAt(
        this.yawObject.position.x,
        1.95,
        this.yawObject.position.z,
      );
    }
    if (this.world.otherWalker.visible) {
      this.world.otherWalkerHead.lookAt(
        this.yawObject.position.x,
        1.95,
        this.yawObject.position.z,
      );
    }
    if (this.world.glimpse.visible) {
      this.placeGlimpse();
      if (this.lookingBack) {
        this.glimpseCaughtT += dt;
        if (this.glimpseCaughtT > 1) this.world.glimpse.visible = false;
      }
      if (this.glimpseUntil > 0 && this.distance > this.glimpseUntil) {
        this.world.glimpse.visible = false;
      }
    }
    if (this.world.bushHands.visible) {
      this.world.bushHands.position.x = 4.1 + Math.sin(t * 8) * 0.15;
      this.world.bushHands.position.y = 0.15 + Math.sin(t * 10) * 0.08;
      if (this.distance > roadAt(524)) this.world.bushHands.visible = false;
    }

    if (this.grabbing) {
      this.grabT += dt;
      const u = Math.min(1, this.grabT / 0.28);
      const e = u * u * u * u * u;
      const p = this.yawObject.position;
      const face = this.world.scareFace;
      face.visible = true;
      if (this.remoteDriven && this.waiterCamera) {
        face.position.lerpVectors(this.grabFrom, this.grabTo, e);
        face.lookAt(this.waiterGrabCam.x, this.waiterGrabCam.y, this.waiterGrabCam.z);
      } else {
        const fx = -Math.sin(this.yaw);
        const fz = -Math.cos(this.yaw);
        this.grabTo.set(p.x + fx * 0.08, 1.58, p.z + fz * 0.08);
        face.position.lerpVectors(this.grabFrom, this.grabTo, e);
        face.lookAt(p.x, 1.58, p.z);

        const dx = face.position.x - p.x;
        const dz = face.position.z - p.z;
        const wantYaw = Math.atan2(-dx, -dz);
        let dyaw = wantYaw - this.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        this.yaw += dyaw;
        this.pitch = 0.04;
        this.yawObject.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
      }
      face.scale.setScalar(2.4 + e * 26);
      this.world.viewmodel.carry.visible = false;
      this.trauma = 1;

      const white = u > 0.72 ? Math.min(1, (u - 0.72) / 0.18) : 0;
      useGame.getState().setWhiteout(white);
      if (this.grabT > 0.36 && !this.remoteDriven) this.resetRun();
    } else if (this.hungerLunging) {
      if (this.remoteDriven) {
        const u = Math.min(1, this.hungerLunge);
        const p = this.yawObject.position;
        this.world.monster.lookAt(p.x, 0, p.z);
        this.world.monsterArms[0].rotation.x = -u * 1.1;
        this.world.monsterArms[1].rotation.x = -u * 1.1;
      } else {
        this.hungerLunge += dt / 0.55;
        const u = Math.min(1, this.hungerLunge);
        const p = this.yawObject.position;
        this.world.monster.position.set(
          THREE.MathUtils.lerp(this.hungerFrom.x, p.x, u),
          0,
          THREE.MathUtils.lerp(this.hungerFrom.z, p.z - 1.5, u),
        );
        this.world.monster.lookAt(p.x, 0, p.z);
        this.world.monsterArms[0].rotation.x = -u * 1.1;
        this.world.monsterArms[1].rotation.x = -u * 1.1;
        this.world.monsterGlow.position.copy(this.world.monster.position);
        this.world.monsterGlow.position.y = 2.9;
        this.world.monsterGlow.intensity = 2.4 + Math.sin(t * 20) * 1.2;
        if (u >= 1) {
          this.hungerLunging = false;
          this.world.monster.visible = false;
          this.world.monsterGlow.intensity = 0;
          this.say("hunger_pork");
          this.say("ramen_wanted_me");
        }
      }
    } else if (this.world.monster.visible) {
      this.world.monster.rotation.y = Math.sin(t * 0.7) * 0.1;
      if (!this.remoteDriven) {
        this.world.monsterGlow.intensity = 1.6 + Math.sin(t * 8) * 0.7;
      }
    }

    if (this.scareT > 0) {
      this.scareT -= dt;
      if (!this.remoteDriven && (this.scareKind === "face" || this.scareKind === "watcher")) {
        this.world.scareFace.lookAt(
          this.yawObject.position.x,
          1.55,
          this.yawObject.position.z,
        );
      }
      if (this.scareT <= 0) {
        if (!this.remoteDriven) {
          if (!this.grabbing) this.world.scareFace.visible = false;
          if (this.scareKind === "face") this.world.stranger.visible = false;
          this.scareKind = "none";
        }
        if (useGame.getState().hitKind === "scare") useGame.getState().pulseHit("none");
      }
    }

    if (
      !this.remoteDriven &&
      this.lookingBack &&
      this.distance > roadAt(338) &&
      this.distance < roadAt(380) &&
      !this.seenBack
    ) {
      this.backScare();
    }

    if (!this.remoteDriven) this.blackout = Math.max(0, this.blackout - dt);
    const flick =
      1 +
      Math.sin(t * 13) * 0.04 +
      (Math.random() < 0.008 ? -0.65 : 0) +
      (this.flashlightFlicker > 0 ? (Math.random() - 0.5) * 1.8 : 0);
    this.flashlightFlicker = Math.max(0, this.flashlightFlicker - dt);
    this.world.flashlight.intensity = this.blackout > 0 ? 0.06 : Math.max(1.2, 5.5 * flick);
    if (this.lampKilled) this.world.lampDying.intensity = 0;
    else {
      this.world.lampDying.intensity =
        100 + Math.sin(t * 9) * 28 + (Math.random() < 0.02 ? -70 : 0);
    }
    this.updateLampPool();

    const distHouse = Math.abs(-this.yawObject.position.z - HOUSE_Z);
    this.world.porchLight.intensity = distHouse < 40 ? THREE.MathUtils.lerp(8, 2.2, distHouse / 40) : 2.2;
    this.world.fogTime.value = t;
    if (this.scene.fog instanceof THREE.FogExp2) {
      const tight = this.grabbing || this.world.monster.visible || this.hungerLunging;
      this.scene.fog.density = tight ? 0.22 : 0.125;
    }

    const fPos = this.world.fireflies.geometry.attributes.position;
    for (let i = 0; i < fPos.count; i++) {
      fPos.setY(i, fPos.getY(i) + Math.sin(t * 2 + i) * 0.002);
    }
    fPos.needsUpdate = true;

    if (!this.remoteDriven && this.resetT > 0 && !this.grabbing) {
      this.resetT += dt;
      if (this.resetT > 0.1) this.startGrab();
    }

    this.hudAcc += dt;
    if (this.hudAcc > 0.08) {
      this.hudAcc = 0;
      useGame.getState().setHud(Math.floor(this.distance), Math.round(stability));
    }

    if (!this.remoteDriven) {
      this.updateEncounters();
      if (!this.spilled) {
        for (const ev of this.events) {
          if (!ev.triggered && this.distance >= ev.distance) {
            ev.triggered = true;
            ev.run();
          }
        }
      }
    }
  }

  /** Three r185 lights are physically sized — dozens of live streetlamps
   * would be both wrong-looking (they'd blow out the fog) and expensive.
   * Only the handful nearest the player actually emit; the rest sit at
   * zero intensity / invisible until the player gets close. */
  private updateLampPool() {
    const NEAR_LAMPS = 6;
    const z = this.yawObject.position.z;
    const lamps = this.world.lampLights;
    if (lamps.length <= NEAR_LAMPS) {
      for (const l of lamps) {
        l.point.visible = true;
        l.spot.visible = true;
        l.point.intensity = l.pointIntensity;
        l.spot.intensity = l.spotIntensity;
      }
      return;
    }
    const ranked = [...lamps].sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z));
    for (let i = 0; i < ranked.length; i++) {
      const on = i < NEAR_LAMPS;
      const l = ranked[i];
      l.point.visible = on;
      l.spot.visible = on;
      l.point.intensity = on ? l.pointIntensity : 0;
      l.spot.intensity = on ? l.spotIntensity : 0;
    }
  }

  private animateSteam(t: number, on: number) {
    this.world.viewmodel.steam.forEach((s, i) => {
      const cycle = (t * 0.35 + i * 0.17) % 1;
      const fade = Math.sin(cycle * Math.PI);
      const drift = i * 1.9;
      s.position.x = Math.sin(t * 0.8 + drift) * 0.028 + (i - 2.5) * 0.01;
      s.position.z = Math.cos(t * 0.55 + drift) * 0.018;
      s.position.y = 0.075 + cycle * 0.11;
      const w = 0.055 + cycle * 0.05;
      s.scale.set(w * 1.15, w, 1);
      (s.material as THREE.SpriteMaterial).opacity = on * fade * 0.55;
    });
  }

  private applyShake(t: number) {
    this.trauma = Math.max(0, this.trauma - 1.6 * ((t && 0.016) || 0.016));
    const decay = 1.8;
    this.trauma = Math.max(0, this.trauma - decay * 0.016);
    const s = this.trauma * this.trauma;
    const rs = this.roadShake;
    this.camera.position.x =
      (Math.sin(t * 47) * 0.08 + Math.sin(t * 23) * 0.04) * s +
      (Math.sin(t * 47) * 0.014 + Math.sin(t * 13) * 0.008) * rs;
    this.camera.rotation.z = Math.sin(t * 31) * 0.04 * s + Math.sin(t * 31) * 0.012 * rs;
  }

  private installProbe() {
    window.__controlsTest = {
      getYaw: () => this.yaw,
      getSpeed: () => this.lastSpeed,
      getX: () => this.yawObject.position.x,
      getZ: () => this.yawObject.position.z,
      setYaw: (yaw) => {
        this.yaw = yaw;
      },
      setPitch: (pitch) => {
        this.pitch = Math.max(-1.15, Math.min(0.85, pitch));
      },
      setKeys: (codes) => {
        this.injected = codes.length ? [...codes] : null;
      },
    };
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onBlur);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    window.removeEventListener("pointerdown", this.onWantLock);
    this.canvas.removeEventListener("pointerdown", this.onPtrDown);
    window.removeEventListener("pointermove", this.onPtrMove);
    window.removeEventListener("pointerup", this.onPtrUp);
    window.removeEventListener("pointercancel", this.onPtrUp);
    this.exitLock();
    if (this.typing) window.clearInterval(this.typing);
    if (this.autoAdvanceTimer !== null) window.clearTimeout(this.autoAdvanceTimer);
    this.dialogueGen++;
    this.audio.dispose();
    disposeWorld(this.world);
    disposeArt(this.art);
    this.renderer.dispose();
    this.disableWaiterView();
    delete window.__controlsTest;
  }
}
