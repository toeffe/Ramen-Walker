import * as THREE from "three";
import { GameAudio } from "@/game/audio";
import { useGame } from "@/game/store";
import { buildWorld, disposeWorld, HOUSE_Z, ROAD_HALF, type World } from "@/game/world";
import { disposeArt, type GameArt } from "@/game/art";
import {
  getLine,
  RAMEN_ASIDES,
  YOU_ASIDES,
  type LineId,
} from "@/game/dialogue";

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
type HoldKind = "sentinel" | "watcher" | "hunger";
type QueuedLine = { id: LineId; after?: () => void; event?: HoldKind };

const HOLD_LEAVE_DIST = 14;

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
  private scareKind: "none" | "face" | "hunger" | "watcher" | "hands" | "mailbox" = "none";
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
  private events: StoryEvent[] = [];
  private seenBack = false;
  private mailboxArmed = false;
  private lampKilled = false;
  private hold: HoldKind | null = null;
  private holdGrace = 0;
  private metSentinel = false;
  private metWatcher = false;
  private metHunger = false;
  private houseTalked = false;
  private hungerFrom = new THREE.Vector3(0, 0, -470);
  private crossing = false;
  private crossingT = 0;
  private falsePorch = 0;
  private bowlHeavy = 0;
  private glimpseUntil = 0;
  private trayDamage = 0;
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

    this.world = buildWorld(this.scene, this.camera, art);
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
  };

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
      if (!this.started || this.ended) return;
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      this.tryLock();
    };
    this.onLockChange = () => {
      if (this.disposed) return;
      const locked = document.pointerLockElement === this.canvas;
      this.canvas.style.cursor = locked || (this.started && !this.ended) ? "none" : "";
    };
    this.onPtrDown = (e) => {
      if (!this.started || this.ended) return;
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

      if (looking) {
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

  advanceDialogue() {
    const st = useGame.getState();
    if (!st.dialogue) return;
    if (!st.dialogue.complete) {
      if (this.typing) window.clearInterval(this.typing);
      this.typing = null;
      useGame.getState().setDialogue({ speaker: st.dialogue.speaker, text: this.fullText, complete: true });
      return;
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
    this.dialogueQ = [];
    this.after = null;
    this.lineEvent = null;
    this.hold = null;
    this.holdGrace = 0;
    this.audio.stopSpeak();
    const p = this.yawObject.position;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.grabFrom.set(p.x + fx * 5.4, 1.58, p.z + fz * 5.4);
    this.grabTo.set(p.x + fx * 0.1, 1.58, p.z + fz * 0.1);
    this.world.monster.visible = false;
    this.world.monsterGlow.intensity = 0;
    const face = this.world.scareFace;
    face.visible = true;
    face.position.copy(this.grabFrom);
    face.scale.setScalar(2.4);
    face.lookAt(p.x, 1.58, p.z);
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
    if (this.typing) {
      window.clearInterval(this.typing);
      this.typing = null;
    }
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
    this.houseTalked = false;
    this.hungerFrom.set(0, 0, -470);
    this.crossing = false;
    this.crossingT = 0;
    this.falsePorch = 0;
    this.bowlHeavy = 0;
    this.glimpseUntil = 0;
    this.trayDamage = Math.min(1, this.trayDamage * 0.72 + 0.1);
    this.lookingBack = false;
    this.balanceDx = 0;
    this.balanceDy = 0;
    for (const ev of this.events) ev.triggered = false;

    const w = this.world;
    w.mailbox.position.set(-3.15, 0, -68);
    w.mailbox.rotation.set(0, Math.PI / 2, 0);
    w.mailboxFlag.rotation.x = 0.35;
    w.mailboxEye.scale.setScalar(0.01);
    w.mailboxEyeMat.emissiveIntensity = 0;
    w.stranger.visible = false;
    w.stranger.position.set(1.4, 0, -148);
    w.monster.visible = false;
    w.monster.position.set(0, 0, -470);
    w.monster.rotation.set(0, 0, 0);
    w.monster.scale.setScalar(1.72);
    w.monsterGlow.intensity = 0;
    w.monsterGlow.position.set(0, 3.1, -468);
    w.monsterArms[0].rotation.set(0, 0, -0.12);
    w.monsterArms[1].rotation.set(0, 0, 0.12);
    w.scareFace.visible = false;
    w.scareFace.scale.setScalar(1);
    w.viewmodel.carry.visible = true;
    w.bushHands.visible = false;
    w.bushHands.position.set(4.4, 0, -338);
    w.glimpse.visible = false;
    w.glimpse.position.set(7.4, 0, -358);
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
    this.tryLock();
  }

  private warn(text: string) {
    useGame.getState().setWarning(text);
    window.setTimeout(() => {
      if (useGame.getState().warning === text) useGame.getState().setWarning(null);
    }, 1600);
  }

  private pick<T extends LineId>(ids: readonly T[]) {
    return ids[Math.floor(Math.random() * ids.length)]!;
  }

  private say(id: LineId, after?: () => void, event?: HoldKind) {
    this.dialogueQ.push({ id, after, event });
    if (!useGame.getState().dialogue) this.showNext();
  }

  private showNext() {
    if (this.dialogueQ.length === 0) {
      this.audio.stopSpeak();
      this.after = null;
      this.lineEvent = null;
      useGame.getState().setDialogue(null);
      return;
    }
    const entry = this.dialogueQ.shift();
    if (!entry) {
      this.audio.stopSpeak();
      this.after = null;
      this.lineEvent = null;
      useGame.getState().setDialogue(null);
      return;
    }
    const line = getLine(entry.id);
    this.after = entry.after ?? null;
    this.lineEvent = entry.event ?? null;
    this.fullText = line.text;
    this.audio.speak(line.file);
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

  private scare(kind: typeof this.scareKind) {
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
  }

  private holdSpeakerPos() {
    if (this.hold === "sentinel") return this.world.mailbox.position;
    if (this.hold === "watcher") return this.world.stranger.position;
    if (this.hold === "hunger") return this.world.monster.position;
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
      this.world.stranger.position.set(1.4, 0, -148);
    }
    if (this.hold === "hunger") {
      this.hungerFrom.copy(this.world.monster.position);
    }
    this.hold = null;
    this.holdGrace = 0;
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

  private startHouseTalk() {
    this.say("ramen_good");
    this.say("you_just_ramen");
    this.say("ramen_no_isnt");
  }

  private steerLookToSpeaker(dt: number) {
    if (!this.hold || this.grabbing) return;
    const target =
      this.hold === "sentinel"
        ? this.world.mailbox.position
        : this.hold === "watcher"
          ? this.world.stranger.position
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
    return THREE.MathUtils.clamp(this.distance / 620 * 0.62 + this.trayDamage * 0.95, 0, 1.28);
  }

  private updateEncounters() {
    const z = this.yawObject.position.z;
    if (!this.metSentinel && z <= -60) {
      this.metSentinel = true;
      this.startSentinel();
    }
    if (!this.metWatcher && z <= -140 && !this.hold) {
      this.metWatcher = true;
      this.startWatcher();
    }
    if (!this.metHunger && z <= -448 && !this.hold) {
      this.metHunger = true;
      this.startHunger();
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
      this.triggerEnding("home");
    }
  }

  private buildStory() {
    this.events = [
      { distance: 6, run: () => this.say("you_later") },
      { distance: 12, run: () => this.say(this.pick(YOU_ASIDES)) },
      { distance: 16, run: () => this.say("you_warm") },
      { distance: 22, run: () => this.say("you_count") },
      {
        distance: 28,
        run: () => {
          this.say("ramen_dont_spill");
          this.audio.whisper();
        },
      },
      { distance: 36, run: () => this.say("you_yeah") },
      { distance: 40, run: () => this.say(this.pick(RAMEN_ASIDES)) },
      { distance: 44, run: () => this.say("ramen_deal") },
      {
        distance: 158,
        run: () => {
          this.say("ramen_hey");
          this.say("you_bowl_talk");
          this.say("ramen_level");
        },
      },
      {
        distance: 168,
        run: () => {
          this.bowlHeavy = 8;
          this.trayDamage = Math.min(1, this.trayDamage + 0.08);
          this.trayRollV += 0.7;
          this.warn("THE BOWL GOT HEAVIER");
        },
      },
      {
        distance: 178,
        run: () => {
          this.say("ramen_with_us");
          this.audio.whisper();
        },
      },
      { distance: 188, run: () => this.say("you_not_mine") },
      { distance: 198, run: () => this.say("you_heard") },
      {
        distance: 210,
        run: () => {
          this.trayRollV += 1.2;
          this.audio.twig();
          this.warn("COLD PATCH");
        },
      },
      { distance: 218, run: () => this.say("ramen_wind") },
      {
        distance: 222,
        run: () => {
          this.world.glimpse.position.set(-7.2, 0, this.yawObject.position.z - 11);
          this.world.glimpse.visible = true;
          this.glimpseUntil = this.distance + 12;
          this.audio.twig();
        },
      },
      { distance: 232, run: () => this.say("ramen_dont_look") },
      {
        distance: 248,
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
        distance: 268,
        run: () => {
          this.say("ramen_gaps");
          this.audio.whisper();
        },
      },
      {
        distance: 278,
        run: () => {
          this.world.glimpse.position.set(7.4, 0, -358);
          this.world.glimpse.visible = true;
          this.glimpseUntil = 300;
          this.audio.twig();
          this.warn("SOMETHING IN THE TREES");
        },
      },
      { distance: 292, run: () => this.say("you_rock") },
      { distance: 300, run: () => this.say("you_how_long") },
      { distance: 308, run: () => this.say("ramen_how_long") },
      { distance: 314, run: () => this.say("ramen_road") },
      {
        distance: 324,
        run: () => {
          this.crossing = true;
          this.crossingT = 0;
          this.say("watcher_again");
        },
      },
      {
        distance: 338,
        run: () => {
          this.world.bushHands.visible = true;
          this.scare("hands");
          this.warn("DON'T REACH BACK");
          this.say("you_what_was");
          this.say("ramen_dont_answer");
        },
      },
      { distance: 350, run: () => this.say("ramen_dont_thank") },
      {
        distance: 360,
        run: () => {
          this.say("ramen_names");
          this.say("you_name");
        },
      },
      {
        distance: 368,
        run: () => {
          this.trayRollV += 1.8;
          this.trayDamage = Math.min(1, this.trayDamage + 0.06);
          this.audio.twig();
          this.warn("THE TRAY SHUDDERED");
        },
      },
      { distance: 388, run: () => this.say("ramen_faster") },
      {
        distance: 396,
        run: () => {
          this.say("ramen_second_look");
          if (this.lookingBack) this.backScare();
        },
      },
      {
        distance: 408,
        run: () => {
          this.blackout = 1.35;
          this.lampKilled = true;
          this.audio.heartbeat(true);
        },
      },
      {
        distance: 418,
        run: () => {
          this.frontScare();
          this.scare("face");
          this.say("you_no");
          this.say("you_face");
          this.say("ramen_tray");
        },
      },
      { distance: 492, run: () => this.say("ramen_try_again") },
      { distance: 508, run: () => this.say("you_why") },
      { distance: 518, run: () => this.say("ramen_warm") },
      { distance: 538, run: () => this.say("ramen_eat_you") },
      {
        distance: 552,
        run: () => {
          this.falsePorch = 4.2;
          this.say("you_light_moved");
          this.say("ramen_not_porch");
        },
      },
      { distance: 568, run: () => this.say("ramen_almost") },
      { distance: 588, run: () => this.say("you_light") },
      { distance: 608, run: () => this.say("ramen_focus") },
      { distance: 622, run: () => this.say("you_almost") },
    ];
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
    if (document.exitPointerLock) document.exitPointerLock();
    const spilled = this.spilled;
    let title = "HOME";
    let html =
      '"Chicken?"<br>"Yeah."<br>"Nice."<br><br>You set the tray on the table. Steam lifts. For a moment the bowl says thank you.<br><br>But it\'s just soup.<br><br><em>I was chicken.</em>';
    if (kind === "taken") {
      title = "IT WAS NEVER YOURS";
      html =
        "The tray is empty. The road is not.<br><br>Something warm sits in your chest where the bowl used to be. It remembers being carried. It remembers being dropped.<br><br>The house lights go out.<br><br><em>I prefer pork.</em>";
    } else if (spilled) {
      title = "HOME (NOODLES EVERYWHERE)";
      html =
        '"Chicken?"<br>"...it was."<br><br>The tray is wet. Your roommate looks at it, then at you, then closes the door from the inside.<br><br>You sit on the porch. The Sentinel is still there. The Watcher is probably still there.<br><br><em>I was chicken.</em>';
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

    if (this.lookDx || this.lookDy) {
      this.yaw -= this.lookDx * 0.0034;
      this.pitch -= this.lookDy * 0.0034;
      this.pitch = Math.max(-1.15, Math.min(0.85, this.pitch));
      this.lookDx = 0;
      this.lookDy = 0;
    }

    this.yawObject.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    if (this.started && !this.ended) this.updatePlay(dt, t);
    else this.updateIdle(t);

    this.applyShake(t);
    this.renderer.render(this.scene, this.camera);
  };

  private updateIdle(t: number) {
    this.world.viewmodel.carry.rotation.z = Math.sin(t * 0.7) * 0.02;
    this.world.viewmodel.carry.rotation.x = Math.sin(t * 0.5) * 0.01;
    this.animateSteam(t, 1);
  }

  private updatePlay(dt: number, t: number) {
    let forward = 0;
    let right = 0;
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
    const running = this.held("ShiftLeft") || this.held("ShiftRight");
    const speed = running ? 5.4 : 3.35;
    const moving = mlen > 0.08;
    this.lastSpeed = moving ? speed * Math.min(1, mlen) : 0;

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

    const bob = moving ? Math.sin(this.walkCycle) * 0.028 : 0;
    if (moving) {
      this.walkCycle += dt * (running ? 11 : 8);
      if (this.walkCycle - this.lastFoot > Math.PI) {
        this.lastFoot = this.walkCycle;
        this.audio.footstep(running);
      }
    }
    this.camera.position.y = bob;

    const LIM_X = 0.255;
    const strain = this.trayStrain();
    const G = (this.bowlHeavy > 0 ? 12.4 : 9.1) * (1 + strain * 0.42);
    const MU_S = 0.2 * (1 - strain * 0.55);
    const MU_K = 0.11 * (1 - strain * 0.5);
    const BOWL_Y = 0.01;
    const restore = 4.2 * (1 - strain * 0.48);
    const damp = 5.5 * (1 - strain * 0.38);

    this.trayRollV += this.balanceDx * (0.024 * (1 - strain * 0.22));
    this.balanceDx = 0;
    this.balanceDy = 0;
    if (moving) {
      this.trayRollV += right * (1.25 + strain * 1.4) * dt;
      this.trayRollV += Math.sin(this.walkCycle) * ((running ? 1.85 : 0.82) + strain * 1.7) * dt;
    }
    if (this.hold) this.trayRollV += (Math.random() - 0.5) * (2.4 + strain * 4) * dt;
    if (this.scareT > 0) {
      this.trayRollV += (Math.random() - 0.5) * (8 + strain * 6) * dt;
    }
    this.trayRollV += (Math.random() - 0.5) * strain * 5.5 * dt;
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
      (this.distance / 650) * 0.5 + (this.spilled ? 0.5 : 0) + (1 - stability / 100) * 0.5,
    );
    if (stability < 38 && !this.spilled) this.audio.heartbeat();

    this.bowlHeavy = Math.max(0, this.bowlHeavy - dt);
    this.falsePorch = Math.max(0, this.falsePorch - dt);

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
    if (this.crossing) {
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
        this.world.stranger.position.set(1.4, 0, -148);
      }
    } else if (this.world.stranger.visible) {
      this.world.strangerHead.lookAt(
        this.yawObject.position.x,
        1.95,
        this.yawObject.position.z,
      );
    }
    if (this.world.glimpse.visible && this.glimpseUntil > 0 && this.distance > this.glimpseUntil) {
      this.world.glimpse.visible = false;
    }
    if (this.world.bushHands.visible) {
      this.world.bushHands.position.x = 4.1 + Math.sin(t * 8) * 0.15;
      this.world.bushHands.position.y = 0.15 + Math.sin(t * 10) * 0.08;
      if (this.distance > 355) this.world.bushHands.visible = false;
    }

    if (this.grabbing) {
      this.grabT += dt;
      const u = Math.min(1, this.grabT / 0.28);
      const e = u * u * u * u * u;
      const p = this.yawObject.position;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      this.grabTo.set(p.x + fx * 0.08, 1.58, p.z + fz * 0.08);
      const face = this.world.scareFace;
      face.visible = true;
      face.position.lerpVectors(this.grabFrom, this.grabTo, e);
      face.lookAt(p.x, 1.58, p.z);
      face.scale.setScalar(2.4 + e * 26);

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
      this.world.viewmodel.carry.visible = false;
      this.trauma = 1;

      const white = u > 0.72 ? Math.min(1, (u - 0.72) / 0.18) : 0;
      useGame.getState().setWhiteout(white);
      if (this.grabT > 0.36) this.resetRun();
    } else if (this.hungerLunging) {
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
    } else if (this.world.monster.visible) {
      this.world.monster.rotation.y = Math.sin(t * 0.7) * 0.1;
      this.world.monsterGlow.intensity = 1.6 + Math.sin(t * 8) * 0.7;
    }

    if (this.scareT > 0) {
      this.scareT -= dt;
      if (this.scareKind === "face" || this.scareKind === "watcher") {
        this.world.scareFace.lookAt(
          this.yawObject.position.x,
          1.55,
          this.yawObject.position.z,
        );
      }
      if (this.scareT <= 0) {
        if (!this.grabbing) this.world.scareFace.visible = false;
        if (this.scareKind === "face") this.world.stranger.visible = false;
        this.scareKind = "none";
        if (useGame.getState().hitKind === "scare") useGame.getState().pulseHit("none");
      }
    }

    if (this.lookingBack && this.distance > 228 && this.distance < 260 && !this.seenBack) {
      this.backScare();
    }

    this.blackout = Math.max(0, this.blackout - dt);
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
        4.2 + Math.sin(t * 9) * 1.1 + (Math.random() < 0.02 ? -2.4 : 0);
    }

    const distHouse = Math.abs(-this.yawObject.position.z - HOUSE_Z);
    this.world.porchLight.intensity =
      (distHouse < 40 ? THREE.MathUtils.lerp(8, 2.2, distHouse / 40) : 2.2) +
      (this.falsePorch > 0 ? 11 : 0);
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

    if (this.resetT > 0 && !this.grabbing) {
      this.resetT += dt;
      if (this.resetT > 0.1) this.startGrab();
    }

    this.hudAcc += dt;
    if (this.hudAcc > 0.08) {
      this.hudAcc = 0;
      useGame.getState().setHud(Math.floor(this.distance), Math.round(stability));
    }

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
    if (s < 0.001) {
      this.camera.rotation.z = 0;
      return;
    }
    this.camera.position.x = (Math.sin(t * 47) * 0.08 + Math.sin(t * 23) * 0.04) * s;
    this.camera.rotation.z = Math.sin(t * 31) * 0.04 * s;
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
    this.audio.dispose();
    disposeWorld(this.world);
    disposeArt(this.art);
    this.renderer.dispose();
    delete window.__controlsTest;
  }
}
