import ambientUrl from "@/soundassets/ambientAudio.mp3?url";

const VOICE_URLS = import.meta.glob("../soundassets/*.{wav,mp3}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function fileStem(name: string) {
  return name.replace(/\.(wav|mp3)$/i, "").toLowerCase();
}

function voiceUrl(file: string) {
  const stem = fileStem(file);
  if (stem === "ambientaudio" || stem.startsWith("ref_")) return undefined;
  let wav: string | undefined;
  let mp3: string | undefined;
  for (const [path, url] of Object.entries(VOICE_URLS)) {
    const base = path.split("/").pop() ?? path;
    if (fileStem(base) !== stem) continue;
    if (base.toLowerCase().endsWith(".wav")) wav = url;
    else mp3 = url;
  }
  return wav ?? mp3;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientSrc: AudioBufferSourceNode | null = null;
  private ambientBuffer: AudioBuffer | null = null;
  private ambientEl: HTMLAudioElement | null = null;
  private ambientGen = 0;
  private unlocked = false;
  private lastStep = 0;
  private lastBeat = 0;
  private voice: HTMLAudioElement | null = null;
  private voiceDuck = false;
  private tension = 0;

  unlock() {
    if (this.unlocked) {
      void this.ctx?.resume();
      this.ensureAmbientPlaying();
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: "interactive" });
    const master = ctx.createGain();
    master.gain.value = 0.34;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.unlocked = true;
    this.startDrone();
    void this.startAmbient();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void ctx.resume();
        this.ensureAmbientPlaying();
      }
    });
  }

  private startDrone() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const drone = ctx.createGain();
    drone.gain.value = 0.03;
    drone.connect(master);
    this.droneGain = drone;

    const make = (freq: number, type: OscillatorType, gain: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = gain;
      osc.connect(g);
      g.connect(drone);
      osc.start();
    };
    make(46, "sine", 0.9);
    make(52.5, "sine", 0.45);
    make(93, "triangle", 0.12);
  }

  private async startAmbient() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.ambientGain) return;
    const g = ctx.createGain();
    g.gain.value = 0.2;
    g.connect(master);
    this.ambientGain = g;
    const gen = ++this.ambientGen;
    try {
      const res = await fetch(ambientUrl);
      const raw = await res.arrayBuffer();
      if (gen !== this.ambientGen || this.ctx !== ctx) return;
      const buf = await ctx.decodeAudioData(raw.slice(0));
      if (gen !== this.ambientGen || this.ctx !== ctx) return;
      this.ambientBuffer = buf;
      this.spawnAmbientLoop();
      this.applyBeds();
    } catch {
      if (gen !== this.ambientGen || this.ctx !== ctx) return;
      this.startAmbientElement();
    }
  }

  private spawnAmbientLoop() {
    const ctx = this.ctx;
    const gain = this.ambientGain;
    const buf = this.ambientBuffer;
    if (!ctx || !gain || !buf) return;
    try {
      this.ambientSrc?.stop();
    } catch {
      /* already stopped */
    }
    this.ambientSrc?.disconnect();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = buf.duration;
    src.connect(gain);
    src.onended = () => {
      if (this.ambientSrc !== src) return;
      this.ambientSrc = null;
      this.spawnAmbientLoop();
    };
    src.start();
    this.ambientSrc = src;
  }

  private startAmbientElement() {
    const ctx = this.ctx;
    const gain = this.ambientGain;
    if (!ctx || !gain || this.ambientEl) return;
    const a = new Audio(ambientUrl);
    a.loop = true;
    a.preload = "auto";
    a.crossOrigin = "anonymous";
    const restart = () => {
      a.currentTime = 0;
      void a.play().catch(() => undefined);
    };
    a.addEventListener("ended", restart);
    ctx.createMediaElementSource(a).connect(gain);
    this.ambientEl = a;
    restart();
    this.applyBeds();
  }

  private ensureAmbientPlaying() {
    if (this.ambientSrc) return;
    if (this.ambientBuffer) {
      this.spawnAmbientLoop();
      return;
    }
    if (this.ambientEl) {
      this.ambientEl.loop = true;
      if (this.ambientEl.ended || this.ambientEl.paused) {
        this.ambientEl.currentTime = 0;
        void this.ambientEl.play().catch(() => undefined);
      }
    }
  }

  setTension(t: number) {
    this.tension = t;
    this.applyBeds();
  }

  /** Plays a voice line. Returns true if a real audio file was found and
   * playback was attempted (in which case onEnded fires once it finishes
   * or errors out); returns false immediately if there's no audio for this
   * line, so callers can fall back to a text-timed auto-advance. */
  speak(file: string, onEnded?: () => void): boolean {
    this.stopSpeak();
    const url = voiceUrl(file);
    if (!url) return false;
    const a = new Audio(url);
    a.preload = "auto";
    this.voice = a;
    this.voiceDuck = true;
    this.applyBeds();
    const done = () => {
      if (this.voice !== a) return;
      this.voice = null;
      this.voiceDuck = false;
      this.applyBeds();
      onEnded?.();
    };
    a.addEventListener("ended", done);
    a.addEventListener("error", done);
    void a.play().catch(done);
    return true;
  }

  stopSpeak() {
    if (!this.voice) {
      this.voiceDuck = false;
      this.applyBeds();
      return;
    }
    const a = this.voice;
    this.voice = null;
    a.pause();
    a.removeAttribute("src");
    a.load();
    this.voiceDuck = false;
    this.applyBeds();
  }

  dispose() {
    this.ambientGen += 1;
    this.stopSpeak();
    try {
      this.ambientSrc?.stop();
    } catch {
      /* already stopped */
    }
    this.ambientSrc?.disconnect();
    this.ambientSrc = null;
    this.ambientBuffer = null;
    if (this.ambientEl) {
      this.ambientEl.pause();
      this.ambientEl.removeAttribute("src");
      this.ambientEl.load();
      this.ambientEl = null;
    }
    this.ambientGain = null;
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.droneGain = null;
    this.unlocked = false;
  }

  private applyBeds() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const duck = this.voiceDuck ? 0.28 : 1;
    if (this.droneGain) {
      const base = 0.025 + this.tension * 0.05;
      this.droneGain.gain.setTargetAtTime(base * duck, now, 0.12);
    }
    if (this.ambientGain) {
      const base = 0.2 + this.tension * 0.1;
      this.ambientGain.gain.setTargetAtTime(base * duck, now, 0.18);
    }
  }

  footstep(heavy = false) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    if (now - this.lastStep < 0.26) return;
    this.lastStep = now;
    const sr = ctx.sampleRate;
    const gritDur = 0.11;
    const grit = ctx.createBuffer(1, Math.floor(sr * gritDur), sr);
    const gData = grit.getChannelData(0);
    for (let i = 0; i < gData.length; i++) {
      const t = i / gData.length;
      const env = Math.exp(-t * 18) * (1 - t);
      gData[i] = (Math.random() * 2 - 1) * env;
    }
    const gritSrc = ctx.createBufferSource();
    gritSrc.buffer = grit;
    gritSrc.playbackRate.value = 0.92 + Math.random() * 0.16;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900 + Math.random() * 400;
    hp.Q.value = 0.6;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2200 + Math.random() * 900;
    bp.Q.value = 0.85;
    const gritG = ctx.createGain();
    gritG.gain.value = heavy ? 0.28 : 0.2;
    gritSrc.connect(hp);
    hp.connect(bp);
    bp.connect(gritG);
    gritG.connect(master);

    const slapDur = 0.045;
    const slap = ctx.createBuffer(1, Math.floor(sr * slapDur), sr);
    const sData = slap.getChannelData(0);
    for (let i = 0; i < sData.length; i++) {
      const t = i / sData.length;
      sData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 42);
    }
    const slapSrc = ctx.createBufferSource();
    slapSrc.buffer = slap;
    slapSrc.playbackRate.value = 1.05 + Math.random() * 0.2;
    const slapF = ctx.createBiquadFilter();
    slapF.type = "highpass";
    slapF.frequency.value = 1400;
    const slapG = ctx.createGain();
    slapG.gain.value = heavy ? 0.18 : 0.13;
    slapSrc.connect(slapF);
    slapF.connect(slapG);
    slapG.connect(master);

    const osc = ctx.createOscillator();
    const oscG = ctx.createGain();
    osc.type = "sine";
    const heel = 95 + Math.random() * 28;
    osc.frequency.setValueAtTime(heel, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.07);
    oscG.gain.setValueAtTime(0.0001, now);
    oscG.gain.exponentialRampToValueAtTime(heavy ? 0.22 : 0.15, now + 0.008);
    oscG.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(oscG);
    oscG.connect(master);

    gritSrc.start(now);
    slapSrc.start(now + 0.006);
    osc.start(now);
    osc.stop(now + 0.1);
    gritSrc.onended = () => {
      gritSrc.disconnect();
      hp.disconnect();
      bp.disconnect();
      gritG.disconnect();
    };
    slapSrc.onended = () => {
      slapSrc.disconnect();
      slapF.disconnect();
      slapG.disconnect();
    };
  }

  heartbeat(force = false) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    if (!force && now - this.lastBeat < 0.7) return;
    this.lastBeat = now;
    const thump = (when: number, freq: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, when);
      osc.frequency.exponentialRampToValueAtTime(28, when + 0.12);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.35, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
      osc.connect(g);
      g.connect(master);
      osc.start(when);
      osc.stop(when + 0.2);
    };
    thump(now, 70);
    thump(now + 0.18, 56);
  }

  whisper() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const dur = 0.55;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.sin((i / data.length) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env * 0.4;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  jumpscare() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc2.type = "square";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.42);
    osc2.frequency.setValueAtTime(147, now);
    osc2.frequency.exponentialRampToValueAtTime(38, now + 0.42);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.45, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(g);
    osc2.connect(g);
    g.connect(master);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.56);
    osc2.stop(now + 0.56);

    const dur = 0.28;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.value = 0.28;
    src.connect(filter);
    filter.connect(ng);
    ng.connect(master);
    src.start(now);
  }

  spill() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const dur = 0.5;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.3;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(now);
  }

  twig() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = "square";
    osc.frequency.setValueAtTime(420 + Math.random() * 200, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(g);
    g.connect(master);
    osc.start(now);
    osc.stop(now + 0.11);
  }
}
