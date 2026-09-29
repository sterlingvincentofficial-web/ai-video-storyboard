/**
 * TOONFIRE — procedural audio engine.
 *
 * Everything is synthesized live with the Web Audio API (oscillators, noise buffers, filters,
 * envelopes, waveshapers, delays, a generated convolution reverb). No assets, no libraries.
 *
 * Signal graph (one per AudioContext, see createChain):
 *
 *   master gain ──> DynamicsCompressor (limiter) ──> destination
 *     ├── sfx volume <── game-sfx gate (pause) <── voices (gain → [lowpass] → [StereoPanner])
 *     │              │                          <── ping-pong echo return (world "space", neon is wet)
 *     │              └── ui-sfx (ignores pause)
 *     └── music volume <── pause duck <── pause lowpass <── tracks (layer gains → intensity lowpass)
 *                                                      <── convolver reverb (music only)
 *
 * Usage:
 *   audio.unlock()                          // from a user gesture (also auto-hooked on the first pointer/touch/key)
 *   audio.setVolumes(1, 0.7, 1)
 *   audio.setWorld('neon'); audio.startMusic('neon'); audio.setMusicIntensity(0.4)
 *   audio.setListener(camera.position, yaw) // every frame
 *   audio.play('blaster')                   // local / 2D (the player's own gun, UI, jingles)
 *   audio.play('blaster', { pos })          // positional (bots, impacts, explosions)
 *
 * Every public call is no-throw and a silent no-op when Web Audio is unavailable / not unlocked.
 */

// ============================================================================================
// Public types
// ============================================================================================

export type SfxName =
  | 'blaster' | 'scatter' | 'boomer' | 'zapper'
  | 'grenade_throw' | 'explosion' | 'bounce' | 'whoosh' | 'splat'
  | 'hit' | 'headshot' | 'kill' | 'hurt' | 'death'
  | 'jump' | 'double_jump' | 'land' | 'footstep' | 'jumppad'
  | 'reload' | 'reload_done' | 'empty' | 'switch'
  | 'pickup_health' | 'pickup_ammo' | 'pickup_weapon' | 'pickup_power'
  | 'flag_taken' | 'flag_captured' | 'flag_returned' | 'flag_dropped'
  | 'zone_capture' | 'zone_contested'
  | 'countdown' | 'go' | 'victory' | 'defeat' | 'multikill' | 'respawn'
  | 'ui_click' | 'ui_hover' | 'ui_back';

export type WorldId = 'plaza' | 'paper' | 'comic' | 'toy' | 'neon';
export type MusicTrack = WorldId | 'menu';

export interface PlayOpts {
  pos?: { x: number; y: number; z: number }; // world position; omit for 2D/UI sounds
  volume?: number; // 0..1 multiplier, default 1
  pitch?: number; // playback-rate style multiplier, default 1
}

type Vec3 = { x: number; y: number; z: number };
type NoiseKind = 'white' | 'pink' | 'brown' | 'crackle';
type NoiseBank = Record<NoiseKind, AudioBuffer>;

export const WORLD_IDS: readonly WorldId[] = ['plaza', 'paper', 'comic', 'toy', 'neon'];
export const MUSIC_TRACKS: readonly MusicTrack[] = ['menu', 'plaza', 'paper', 'comic', 'toy', 'neon'];

// ============================================================================================
// Small utils
// ============================================================================================

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const mod12 = (n: number) => ((n % 12) + 12) % 12;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const fclamp = (f: number) => clamp(f, 10, 20000);

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function safeDisconnect(nodes: AudioNode[]) {
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

// ============================================================================================
// Shared buffers: noise, reverb IR, waveshaper curve
// ============================================================================================

function makeShaperCurve() {
  const n = 1024;
  const c = new Float32Array(n);
  const k = 2.6;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * k) / norm;
  }
  return c;
}
const SHAPER_CURVE = makeShaperCurve();

function makeNoiseBank(ac: BaseAudioContext): NoiseBank {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * 2);
  const mk = () => ac.createBuffer(1, len, sr);
  const white = mk(), pink = mk(), brown = mk(), crackle = mk();
  const w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0), c = crackle.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0, ce = 0, cr = 0.9;
  for (let i = 0; i < len; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    // Paul Kellet's pink filter
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362;
    b6 = x * 0.115926;
    // brown: leaky integrator
    br = (br + 0.02 * x) / 1.02;
    b[i] = br;
    // crackle: sparse, quickly decaying noise bursts = paper crinkle / rustle
    if (Math.random() < 0.0035) {
      ce = 0.35 + Math.random() * 0.65;
      cr = 0.82 + Math.random() * 0.15;
    }
    c[i] = ce * x;
    ce *= cr;
  }
  // remove DC drift so looping is click-free, then normalise peaks
  for (const d of [p, b]) {
    const k = d[len - 1] - d[0];
    let mean = 0;
    for (let i = 0; i < len; i++) {
      d[i] -= (k * i) / (len - 1);
      mean += d[i];
    }
    mean /= len;
    for (let i = 0; i < len; i++) d[i] -= mean;
  }
  for (const d of [w, p, b, c]) {
    let pk = 0;
    for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
    const g = pk > 0 ? 0.95 / pk : 1;
    for (let i = 0; i < len; i++) d[i] *= g;
  }
  return { white, pink, brown, crackle };
}

function makeIR(ac: BaseAudioContext, sec: number): AudioBuffer {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * sec);
  const buf = ac.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const x = Math.random() * 2 - 1;
      const k = 0.75 - 0.6 * (t / sec); // the tail gets darker
      lp += (x - lp) * k;
      const fadeIn = Math.min(1, t / 0.012);
      d[i] = lp * Math.exp(-t * 3.4) * fadeIn;
    }
    // a few early reflections
    for (let r = 0; r < 6; r++) {
      const idx = Math.floor(sr * (0.011 + r * 0.013 + ch * 0.004 + Math.random() * 0.006));
      if (idx < len) d[idx] += (0.5 - r * 0.07) * (Math.random() < 0.5 ? -1 : 1);
    }
  }
  return buf;
}

// ============================================================================================
// Master chain
// ============================================================================================

export interface AudioChain {
  ac: BaseAudioContext;
  noise: NoiseBank;
  master: GainNode;
  comp: DynamicsCompressorNode;
  sfxVol: GainNode;
  sfxGame: GainNode; // pause gate for gameplay sfx
  sfxUi: GainNode; // ui sfx (not gated by pause)
  echo: GainNode; // sfx ping-pong echo send
  musicIn: GainNode;
  musicRev: GainNode; // music reverb send
  musicLP: BiquadFilterNode; // pause lowpass
  musicDuck: GainNode; // pause duck
  musicVol: GainNode;
  hasPanner: boolean;
}

/** Relative level of the music bus under the sfx (music must sit well under the effects). */
const MUSIC_LEVEL = 0.2;

/** Build the full master chain on any BaseAudioContext (realtime or offline). */
export function createChain(ac: BaseAudioContext, dest?: AudioNode): AudioChain {
  const G = (v: number, to: AudioNode) => {
    const g = ac.createGain();
    g.gain.value = v;
    g.connect(to);
    return g;
  };
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 0;
  comp.ratio.value = 20;
  comp.attack.value = 0.001;
  comp.release.value = 0.12;
  comp.connect(dest ?? ac.destination);
  const master = G(1, comp);

  const hasPanner = typeof ac.createStereoPanner === 'function';

  // --- sfx
  const sfxVol = G(1, master);
  const sfxGame = G(1, sfxVol);
  const sfxUi = G(1, sfxVol);

  // ping-pong echo: echo -> damp -> A -> B -> A ... (A panned left, B right)
  const echo = ac.createGain();
  const damp = ac.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2800;
  const dA = ac.createDelay(1);
  dA.delayTime.value = 0.13;
  const dB = ac.createDelay(1);
  dB.delayTime.value = 0.19;
  echo.connect(damp);
  damp.connect(dA);
  const loopLP = ac.createBiquadFilter();
  loopLP.type = 'lowpass';
  loopLP.frequency.value = 2200;
  dA.connect(G(0.4, dB));
  dB.connect(loopLP);
  loopLP.connect(G(0.4, dA));
  if (hasPanner) {
    const pl = ac.createStereoPanner();
    pl.pan.value = -0.6;
    pl.connect(sfxGame);
    const pr = ac.createStereoPanner();
    pr.pan.value = 0.6;
    pr.connect(sfxGame);
    dA.connect(pl);
    dB.connect(pr);
  } else {
    dA.connect(sfxGame);
    dB.connect(sfxGame);
  }

  // --- music
  const musicVol = G(0.7 * 0.7 * MUSIC_LEVEL, master);
  const musicDuck = G(1, musicVol);
  const musicLP = ac.createBiquadFilter();
  musicLP.type = 'lowpass';
  musicLP.frequency.value = 20000;
  musicLP.Q.value = 0.5;
  musicLP.connect(musicDuck);
  const musicIn = G(1, musicLP);
  const conv = ac.createConvolver();
  conv.buffer = makeIR(ac, 2.2);
  conv.connect(musicLP);
  const musicRev = G(1, conv);

  return {
    ac, noise: makeNoiseBank(ac), master, comp, sfxVol, sfxGame, sfxUi, echo,
    musicIn, musicRev, musicLP, musicDuck, musicVol, hasPanner,
  };
}

// ============================================================================================
// SFX voice builder
// ============================================================================================

interface ToneOpts {
  type?: OscillatorType;
  f: number; // Hz (multiplied by the voice pitch)
  f2?: number; // sweep target Hz
  sw?: number; // sweep time (default = dur)
  lin?: boolean; // linear sweep (default exponential)
  at?: number; // start offset (s)
  a?: number; // attack
  h?: number; // hold at peak
  dur: number; // total length until silent
  v: number; // peak gain
  vib?: [number, number]; // [rate Hz, depth cents]
  det?: number; // detune cents
  lp?: number; // optional lowpass cutoff
  q?: number;
  to?: AudioNode;
}
interface FmOpts extends ToneOpts {
  ratio: number;
  idx: number; // modulation index at start
  idx2?: number; // at end
}
interface NoiseOpts {
  kind?: NoiseKind;
  ft?: BiquadFilterType;
  f?: number;
  f2?: number;
  sw?: number;
  q?: number;
  at?: number;
  a?: number;
  h?: number;
  dur: number;
  v: number;
  rate?: number;
  to?: AudioNode;
}

/** Builds one sfx voice: every node created is tracked so it can be disconnected when done. */
class VB {
  readonly nodes: AudioNode[] = [];
  readonly srcs: AudioScheduledSourceNode[] = [];
  end: number;
  constructor(
    readonly ac: BaseAudioContext,
    readonly nz: NoiseBank,
    readonly out: AudioNode,
    readonly t: number,
    readonly p: number,
    readonly w: WorldId,
  ) {
    this.end = t;
  }

  gain(v: number, to: AudioNode = this.out): GainNode {
    const g = this.ac.createGain();
    g.gain.value = v;
    g.connect(to);
    this.nodes.push(g);
    return g;
  }

  filter(type: BiquadFilterType, f: number, q = 0.7, to: AudioNode = this.out): BiquadFilterNode {
    const fl = this.ac.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = fclamp(f);
    fl.Q.value = q;
    fl.connect(to);
    this.nodes.push(fl);
    return fl;
  }

  /** Soft-clip stage (tanh), with a post gain. Returns the node to feed. */
  shaper(post = 0.5, to: AudioNode = this.out): AudioNode {
    const g = this.gain(post, to);
    const ws = this.ac.createWaveShaper();
    ws.curve = SHAPER_CURVE;
    ws.connect(g);
    this.nodes.push(ws);
    return ws;
  }

  private run(src: AudioScheduledSourceNode, t0: number, t1: number) {
    src.start(t0);
    src.stop(t1);
    this.srcs.push(src);
    this.nodes.push(src);
    if (t1 > this.end) this.end = t1;
  }

  private env(g: AudioParam, t0: number, a: number, h: number, dur: number, v: number): number {
    const pk = Math.max(v, 1e-4);
    a = Math.max(a, 0.001);
    const rel = Math.max(dur - a - h, 0.005);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(pk, t0 + a);
    if (h > 0) g.setValueAtTime(pk, t0 + a + h);
    g.exponentialRampToValueAtTime(1e-3, t0 + a + h + rel);
    return t0 + a + h + rel;
  }

  private sweep(prm: AudioParam, f: number, f2: number | undefined, t0: number, sw: number, lin?: boolean) {
    prm.setValueAtTime(f, t0);
    if (f2 !== undefined && f2 !== f) {
      if (lin) prm.linearRampToValueAtTime(f2, t0 + sw);
      else prm.exponentialRampToValueAtTime(Math.max(f2, 1), t0 + Math.max(sw, 0.001));
    }
  }

  tone(o: ToneOpts): OscillatorNode {
    const ac = this.ac;
    const t0 = this.t + (o.at ?? 0);
    const osc = ac.createOscillator();
    osc.type = o.type ?? 'sine';
    const f = Math.max(o.f * this.p, 1);
    const f2 = o.f2 !== undefined ? Math.max(o.f2 * this.p, 1) : undefined;
    this.sweep(osc.frequency, f, f2, t0, o.sw ?? o.dur, o.lin);
    if (o.det) osc.detune.value = o.det;
    let dest = o.to ?? this.out;
    if (o.lp) dest = this.filter('lowpass', o.lp, o.q ?? 0.7, dest);
    const g = this.gain(0, dest);
    const tEnd = this.env(g.gain, t0, o.a ?? 0.002, o.h ?? 0, o.dur, o.v);
    osc.connect(g);
    if (o.vib) {
      const lfo = ac.createOscillator();
      lfo.frequency.value = o.vib[0];
      const lg = ac.createGain();
      lg.gain.value = o.vib[1];
      lfo.connect(lg);
      lg.connect(osc.detune);
      this.nodes.push(lg);
      this.run(lfo, t0, tEnd + 0.02);
    }
    this.run(osc, t0, tEnd + 0.02);
    return osc;
  }

  /** Two-operator FM tone (modulator tracks the carrier's sweep). */
  fm(o: FmOpts): OscillatorNode {
    const car = this.tone(o);
    const t0 = this.t + (o.at ?? 0);
    const f = Math.max(o.f * this.p, 1);
    const f2 = o.f2 !== undefined ? Math.max(o.f2 * this.p, 1) : undefined;
    const mod = this.ac.createOscillator();
    this.sweep(mod.frequency, f * o.ratio, f2 !== undefined ? f2 * o.ratio : undefined, t0, o.sw ?? o.dur, o.lin);
    const mg = this.ac.createGain();
    this.nodes.push(mg);
    const d0 = Math.max(o.idx * f * o.ratio, 0.01);
    const d1 = Math.max((o.idx2 ?? 0.05) * (f2 ?? f) * o.ratio, 0.01);
    mg.gain.setValueAtTime(d0, t0);
    mg.gain.exponentialRampToValueAtTime(d1, t0 + o.dur);
    mod.connect(mg);
    mg.connect(car.frequency);
    this.run(mod, t0, t0 + Math.max(o.dur, (o.a ?? 0) + (o.h ?? 0)) + 0.03);
    return car;
  }

  noise(o: NoiseOpts): AudioBufferSourceNode {
    const ac = this.ac;
    const t0 = this.t + (o.at ?? 0);
    const src = ac.createBufferSource();
    src.buffer = this.nz[o.kind ?? 'white'];
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = this.gain(0, o.to ?? this.out);
    let head: AudioNode = g;
    if (o.f !== undefined) {
      const fl = ac.createBiquadFilter();
      fl.type = o.ft ?? 'bandpass';
      fl.Q.value = o.q ?? 1;
      const fp = Math.sqrt(this.p);
      this.sweep(fl.frequency, fclamp(o.f * fp), o.f2 !== undefined ? fclamp(o.f2 * fp) : undefined, t0, o.sw ?? o.dur);
      fl.connect(g);
      this.nodes.push(fl);
      head = fl;
    }
    src.connect(head);
    const tEnd = this.env(g.gain, t0, o.a ?? 0.002, o.h ?? 0, o.dur, o.v);
    src.start(t0, Math.random() * 1.5);
    src.stop(tEnd + 0.02);
    this.srcs.push(src);
    this.nodes.push(src);
    if (tEnd + 0.02 > this.end) this.end = tEnd + 0.02;
    return src;
  }
}

// ============================================================================================
// SFX designs
// ============================================================================================

/** World-flavoured musical note used by jingles / pickups. */
function jn(v: VB, at: number, midi: number, dur: number, vol: number) {
  const f = mtof(midi);
  switch (v.w) {
    case 'plaza': // marimba
      v.tone({ at, f, dur: Math.max(dur + 0.15, 0.3), v: vol });
      v.tone({ at, f: f * 4, dur: 0.07, v: vol * 0.3 });
      break;
    case 'paper': // xylophone + wood knock
      v.tone({ at, f, dur: Math.max(dur, 0.22), v: vol });
      v.tone({ at, f: f * 3, dur: 0.06, v: vol * 0.3 });
      v.noise({ at, kind: 'white', ft: 'bandpass', f: Math.min(f * 2, 9000), q: 4, dur: 0.018, v: vol * 0.5 });
      break;
    case 'comic': // brass
      v.tone({ at, type: 'sawtooth', f, a: 0.015, h: dur * 0.6, dur: dur + 0.08, v: vol * 0.6, lp: Math.min(f * 5, 7000) });
      v.tone({ at, type: 'square', f, det: 7, a: 0.015, h: dur * 0.6, dur: dur + 0.08, v: vol * 0.24, lp: Math.min(f * 4, 6000) });
      break;
    case 'toy': // glockenspiel
      v.tone({ at, f, dur: dur + 0.45, v: vol * 0.85 });
      v.tone({ at, f: f * 2.76, dur: 0.2, v: vol * 0.3 });
      v.tone({ at, f: f * 5.4, dur: 0.06, v: vol * 0.12 });
      break;
    case 'neon': // FM synth
      v.fm({ at, f, a: 0.005, h: dur * 0.5, dur: dur + 0.2, v: vol * 0.7, ratio: 2, idx: 1.6, idx2: 0.3 });
      break;
  }
}

/** Little rising blips: paint droplets / bubbles / confetti tinkles. */
function drops(v: VB, n: number, t0: number, t1: number, f0: number, f1: number, vol: number) {
  for (let i = 0; i < n; i++) {
    const f = rnd(f0, f1);
    v.tone({ at: rnd(t0, t1), f, f2: f * rnd(1.2, 1.6), sw: 0.03, dur: 0.06, v: vol });
  }
}

/** Per-world accent layer on firing sounds. */
function fireAccent(v: VB, at: number, vol: number) {
  switch (v.w) {
    case 'plaza': // bubbly blip + wet
      v.tone({ at, f: 520, f2: 1250, sw: 0.035, dur: 0.06, v: 0.2 * vol });
      v.noise({ at, kind: 'brown', ft: 'lowpass', f: 1600, dur: 0.06, v: 0.3 * vol });
      break;
    case 'paper': // paper rustle
      v.noise({ at, kind: 'crackle', ft: 'bandpass', f: 3200, q: 0.9, dur: 0.08, v: 0.8 * vol });
      break;
    case 'comic': // POW body
      v.tone({ at, type: 'square', f: 240, f2: 90, dur: 0.07, v: 0.14 * vol, lp: 1400 });
      break;
    case 'toy': // plastic trigger click
      v.noise({ at, kind: 'white', ft: 'highpass', f: 3500, dur: 0.012, v: 0.35 * vol });
      v.tone({ at, f: 2700, dur: 0.02, v: 0.1 * vol });
      break;
    case 'neon': // FM shimmer
      v.fm({ at, f: 2600, f2: 900, dur: 0.08, v: 0.1 * vol, ratio: 2.01, idx: 2, idx2: 0.2 });
      break;
  }
}

const SFX: Record<SfxName, (v: VB) => void> = {
  // ------------------------------------------------------------------ weapons
  blaster(v) {
    switch (v.w) {
      case 'toy': // foam-dart "fwip"
        v.noise({ kind: 'white', ft: 'bandpass', f: 600, f2: 2200, q: 1.4, a: 0.004, dur: 0.1, v: 1.4 });
        v.tone({ type: 'triangle', f: 1000, f2: 520, dur: 0.07, v: 0.22 });
        v.tone({ f: 180, f2: 90, dur: 0.07, v: 0.5 });
        break;
      case 'neon': // laser
        v.fm({ f: 2200, f2: 480, sw: 0.1, dur: 0.13, v: 0.28, ratio: 0.5, idx: 1.8, idx2: 0.3 });
        v.tone({ type: 'sawtooth', f: 1400, f2: 350, dur: 0.1, v: 0.07, lp: 3500 });
        v.tone({ f: 260, f2: 110, dur: 0.06, v: 0.32 });
        break;
      case 'comic': // retro ZAP-pew
        v.tone({ type: 'square', f: 1750, f2: 300, sw: 0.1, dur: 0.11, v: 0.15, lp: 3800 });
        v.tone({ f: 420, f2: 120, dur: 0.07, v: 0.42 });
        break;
      case 'paper': // softer, papery
        v.tone({ type: 'triangle', f: 1150, f2: 360, dur: 0.1, v: 0.4, lp: 2600 });
        v.tone({ f: 300, f2: 120, dur: 0.06, v: 0.3 });
        break;
      default: // plaza: bright bubbly pew
        v.tone({ type: 'triangle', f: 1550, f2: 430, dur: 0.11, v: 0.38 });
        v.tone({ f: 780, f2: 260, dur: 0.08, v: 0.28 });
        v.tone({ f: 250, f2: 110, dur: 0.05, v: 0.28 });
    }
    v.noise({ kind: 'white', ft: 'highpass', f: 2500, dur: 0.018, v: 0.12 });
    fireAccent(v, 0, 1);
  },

  scatter(v) {
    const w = v.w;
    v.tone({ f: 170, f2: 45, sw: 0.14, dur: 0.2, v: 0.7 }); // thump
    if (w === 'toy') {
      for (let i = 0; i < 3; i++) {
        v.noise({ at: i * 0.022, kind: 'white', ft: 'bandpass', f: 650 + i * 250, f2: 2400 + i * 300, q: 1.3, a: 0.003, dur: 0.08, v: 0.7 });
      }
      v.noise({ kind: 'white', ft: 'highpass', f: 3000, dur: 0.015, v: 0.35 });
    } else {
      v.noise({
        kind: w === 'paper' ? 'pink' : 'white', ft: 'lowpass', f: w === 'comic' ? 9000 : 6500, f2: 500, sw: 0.2,
        q: 0.8, dur: 0.26, v: w === 'paper' ? 0.75 : 0.55,
      });
      v.tone({ type: 'square', f: w === 'comic' ? 950 : 750, f2: 140, sw: 0.06, dur: 0.07, v: w === 'comic' ? 0.18 : 0.12, lp: 2600 });
    }
    if (w === 'plaza') v.noise({ kind: 'brown', ft: 'lowpass', f: 1400, f2: 300, at: 0.01, dur: 0.18, v: 0.55 });
    if (w === 'paper') v.noise({ kind: 'crackle', ft: 'bandpass', f: 2600, q: 0.8, dur: 0.22, v: 0.9 });
    if (w === 'comic') v.tone({ type: 'square', f: 280, f2: 70, dur: 0.14, v: 0.35, to: v.shaper(0.35) });
    if (w === 'neon') v.fm({ f: 900, f2: 110, dur: 0.22, v: 0.22, ratio: 1.41, idx: 5, idx2: 0.1 });
    // cartoon pump: "chk-chk"
    const pa = 0.26;
    const hi = w === 'toy' ? 1.4 : 1;
    v.noise({ at: pa, kind: 'white', ft: 'bandpass', f: 2200 * hi, q: 2, dur: 0.03, v: 0.28 });
    v.tone({ at: pa, type: 'triangle', f: 650 * hi, f2: 420 * hi, dur: 0.035, v: 0.1 });
    v.noise({ at: pa + 0.07, kind: 'white', ft: 'bandpass', f: 3000 * hi, q: 2, dur: 0.03, v: 0.28 });
    v.tone({ at: pa + 0.07, type: 'triangle', f: 900 * hi, f2: 600 * hi, dur: 0.035, v: 0.1 });
  },

  boomer(v) {
    v.tone({ f: 125, f2: 38, sw: 0.2, a: 0.004, dur: 0.28, v: 0.75 }); // thoomp
    v.tone({ type: 'triangle', f: 330, f2: 110, sw: 0.08, dur: 0.1, v: 0.28 }); // tube pop
    v.noise({ kind: 'pink', ft: 'bandpass', f: 450, f2: 2600, sw: 0.38, q: 1.6, a: 0.07, dur: 0.44, v: 0.9 }); // whoosh
    switch (v.w) {
      case 'plaza':
        v.tone({ at: 0.01, f: 180, f2: 620, sw: 0.09, dur: 0.12, v: 0.22 });
        break;
      case 'paper':
        v.noise({ kind: 'crackle', ft: 'bandpass', f: 2200, q: 0.8, dur: 0.3, v: 0.8 });
        break;
      case 'comic':
        v.tone({ type: 'square', f: 200, f2: 55, dur: 0.16, v: 0.3, to: v.shaper(0.35) });
        break;
      case 'toy': // cork "plunk" + spring
        v.tone({ f: 950, f2: 260, sw: 0.04, dur: 0.07, v: 0.32 });
        v.tone({ at: 0.03, type: 'triangle', f: 420, f2: 300, vib: [22, 90], dur: 0.25, v: 0.1 });
        break;
      case 'neon':
        v.tone({ type: 'sawtooth', f: 900, f2: 60, dur: 0.35, v: 0.12, lp: 2200 });
        break;
    }
  },

  zapper(v) {
    v.noise({ kind: 'white', ft: 'highpass', f: 3000, dur: 0.035, v: 0.32 }); // crack
    v.tone({ f: 240, f2: 55, sw: 0.18, dur: 0.22, v: 0.5 }); // sub kick
    switch (v.w) {
      case 'comic': // retro ray-gun "pew-ew-ew"
        v.tone({ type: 'square', f: 2600, f2: 160, sw: 0.32, dur: 0.38, v: 0.12, vib: [38, 260], lp: 4200 });
        break;
      case 'toy': // spring twang + pop
        v.tone({ type: 'triangle', f: 700, f2: 180, sw: 0.3, dur: 0.36, v: 0.28, vib: [17, 140] });
        v.tone({ f: 1200, f2: 350, sw: 0.03, dur: 0.05, v: 0.28 });
        break;
      case 'neon':
        v.fm({ f: 3200, f2: 140, sw: 0.3, dur: 0.38, v: 0.22, ratio: 1.5, idx: 3.5, idx2: 0.2 });
        v.tone({ type: 'sawtooth', f: 1600, f2: 120, sw: 0.3, dur: 0.34, v: 0.06, lp: 3000 });
        break;
      case 'paper':
        v.tone({ type: 'triangle', f: 2000, f2: 200, sw: 0.28, dur: 0.33, v: 0.28, vib: [30, 120], lp: 3000 });
        v.noise({ kind: 'crackle', ft: 'highpass', f: 1800, dur: 0.12, v: 0.8 });
        break;
      default: // plaza
        v.tone({ type: 'sawtooth', f: 2400, f2: 180, sw: 0.3, dur: 0.36, v: 0.11, vib: [30, 120], lp: 4500 });
        v.tone({ f: 1800, f2: 300, sw: 0.25, dur: 0.3, v: 0.18 });
        drops(v, 3, 0.05, 0.2, 700, 1400, 0.05);
    }
  },

  // ------------------------------------------------------------------ throwables & impacts
  grenade_throw(v) {
    v.noise({ kind: 'pink', ft: 'bandpass', f: 500, f2: 1700, sw: 0.18, q: 1.8, a: 0.05, dur: 0.24, v: 0.6 });
    v.tone({ f: 3300, dur: 0.07, v: 0.08 });
    v.tone({ f: 4950, dur: 0.04, v: 0.04 });
    if (v.w === 'toy') v.noise({ kind: 'white', ft: 'bandpass', f: 2500, q: 4, dur: 0.03, v: 0.5 });
    if (v.w === 'paper') v.noise({ kind: 'crackle', ft: 'bandpass', f: 2800, dur: 0.18, v: 0.6 });
    if (v.w === 'neon') v.tone({ f: 600, f2: 1800, sw: 0.15, dur: 0.18, v: 0.06 });
  },

  explosion(v) {
    const sh = v.shaper(0.5);
    v.tone({ f: 92, f2: 30, sw: 0.55, a: 0.004, dur: 0.95, v: 0.85 }); // sub boom
    v.noise({ kind: 'brown', ft: 'lowpass', f: 2400, f2: 150, sw: 0.9, q: 0.8, a: 0.004, dur: 1.25, v: 1.6, to: sh }); // rumble
    v.noise({ kind: 'white', ft: 'bandpass', f: 1500, q: 0.6, dur: 0.16, v: 0.45 }); // crack
    v.noise({ kind: 'pink', ft: 'lowpass', f: 1100, f2: 280, at: 0.05, a: 0.05, dur: 0.9, v: 0.35 }); // poof tail
    switch (v.w) {
      case 'plaza': // big paint splatter
        v.noise({ kind: 'brown', ft: 'lowpass', f: 1300, f2: 400, at: 0.02, dur: 0.4, v: 0.8 });
        drops(v, 6, 0.12, 0.6, 700, 1900, 0.05);
        break;
      case 'paper': // crumple
        v.noise({ kind: 'crackle', ft: 'bandpass', f: 2200, f2: 900, q: 0.7, dur: 0.8, v: 1.1 });
        break;
      case 'comic': // KA-POW
        v.tone({ type: 'square', f: 160, f2: 38, sw: 0.3, dur: 0.35, v: 0.4, to: sh });
        v.noise({ kind: 'white', ft: 'highpass', f: 2500, dur: 0.06, v: 0.3 });
        break;
      case 'toy': // pop + confetti
        v.tone({ f: 620, f2: 140, sw: 0.05, dur: 0.08, v: 0.32 });
        drops(v, 8, 0.1, 0.7, 2200, 4800, 0.04);
        break;
      case 'neon':
        v.tone({ type: 'sawtooth', f: 700, f2: 40, sw: 0.8, dur: 0.9, v: 0.12, lp: 1800 });
        v.fm({ f: 1800, f2: 90, sw: 0.4, dur: 0.45, v: 0.1, ratio: 1.5, idx: 4, idx2: 0.1 });
        break;
    }
  },

  bounce(v) {
    switch (v.w) {
      case 'toy': // plastic clack
        v.noise({ kind: 'white', ft: 'bandpass', f: 2200, q: 4, dur: 0.045, v: 1.2 });
        v.tone({ f: 1400, f2: 1100, dur: 0.06, v: 0.28 });
        v.tone({ f: 260, f2: 160, dur: 0.05, v: 0.2 });
        break;
      case 'paper': // cardboard tap
        v.tone({ f: 220, f2: 140, dur: 0.08, v: 0.4 });
        v.noise({ kind: 'crackle', ft: 'bandpass', f: 1800, dur: 0.06, v: 0.7 });
        break;
      case 'neon': // metal ping
        v.tone({ f: 1250, dur: 0.18, v: 0.13 });
        v.tone({ f: 1870, dur: 0.12, v: 0.07 });
        v.tone({ f: 200, f2: 120, dur: 0.06, v: 0.3 });
        break;
      default: // cartoon "boink"
        v.tone({ type: v.w === 'comic' ? 'square' : 'triangle', f: 260, f2: 480, sw: 0.05, dur: 0.14, v: v.w === 'comic' ? 0.12 : 0.32, lp: 2500 });
        v.tone({ f: 130, f2: 90, dur: 0.05, v: 0.25 });
    }
  },

  whoosh(v) {
    v.noise({ kind: 'pink', ft: 'bandpass', f: 350, f2: 1900, sw: 0.25, q: 1.5, a: 0.1, dur: 0.32, v: 0.8 });
    if (v.w === 'paper') v.noise({ kind: 'crackle', ft: 'bandpass', f: 2500, q: 0.8, a: 0.08, dur: 0.28, v: 0.3 });
    if (v.w === 'neon') v.tone({ type: 'sawtooth', f: 200, f2: 900, sw: 0.25, a: 0.08, dur: 0.3, v: 0.04, lp: 2000 });
    if (v.w === 'toy') v.noise({ kind: 'white', ft: 'bandpass', f: 900, f2: 3000, q: 2, a: 0.06, dur: 0.15, v: 0.3 });
  },

  splat(v) {
    v.noise({ kind: 'brown', ft: 'lowpass', f: 2200, f2: 260, sw: 0.18, q: 1.2, a: 0.003, dur: 0.26, v: 1.0 });
    v.tone({ f: 430, f2: 110, sw: 0.1, dur: 0.12, v: 0.33 });
    drops(v, 3, 0.04, 0.16, 900, 1700, 0.06);
    if (v.w === 'paper') v.noise({ kind: 'crackle', ft: 'bandpass', f: 1800, dur: 0.15, v: 0.7 });
    if (v.w === 'comic') v.tone({ type: 'square', f: 300, f2: 90, dur: 0.1, v: 0.12, lp: 1500 });
    if (v.w === 'toy') v.tone({ f: 700, f2: 250, sw: 0.06, dur: 0.08, v: 0.2 });
  },

  // ------------------------------------------------------------------ combat feedback
  hit(v) {
    switch (v.w) {
      case 'plaza':
        v.tone({ f: 1500, f2: 2300, sw: 0.03, dur: 0.05, v: 0.42 });
        break;
      case 'paper':
        v.tone({ f: 1700, dur: 0.045, v: 0.4 });
        v.noise({ kind: 'crackle', ft: 'bandpass', f: 3000, dur: 0.035, v: 0.7 });
        break;
      case 'comic':
        v.tone({ type: 'square', f: 1600, dur: 0.05, v: 0.28, lp: 5000 });
        v.tone({ f: 3200, dur: 0.03, v: 0.24 });
        break;
      case 'toy':
        v.noise({ kind: 'white', ft: 'bandpass', f: 3000, q: 3, dur: 0.02, v: 0.8 });
        v.tone({ f: 2400, dur: 0.045, v: 0.32 });
        break;
      case 'neon':
        v.fm({ f: 2000, dur: 0.05, v: 0.34, ratio: 3, idx: 1.2, idx2: 0.1 });
        break;
    }
    v.tone({ type: 'triangle', f: 3800, dur: 0.018, v: 0.07 });
  },

  headshot(v) {
    const k = v.w === 'toy' ? 1.35 : v.w === 'paper' ? 0.85 : 1;
    v.tone({ type: v.w === 'comic' ? 'square' : 'triangle', f: 640 * k, f2: 250 * k, sw: 0.05, dur: 0.3, v: v.w === 'comic' ? 0.22 : 0.45, lp: 3000 }); // BONK
    v.noise({ kind: 'pink', ft: 'bandpass', f: 430 * k, q: 14, dur: 0.2, v: 2.2 }); // hollow resonance
    v.tone({ f: 1300 * k, f2: 600 * k, dur: 0.025, v: 0.28 }); // knock
    v.tone({ at: 0.04, f: 2637, dur: 0.3, v: 0.09 }); // sparkle ding
    v.tone({ at: 0.04, f: 3951, dur: 0.18, v: 0.045 });
    if (v.w === 'paper') v.noise({ kind: 'crackle', ft: 'bandpass', f: 2000, dur: 0.08, v: 0.6 });
    if (v.w === 'neon') v.fm({ f: 500, f2: 200, dur: 0.2, v: 0.15, ratio: 1.4, idx: 3, idx2: 0.2 });
  },

  kill(v) {
    v.tone({ f: 320, f2: 1150, sw: 0.035, dur: 0.06, v: 0.38 }); // pop
    jn(v, 0.035, 88, 0.4, 0.26); // ding
    jn(v, 0.035, 95, 0.3, 0.13);
    v.tone({ at: 0.035, f: 2637, dur: 0.35, v: 0.06 });
  },

  hurt(v) {
    v.tone({ f: 190, f2: 70, sw: 0.12, dur: 0.18, v: 0.55 });
    v.noise({ kind: 'brown', ft: 'lowpass', f: 900, dur: 0.14, v: 0.9 });
    v.tone({ type: 'square', f: 260, f2: 150, sw: 0.1, dur: 0.13, v: 0.09, lp: 900 });
    if (v.w === 'paper') v.noise({ kind: 'crackle', ft: 'bandpass', f: 1500, dur: 0.12, v: 0.7 });
    if (v.w === 'toy') v.tone({ f: 900, f2: 600, vib: [30, 60], dur: 0.12, v: 0.07 });
    if (v.w === 'neon') v.fm({ f: 180, f2: 90, dur: 0.15, v: 0.12, ratio: 3.5, idx: 4, idx2: 0.5 });
    if (v.w === 'comic') v.tone({ type: 'square', f: 150, f2: 80, dur: 0.12, v: 0.1, to: v.shaper(0.3) });
  },

  death(v) {
    // slide whistle down
    const wt: OscillatorType = v.w === 'neon' ? 'triangle' : 'sine';
    v.tone({ type: wt, f: 1750, f2: 260, sw: 0.72, a: 0.02, h: 0.55, dur: 0.78, v: 0.2, vib: [6.5, 40] });
    v.noise({ kind: 'white', ft: 'bandpass', f: 1750, f2: 260, sw: 0.72, q: 6, a: 0.02, h: 0.5, dur: 0.75, v: 0.14 });
    // poof
    v.noise({ at: 0.72, kind: 'pink', ft: 'lowpass', f: 1600, f2: 350, sw: 0.35, a: 0.015, dur: 0.45, v: 0.6 });
    v.tone({ at: 0.72, f: 200, f2: 60, dur: 0.22, v: 0.28 });
    if (v.w === 'plaza') v.noise({ at: 0.72, kind: 'brown', ft: 'lowpass', f: 1200, dur: 0.2, v: 0.5 });
    if (v.w === 'paper') v.noise({ at: 0.72, kind: 'crackle', ft: 'bandpass', f: 2000, dur: 0.35, v: 0.8 });
    if (v.w === 'toy') drops(v, 5, 0.75, 1.0, 2500, 4500, 0.04);
  },

  // ------------------------------------------------------------------ movement
  jump(v) {
    const k = v.w === 'toy' ? 1.6 : 1;
    v.tone({ f: 170, f2: 520, sw: 0.13, a: 0.004, dur: 0.2, v: 0.3, vib: [14 * k, 45 * k] });
    v.tone({ type: 'triangle', f: 340, f2: 1040, sw: 0.13, dur: 0.12, v: 0.05 });
    if (v.w === 'paper') v.noise({ kind: 'crackle', ft: 'bandpass', f: 2500, dur: 0.06, v: 0.5 });
    if (v.w === 'neon') v.fm({ f: 400, f2: 1200, dur: 0.12, v: 0.06, ratio: 2, idx: 1 });
  },

  double_jump(v) {
    v.tone({ f: 330, f2: 980, sw: 0.17, dur: 0.26, v: 0.26, vib: [24, 80] });
    v.tone({ at: 0.06, f: 2200, f2: 3300, sw: 0.08, dur: 0.1, v: 0.06 });
    v.noise({ kind: 'pink', ft: 'bandpass', f: 800, f2: 2500, q: 1.5, a: 0.03, dur: 0.18, v: 0.35 });
  },

  land(v) {
    v.tone({ f: 115, f2: 48, sw: 0.08, dur: 0.12, v: 0.48 });
    v.noise({ kind: 'brown', ft: 'lowpass', f: 700, dur: 0.09, v: 0.8 });
    switch (v.w) {
      case 'plaza':
        v.tone({ f: 300, f2: 180, dur: 0.06, v: 0.1 });
        break;
      case 'paper':
        v.noise({ kind: 'crackle', ft: 'bandpass', f: 1800, dur: 0.08, v: 0.6 });
        break;
      case 'toy':
        v.noise({ kind: 'white', ft: 'bandpass', f: 1800, q: 4, dur: 0.03, v: 0.5 });
        break;
      case 'neon':
        v.tone({ f: 700, dur: 0.15, v: 0.05 });
        v.tone({ f: 1050, dur: 0.1, v: 0.03 });
        break;
      case 'comic':
        v.tone({ type: 'square', f: 140, f2: 70, dur: 0.06, v: 0.08, lp: 800 });
        break;
    }
  },

  footstep(v) {
    switch (v.w) {
      case 'plaza': // squishy
        v.noise({ kind: 'brown', ft: 'lowpass', f: 1200, dur: 0.06, v: 0.55 });
        v.tone({ f: 300, f2: 420, dur: 0.04, v: 0.07 });
        break;
      case 'paper':
        v.noise({ kind: 'crackle', ft: 'bandpass', f: 2600, q: 0.9, dur: 0.06, v: 0.6 });
        v.tone({ f: 160, f2: 90, dur: 0.04, v: 0.2 });
        break;
      case 'comic':
        v.tone({ type: 'triangle', f: 520, f2: 300, dur: 0.045, v: 0.22 });
        v.noise({ kind: 'pink', ft: 'bandpass', f: 1500, q: 1.2, dur: 0.04, v: 0.55 });
        break;
      case 'toy': // plastic clack
        v.noise({ kind: 'white', ft: 'bandpass', f: 1900, q: 4, dur: 0.03, v: 0.9 });
        v.tone({ f: 900, f2: 760, dur: 0.035, v: 0.18 });
        break;
      case 'neon': // metal roof tap
        v.tone({ f: 1100, dur: 0.07, v: 0.09 });
        v.tone({ f: 1720, dur: 0.05, v: 0.05 });
        v.tone({ f: 140, f2: 90, dur: 0.04, v: 0.15 });
        v.noise({ kind: 'pink', ft: 'bandpass', f: 1300, q: 1.2, dur: 0.04, v: 0.6 });
        break;
    }
  },

  jumppad(v) {
    v.tone({ f: 110, f2: 55, dur: 0.1, v: 0.3 }); // launch thump
    v.tone({ f: 140, f2: 640, sw: 0.24, h: 0.1, dur: 0.6, v: 0.22, vib: [16, 110] }); // BOIIING
    v.tone({ type: 'sawtooth', f: 75, f2: 150, sw: 0.3, dur: 0.4, v: 0.07, lp: 900 }); // spring buzz
    v.noise({ kind: 'pink', ft: 'bandpass', f: 500, f2: 2600, sw: 0.4, q: 1.4, a: 0.08, dur: 0.5, v: 0.4 });
    if (v.w === 'neon') v.fm({ f: 300, f2: 1500, sw: 0.4, dur: 0.45, v: 0.07, ratio: 2, idx: 2 });
  },

  // ------------------------------------------------------------------ weapon handling
  reload(v) {
    const hq = v.w === 'toy' ? 5 : 2.5;
    v.noise({ kind: 'white', ft: 'bandpass', f: 2800, q: hq, dur: 0.025, v: 0.5 });
    v.tone({ f: 1300, f2: 1000, dur: 0.03, v: 0.09 });
    v.noise({ at: 0.07, kind: v.w === 'paper' ? 'crackle' : 'pink', ft: 'bandpass', f: 1100, f2: 2600, sw: 0.1, q: 2, a: 0.03, dur: 0.12, v: 0.45 });
    v.noise({ at: 0.22, kind: 'white', ft: 'bandpass', f: 2000, q: hq, dur: 0.03, v: 0.55 });
    v.tone({ at: 0.22, f: 800, f2: 520, dur: 0.05, v: 0.18 });
    if (v.w === 'neon') v.tone({ f: 500, f2: 1800, sw: 0.2, dur: 0.25, v: 0.06 });
    if (v.w === 'plaza') v.tone({ at: 0.12, f: 600, f2: 1200, sw: 0.03, dur: 0.05, v: 0.06 });
  },

  reload_done(v) {
    v.noise({ kind: 'white', ft: 'bandpass', f: 2400, q: 2, dur: 0.025, v: 0.5 });
    v.tone({ at: 0.02, f: 320, f2: 150, sw: 0.05, dur: 0.07, v: 0.33 });
    v.tone({ at: 0.05, f: 1760, dur: 0.14, v: 0.07 });
    v.tone({ at: 0.05, f: 2640, dur: 0.08, v: 0.035 });
  },

  empty(v) {
    v.noise({ kind: 'white', ft: 'bandpass', f: 3000, q: 1.5, dur: 0.015, v: 0.45 });
    v.tone({ f: 1250, f2: 900, dur: 0.035, v: 0.12 });
    if (v.w === 'toy') v.noise({ kind: 'white', ft: 'bandpass', f: 2200, q: 5, dur: 0.02, v: 0.4 });
  },

  switch(v) {
    v.noise({ kind: 'pink', ft: 'bandpass', f: 700, f2: 2300, sw: 0.1, q: 1.6, a: 0.03, dur: 0.13, v: 0.45 });
    v.noise({ at: 0.11, kind: 'white', ft: 'bandpass', f: 2600, q: 2.5, dur: 0.02, v: 0.4 });
    v.tone({ at: 0.11, f: 1000, f2: 800, dur: 0.03, v: 0.09 });
  },

  // ------------------------------------------------------------------ pickups
  pickup_health(v) {
    v.tone({ f: 400, f2: 900, sw: 0.06, dur: 0.08, v: 0.1 });
    [72, 76, 79, 84].forEach((m, i) => jn(v, i * 0.055, m, i === 3 ? 0.25 : 0.1, 0.2));
  },

  pickup_ammo(v) {
    v.noise({ kind: 'white', ft: 'bandpass', f: 3000, q: 6, dur: 0.03, v: 0.5 });
    v.tone({ f: 2200, dur: 0.06, v: 0.1 });
    v.tone({ f: 3300, dur: 0.04, v: 0.05 });
    v.noise({ at: 0.07, kind: 'white', ft: 'bandpass', f: 3600, q: 6, dur: 0.03, v: 0.5 });
    v.tone({ at: 0.07, f: 2600, dur: 0.06, v: 0.1 });
    jn(v, 0.1, 79, 0.1, 0.13);
  },

  pickup_weapon(v) {
    v.noise({ kind: 'white', ft: 'bandpass', f: 2400, q: 3, dur: 0.03, v: 0.45 });
    v.tone({ at: 0.02, f: 300, f2: 160, dur: 0.06, v: 0.25 });
    jn(v, 0.06, 79, 0.1, 0.2);
    jn(v, 0.15, 84, 0.3, 0.22);
    jn(v, 0.15, 88, 0.25, 0.11);
  },

  pickup_power(v) {
    v.tone({ type: 'square', f: 300, f2: 1200, sw: 0.45, dur: 0.5, v: 0.07, lp: 3000, vib: [14, 60] });
    [72, 79, 84, 91].forEach((m, i) => jn(v, 0.15 + i * 0.08, m, 0.15, 0.17));
    v.noise({ kind: 'white', ft: 'highpass', f: 6000, a: 0.1, dur: 0.6, v: 0.04 });
  },

  // ------------------------------------------------------------------ objectives
  flag_taken(v) {
    v.noise({ kind: 'pink', ft: 'bandpass', f: 500, f2: 2200, q: 1.5, a: 0.05, dur: 0.2, v: 0.3 });
    jn(v, 0, 76, 0.1, 0.26);
    jn(v, 0.1, 79, 0.1, 0.26);
    jn(v, 0.2, 84, 0.4, 0.3);
    jn(v, 0.2, 79, 0.35, 0.12);
  },

  flag_captured(v) {
    jn(v, 0, 72, 0.08, 0.24);
    jn(v, 0.1, 76, 0.08, 0.24);
    jn(v, 0.2, 79, 0.08, 0.24);
    jn(v, 0.3, 84, 0.7, 0.3);
    jn(v, 0.3, 76, 0.6, 0.13);
    jn(v, 0.3, 79, 0.6, 0.13);
    v.tone({ at: 0.3, type: 'triangle', f: mtof(48), a: 0.01, h: 0.3, dur: 0.8, v: 0.25 });
    v.noise({ at: 0.3, kind: 'white', ft: 'highpass', f: 7000, dur: 0.9, v: 0.05 });
  },

  flag_returned(v) {
    v.noise({ kind: 'pink', ft: 'bandpass', f: 400, f2: 2400, sw: 0.18, q: 1.5, a: 0.08, dur: 0.22, v: 0.4 });
    jn(v, 0.12, 79, 0.1, 0.24);
    jn(v, 0.22, 84, 0.35, 0.26);
  },

  flag_dropped(v) {
    jn(v, 0, 76, 0.12, 0.26);
    jn(v, 0.15, 72, 0.12, 0.24);
    jn(v, 0.3, 67, 0.3, 0.26);
    v.tone({ at: 0.3, f: 150, f2: 70, dur: 0.15, v: 0.3 });
  },

  zone_capture(v) {
    [67, 72, 76, 79, 84].forEach((m, i) => jn(v, i * 0.07, m, i === 4 ? 0.4 : 0.12, 0.2));
    jn(v, 0.28, 76, 0.4, 0.1);
    v.noise({ at: 0.1, kind: 'white', ft: 'highpass', f: 6500, a: 0.1, dur: 0.6, v: 0.035 });
  },

  zone_contested(v) {
    for (let i = 0; i < 3; i++) {
      v.tone({ at: i * 0.15, type: 'square', f: i % 2 ? 622 : 740, a: 0.004, h: 0.06, dur: 0.1, v: 0.1, lp: 3000 });
    }
  },

  // ------------------------------------------------------------------ match flow
  countdown(v) {
    v.tone({ f: 880, a: 0.003, h: 0.08, dur: 0.16, v: 0.18 });
    v.tone({ type: 'triangle', f: 1760, dur: 0.08, v: 0.05 });
  },

  go(v) {
    v.tone({ f: 1320, a: 0.004, h: 0.2, dur: 0.42, v: 0.15 });
    v.tone({ f: 1760, a: 0.004, h: 0.2, dur: 0.42, v: 0.1 });
    v.tone({ type: 'triangle', f: 880, a: 0.004, h: 0.2, dur: 0.42, v: 0.1 });
    v.noise({ kind: 'pink', ft: 'bandpass', f: 400, f2: 2500, q: 1.3, a: 0.08, dur: 0.35, v: 0.25 });
  },

  victory(v) {
    const seq: [number, number, number][] = [
      [0, 67, 0.1], [0.13, 72, 0.1], [0.26, 76, 0.1], [0.39, 79, 0.3], [0.78, 76, 0.12], [0.93, 79, 0.9],
    ];
    for (const [at, m, d] of seq) jn(v, at, m, d, 0.26);
    jn(v, 0.93, 72, 0.9, 0.12);
    jn(v, 0.93, 76, 0.9, 0.12);
    jn(v, 0.93, 84, 0.9, 0.14);
    v.tone({ at: 0.39, type: 'triangle', f: mtof(43), a: 0.01, h: 0.25, dur: 0.38, v: 0.22 });
    v.tone({ at: 0.93, type: 'triangle', f: mtof(48), a: 0.01, h: 0.6, dur: 1.3, v: 0.26 });
    v.noise({ at: 0.93, kind: 'white', ft: 'highpass', f: 7000, dur: 1.2, v: 0.045 });
    drops(v, 6, 1.0, 1.6, 2500, 5000, 0.03);
  },

  defeat(v) {
    // sad trombone: wah wah wah waaaah
    const notes = [67, 66, 65, 64];
    notes.forEach((m, i) => {
      const at = i * 0.42;
      const last = i === 3;
      const d = last ? 1.0 : 0.36;
      const lp = v.filter('lowpass', 500, 3);
      lp.frequency.setValueAtTime(400, v.t + at);
      lp.frequency.linearRampToValueAtTime(1500, v.t + at + 0.12);
      lp.frequency.linearRampToValueAtTime(600, v.t + at + d);
      v.tone({ at, type: 'sawtooth', f: mtof(m), a: 0.03, h: d - 0.1, dur: d + 0.08, v: 0.22, to: lp, vib: last ? [5.5, 45] : undefined });
      v.tone({ at, type: 'sine', f: mtof(m - 12), a: 0.03, h: d - 0.1, dur: d + 0.08, v: 0.12 });
    });
  },

  multikill(v) {
    [72, 76, 79, 84, 88].forEach((m, i) => jn(v, i * 0.05, m, 0.12, 0.18));
    jn(v, 0.25, 91, 0.4, 0.22);
    jn(v, 0.25, 84, 0.4, 0.1);
    v.noise({ at: 0.2, kind: 'white', ft: 'highpass', f: 6500, a: 0.02, dur: 0.5, v: 0.045 });
  },

  respawn(v) {
    v.tone({ f: 400, f2: 1600, sw: 0.45, a: 0.05, dur: 0.5, v: 0.14, vib: [9, 30] });
    const pent = [79, 81, 84, 86, 88, 91];
    for (let i = 0; i < 5; i++) jn(v, 0.1 + i * 0.08, pent[Math.floor(Math.random() * pent.length)], 0.1, 0.12);
    v.noise({ kind: 'white', ft: 'highpass', f: 5000, a: 0.2, dur: 0.6, v: 0.03 });
  },

  // ------------------------------------------------------------------ UI
  ui_click(v) {
    v.tone({ f: 1150, f2: 1350, sw: 0.02, dur: 0.045, v: 0.22 });
    v.tone({ type: 'triangle', f: 2300, dur: 0.02, v: 0.04 });
  },
  ui_hover(v) {
    v.tone({ f: 1900, dur: 0.03, v: 0.07 });
  },
  ui_back(v) {
    v.tone({ f: 900, f2: 700, dur: 0.06, v: 0.12 });
    v.tone({ at: 0.055, f: 600, dur: 0.07, v: 0.1 });
  },
};

interface Meta {
  pri: number; // voice-steal priority (higher = more important)
  max: number; // max simultaneous voices of this sound
  gap?: number; // min seconds between two starts (per name, per 2D/3D)
  pv?: number; // random pitch variation (+/-)
  ui?: boolean; // UI bus: never spatial, not silenced by pause
  vol?: number; // level trim
  range?: number; // distance multiplier (big sounds carry further)
  echo?: number; // echo-send multiplier
}

const WEAPON: Meta = { pri: 3, max: 8, pv: 0.05, echo: 0.6 };
const JINGLE: Meta = { pri: 8, max: 2, gap: 0.12, pv: 0, echo: 0.5 };
const META: Record<SfxName, Meta> = {
  blaster: { ...WEAPON, vol: 1.7 },
  scatter: { ...WEAPON, max: 6, pv: 0.04 },
  boomer: { ...WEAPON, max: 4, pv: 0.04, range: 1.3, vol: 0.87 },
  zapper: { ...WEAPON, max: 4, pv: 0.03, range: 1.4 },
  grenade_throw: { pri: 2, max: 3, vol: 1.8 },
  explosion: { pri: 5, max: 4, pv: 0.08, range: 2, echo: 1.2 },
  bounce: { pri: 1, max: 3, pv: 0.12 },
  whoosh: { pri: 1, max: 4, pv: 0.1 },
  splat: { pri: 2, max: 4, pv: 0.1, vol: 0.8 },
  hit: { pri: 6, max: 3, gap: 0.04, pv: 0.03, echo: 0.3, vol: 1.85 },
  headshot: { pri: 7, max: 2, gap: 0.05, pv: 0.03, echo: 0.5, vol: 1.12 },
  kill: { pri: 8, max: 2, gap: 0.06, pv: 0, echo: 0.5, vol: 0.75 },
  hurt: { pri: 7, max: 2, gap: 0.07, pv: 0.06, echo: 0.2 },
  death: { pri: 7, max: 3, pv: 0.05, vol: 0.9 },
  jump: { pri: 2, max: 3, pv: 0.05, echo: 0.3, vol: 0.55 },
  double_jump: { pri: 2, max: 3, pv: 0.04, echo: 0.3, vol: 0.6 },
  land: { pri: 1, max: 3, pv: 0.1, echo: 0.2, vol: 0.62 },
  footstep: { pri: 0, max: 4, gap: 0.06, pv: 0.15, vol: 1.1, echo: 0.1 },
  jumppad: { pri: 3, max: 3, pv: 0.04, vol: 0.55 },
  reload: { pri: 5, max: 2, pv: 0.03, echo: 0.2 },
  reload_done: { pri: 5, max: 2, pv: 0.03, echo: 0.2, vol: 0.75 },
  empty: { pri: 4, max: 2, gap: 0.08, pv: 0.05, echo: 0.1, vol: 2 },
  switch: { pri: 5, max: 2, pv: 0.04, echo: 0.2, vol: 1.6 },
  pickup_health: { pri: 6, max: 2, pv: 0, vol: 0.85 },
  pickup_ammo: { pri: 6, max: 2, pv: 0.02, vol: 1.4 },
  pickup_weapon: { pri: 6, max: 2, pv: 0, vol: 0.8 },
  pickup_power: { pri: 6, max: 2, pv: 0, vol: 0.9 },
  flag_taken: JINGLE,
  flag_captured: JINGLE,
  flag_returned: JINGLE,
  flag_dropped: JINGLE,
  zone_capture: JINGLE,
  zone_contested: { ...JINGLE, gap: 0.3, vol: 1.05 },
  countdown: { ...JINGLE, gap: 0.2 },
  go: JINGLE,
  victory: { ...JINGLE, pri: 9 },
  defeat: { ...JINGLE, pri: 9, vol: 1.25 },
  multikill: { ...JINGLE, vol: 1.15 },
  respawn: { ...JINGLE, pri: 6, vol: 1.25 },
  ui_click: { pri: 9, max: 4, gap: 0.03, pv: 0.02, ui: true, vol: 1.5 },
  ui_hover: { pri: 9, max: 3, gap: 0.04, pv: 0.02, ui: true, vol: 2 },
  ui_back: { pri: 9, max: 3, gap: 0.05, pv: 0.02, ui: true },
};

export const SFX_NAMES = Object.keys(META) as SfxName[];

const WORLD_ECHO: Record<WorldId, number> = { plaza: 0.06, paper: 0.04, comic: 0.09, toy: 0.06, neon: 0.28 };

// ============================================================================================
// SFX bank: spatialisation + voice management (works on any AudioChain)
// ============================================================================================

interface Voice {
  name: SfxName;
  t: number;
  end: number;
  score: number;
  head: GainNode;
  srcs: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  live: number;
  dying: boolean;
  released: boolean;
}

const MOBILE = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');

export class SfxBank {
  world: WorldId = 'plaza';
  listener: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0;
  maxVoices = MOBILE ? 18 : 24;
  echoEnabled = true;
  private voices: Voice[] = [];
  private last = new Map<string, number>();

  constructor(readonly ch: AudioChain) {}

  get activeVoices(): number {
    let n = 0;
    for (const v of this.voices) if (!v.dying) n++;
    return n;
  }

  /** Start a sound. `when` defaults to "now" (used by offline rendering tests). Returns false if dropped. */
  play(name: SfxName, opts?: PlayOpts, when?: number): boolean {
    const meta = META[name];
    const fn = SFX[name];
    if (!meta || !fn) return false;
    const ac = this.ch.ac;
    const now = when ?? ac.currentTime + 0.005;
    this.prune(now);

    const pos = opts && opts.pos && !meta.ui ? opts.pos : undefined;
    const key = pos ? name + '@' : name;
    const prev = this.last.get(key);
    if (prev !== undefined && Math.abs(now - prev) < (meta.gap ?? 0.025)) return false;

    let vol = clamp(num(opts?.volume, 1), 0, 2) * (meta.vol ?? 1);
    let pan = 0;
    let cut = 20000;
    let far = 0;
    if (pos) {
      const L = this.listener;
      const dx = num(pos.x, L.x) - L.x, dy = num(pos.y, L.y) - L.y, dz = num(pos.z, L.z) - L.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / (meta.range ?? 1);
      if (!(d < 60)) return false;
      vol *= (d <= 4 ? 1 : Math.pow(4 / d, 0.75)) * (1 - smoothstep(28, 60, d));
      const hd = Math.sqrt(dx * dx + dz * dz);
      if (hd > 0.05) {
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
        const nx = dx / hd, nz = dz / hd;
        const side = nx * cy - nz * sy; // listener right = (cos, 0, -sin)
        const front = -nx * sy - nz * cy; // listener forward = (-sin, 0, -cos)
        const near = clamp((hd - 0.6) / 3, 0, 1);
        pan = side * 0.85 * near;
        if (front < 0) cut = 20000 - 15000 * -front * near;
      }
      if (d > 10) cut = Math.min(cut, 20000 * Math.pow(10 / d, 0.95));
      far = clamp((d - 4) / 40, 0, 1);
    }
    if (vol < 0.004) return false;

    // ---- voice limiting
    const score = meta.pri + Math.min(vol, 1);
    let same = 0;
    let oldestSame: Voice | null = null;
    for (const v of this.voices) {
      if (v.dying || v.name !== name) continue;
      same++;
      if (!oldestSame || v.t < oldestSame.t) oldestSame = v;
    }
    if (same >= meta.max && oldestSame) this.kill(oldestSame, now);
    if (this.activeVoices >= this.maxVoices) {
      let worst: Voice | null = null;
      for (const v of this.voices) {
        if (v.dying) continue;
        if (!worst || v.score < worst.score || (v.score === worst.score && v.t < worst.t)) worst = v;
      }
      if (!worst || worst.score > score) return false;
      this.kill(worst, now);
    }
    this.last.set(key, now);

    // ---- voice graph: head gain -> [lowpass] -> [panner] -> bus (+ echo send)
    const head = ac.createGain();
    head.gain.value = vol;
    const nodes: AudioNode[] = [head];
    let tail: AudioNode = head;
    if (cut < 19000) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = fclamp(cut);
      f.Q.value = 0.5;
      tail.connect(f);
      tail = f;
      nodes.push(f);
    }
    if (pan !== 0 && this.ch.hasPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      tail.connect(p);
      tail = p;
      nodes.push(p);
    }
    tail.connect(meta.ui ? this.ch.sfxUi : this.ch.sfxGame);
    const echoAmt = meta.ui || !this.echoEnabled ? 0 : WORLD_ECHO[this.world] * (meta.echo ?? 1) * (1 + far);
    if (echoAmt > 0.004) {
      const s = ac.createGain();
      s.gain.value = echoAmt;
      tail.connect(s);
      s.connect(this.ch.echo);
      nodes.push(s);
    }

    const pitch = clamp(num(opts?.pitch, 1), 0.25, 4) * (1 + (Math.random() * 2 - 1) * (meta.pv ?? 0.04));
    const vb = new VB(ac, this.ch.noise, head, now, pitch, this.world);
    try {
      fn(vb);
    } catch {
      safeDisconnect(nodes.concat(vb.nodes));
      return false;
    }
    const voice: Voice = {
      name, t: now, end: vb.end, score, head, srcs: vb.srcs, nodes: nodes.concat(vb.nodes),
      live: vb.srcs.length, dying: false, released: false,
    };
    const onEnd = () => {
      voice.live--;
      if (voice.live <= 0) this.release(voice);
    };
    for (const s of vb.srcs) s.onended = onEnd;
    this.voices.push(voice);
    return true;
  }

  /** Quick fade + stop (voice stealing). */
  private kill(v: Voice, now: number) {
    if (v.dying) return;
    v.dying = true;
    try {
      const g = v.head.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.015);
    } catch {
      /* ignore */
    }
    for (const s of v.srcs) {
      try {
        s.stop(now + 0.02);
      } catch {
        /* ignore */
      }
    }
    v.end = Math.min(v.end, now + 0.03);
  }

  private release(v: Voice) {
    if (v.released) return;
    v.released = true;
    for (const s of v.srcs) s.onended = null;
    safeDisconnect(v.nodes);
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  /** Safety net in case onended never fires (e.g. context suspended mid-sound). */
  private prune(now: number) {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (v.end < now - 0.25) this.release(v);
    }
  }
}

// ============================================================================================
// Music: instruments
// ============================================================================================

type BellKind = 'musicbox' | 'glock' | 'toypiano';
type LeadKind = 'square' | 'saw' | 'brass' | 'clarinet';
type BassKind = 'round' | 'sine' | 'saw';

/** Per-note synth voices for the music sequencer. Every note disconnects itself when done. */
class Instr {
  constructor(readonly ac: BaseAudioContext, readonly nz: NoiseBank) {}

  private G(to: AudioNode, v = 1): GainNode {
    const g = this.ac.createGain();
    g.gain.value = v;
    g.connect(to);
    return g;
  }

  /** Envelope gain: attack a -> peak, hold h, exponential release r. */
  private E(to: AudioNode, t: number, a: number, pk: number, h: number, r: number): GainNode {
    const g = this.ac.createGain();
    const p = Math.max(pk, 1e-4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p, t + a);
    if (h > 0) g.gain.setValueAtTime(p, t + a + h);
    g.gain.exponentialRampToValueAtTime(1e-3, t + a + h + r);
    g.connect(to);
    return g;
  }

  private O(type: OscillatorType, f: number, t0: number, t1: number, to: AudioNode, det = 0): OscillatorNode {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (det) o.detune.value = det;
    o.connect(to);
    o.start(t0);
    o.stop(t1);
    return o;
  }

  private N(kind: NoiseKind, t0: number, t1: number, to: AudioNode): AudioBufferSourceNode {
    const s = this.ac.createBufferSource();
    s.buffer = this.nz[kind];
    s.loop = true;
    s.connect(to);
    s.start(t0, Math.random() * 1.5);
    s.stop(t1);
    return s;
  }

  private F(type: BiquadFilterType, f: number, q: number, to: AudioNode): BiquadFilterNode {
    const fl = this.ac.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = fclamp(f);
    fl.Q.value = q;
    fl.connect(to);
    return fl;
  }

  private done(src: AudioScheduledSourceNode, nodes: AudioNode[]) {
    src.onended = () => safeDisconnect(nodes);
  }

  // ---------------------------------------------------------------- drums
  kick(d: AudioNode, t: number, vel: number, f0 = 140, f1 = 44, dec = 0.3) {
    const g = this.E(d, t, 0.002, vel, 0.015, dec);
    const o = this.O('sine', f0, t, t + dec + 0.05, g);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.08);
    const cg = this.E(d, t, 0.001, vel * 0.25, 0, 0.015);
    const c = this.O('triangle', f0 * 3, t, t + 0.03, cg);
    this.done(o, [o, g, c, cg]);
  }

  snare(d: AudioNode, t: number, vel: number, tone = 190, dec = 0.15, bp = 2600) {
    const ng = this.E(d, t, 0.001, vel, 0, dec);
    const f = this.F('bandpass', bp, 0.6, ng);
    const n = this.N('white', t, t + dec + 0.05, f);
    const tg = this.E(d, t, 0.001, vel * 0.6, 0, 0.09);
    const o = this.O('triangle', tone, t, t + 0.12, tg);
    o.frequency.exponentialRampToValueAtTime(tone * 0.75, t + 0.08);
    this.done(n, [n, f, ng, o, tg]);
  }

  /** 80s gated snare: bright noise, held, then chopped. */
  gsnare(d: AudioNode, t: number, vel: number) {
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.002);
    g.gain.linearRampToValueAtTime(vel * 0.55, t + 0.15);
    g.gain.linearRampToValueAtTime(0, t + 0.18);
    g.connect(d);
    const f = this.F('highpass', 900, 0.5, g);
    const n = this.N('white', t, t + 0.2, f);
    const tg = this.E(d, t, 0.001, vel * 0.7, 0, 0.1);
    const o = this.O('triangle', 200, t, t + 0.12, tg);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    this.done(n, [n, f, g, o, tg]);
  }

  hat(d: AudioNode, t: number, vel: number, open = false) {
    const dec = open ? 0.28 : 0.04;
    const g = this.E(d, t, 0.001, vel, 0, dec);
    const f = this.F('highpass', 7500, 0.7, g);
    const n = this.N('white', t, t + dec + 0.03, f);
    this.done(n, [n, f, g]);
  }

  shaker(d: AudioNode, t: number, vel: number) {
    const g = this.E(d, t, 0.012, vel, 0, 0.055);
    const f = this.F('bandpass', 6500, 1.2, g);
    const n = this.N('white', t, t + 0.09, f);
    this.done(n, [n, f, g]);
  }

  clap(d: AudioNode, t: number, vel: number) {
    const g = this.ac.createGain();
    const gp = g.gain;
    gp.setValueAtTime(0, t);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.011;
      gp.setValueAtTime(vel, tt);
      gp.exponentialRampToValueAtTime(vel * 0.15, tt + 0.009);
    }
    gp.setValueAtTime(vel * 0.8, t + 0.033);
    gp.exponentialRampToValueAtTime(1e-4, t + 0.17);
    g.connect(d);
    const f = this.F('bandpass', 1400, 0.9, g);
    const n = this.N('white', t, t + 0.2, f);
    this.done(n, [n, f, g]);
  }

  rim(d: AudioNode, t: number, vel: number) {
    const g = this.E(d, t, 0.001, vel, 0, 0.03);
    const o = this.O('triangle', 1700, t, t + 0.06, g);
    const g2 = this.E(d, t, 0.001, vel * 0.8, 0, 0.025);
    const f = this.F('bandpass', 2400, 4, g2);
    const n = this.N('white', t, t + 0.05, f);
    this.done(o, [o, g, n, f, g2]);
  }

  tom(d: AudioNode, t: number, vel: number, f: number) {
    const g = this.E(d, t, 0.002, vel, 0, 0.32);
    const o = this.O('sine', f * 1.5, t, t + 0.36, g);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const g2 = this.E(d, t, 0.001, vel * 0.3, 0, 0.02);
    const fl = this.F('bandpass', 3000, 1, g2);
    const n = this.N('white', t, t + 0.04, fl);
    this.done(o, [o, g, n, fl, g2]);
  }

  synTom(d: AudioNode, t: number, vel: number, f: number) {
    const g = this.E(d, t, 0.002, vel, 0, 0.35);
    const o = this.O('sine', f * 2.2, t, t + 0.4, g);
    o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.3);
    this.done(o, [o, g]);
  }

  crash(d: AudioNode, t: number, vel: number) {
    const g = this.E(d, t, 0.002, vel, 0, 1.5);
    const f = this.F('highpass', 5000, 0.5, g);
    const n = this.N('white', t, t + 1.55, f);
    this.done(n, [n, f, g]);
  }

  wood(d: AudioNode, t: number, vel: number, hi: boolean) {
    const f0 = hi ? 1250 : 850;
    const g = this.E(d, t, 0.001, vel, 0, 0.06);
    const o = this.O('sine', f0, t, t + 0.08, g);
    const g2 = this.E(d, t, 0.001, vel * 0.7, 0, 0.02);
    const bp = this.F('bandpass', f0 * 2, 6, g2);
    const n = this.N('white', t, t + 0.04, bp);
    this.done(o, [o, g, n, bp, g2]);
  }

  // ---------------------------------------------------------------- tonal
  pluck(d: AudioNode, t: number, m: number, vel: number, dec = 0.4) {
    const f = mtof(m);
    const g = this.E(d, t, 0.002, vel, 0, dec);
    const lp = this.F('lowpass', Math.min(f * 8, 9000), 1.2, g);
    lp.frequency.setValueAtTime(fclamp(Math.min(f * 8, 9000)), t);
    lp.frequency.exponentialRampToValueAtTime(fclamp(Math.max(f * 1.2, 150)), t + dec * 0.6);
    const o1 = this.O('triangle', f, t, t + dec + 0.03, lp);
    const g2 = this.G(lp, 0.4);
    const o2 = this.O('sawtooth', f, t, t + dec + 0.03, g2, 5);
    this.done(o1, [o1, o2, g2, lp, g]);
  }

  marimba(d: AudioNode, t: number, m: number, vel: number, dec = 0.5) {
    const f = mtof(m);
    const g = this.E(d, t, 0.002, vel, 0, dec);
    const o1 = this.O('sine', f, t, t + dec + 0.03, g);
    const g2 = this.E(d, t, 0.001, vel * 0.4, 0, 0.07);
    const o2 = this.O('sine', f * 4, t, t + 0.1, g2);
    this.done(o1, [o1, g, o2, g2]);
  }

  xylo(d: AudioNode, t: number, m: number, vel: number) {
    const f = mtof(m);
    const g = this.E(d, t, 0.001, vel, 0, 0.28);
    const o1 = this.O('sine', f, t, t + 0.31, g);
    const g2 = this.E(d, t, 0.001, vel * 0.5, 0, 0.06);
    const o2 = this.O('sine', f * 3, t, t + 0.09, g2);
    const g3 = this.E(d, t, 0.001, vel * 0.3, 0, 0.012);
    const bp = this.F('bandpass', Math.min(f * 4, 12000), 3, g3);
    const n = this.N('white', t, t + 0.03, bp);
    this.done(o1, [o1, g, o2, g2, n, bp, g3]);
  }

  pizz(d: AudioNode, t: number, m: number, vel: number, dec = 0.25) {
    const f = mtof(m);
    const g = this.E(d, t, 0.004, vel, 0, dec);
    const lp = this.F('lowpass', f * 6, 2, g);
    lp.frequency.setValueAtTime(fclamp(f * 6), t);
    lp.frequency.exponentialRampToValueAtTime(fclamp(f * 1.5), t + 0.1);
    const o = this.O('sawtooth', f, t, t + dec + 0.03, lp);
    this.done(o, [o, lp, g]);
  }

  bell(d: AudioNode, t: number, m: number, vel: number, kind: BellKind) {
    const f = mtof(m);
    // [ratio, amp, decay]
    const parts: [number, number, number][] =
      kind === 'glock' ? [[1, 1, 1.1], [2.76, 0.3, 0.3], [5.4, 0.12, 0.08]]
        : kind === 'musicbox' ? [[1, 1, 1.3], [2, 0.22, 0.45], [5.1, 0.15, 0.06]]
          : [[1, 1, 0.7], [2.01, 0.3, 0.25], [3.9, 0.18, 0.07]];
    const nodes: AudioNode[] = [];
    let first: OscillatorNode | null = null;
    for (const [r, a, dec] of parts) {
      if (f * r > 16000) continue;
      const g = this.E(d, t, 0.001, vel * a, 0, dec);
      const o = this.O(kind === 'toypiano' && r === 1 ? 'triangle' : 'sine', f * r, t, t + dec + 0.03, g);
      nodes.push(o, g);
      if (!first) first = o;
    }
    if (first) this.done(first, nodes);
  }

  brass(d: AudioNode, t: number, m: number, dur: number, vel: number, bright = 1) {
    const f = mtof(m);
    const a = 0.02, rel = 0.09;
    const g = this.ac.createGain();
    const gp = g.gain;
    const hold = Math.max(dur, a + 0.03);
    gp.setValueAtTime(0, t);
    gp.linearRampToValueAtTime(vel, t + a);
    gp.linearRampToValueAtTime(vel * 0.7, t + a + 0.08);
    gp.setValueAtTime(vel * 0.7, t + hold);
    gp.exponentialRampToValueAtTime(1e-4, t + hold + rel);
    g.connect(d);
    const lp = this.F('lowpass', f * 1.5, 1.4, g);
    lp.frequency.setValueAtTime(fclamp(f * 1.2), t);
    lp.frequency.linearRampToValueAtTime(fclamp(Math.min(f * 7 * bright, 9000)), t + a + 0.02);
    lp.frequency.exponentialRampToValueAtTime(fclamp(Math.min(f * 3.5 * bright, 6000)), t + a + 0.2);
    const o1 = this.O('sawtooth', f, t, t + hold + rel + 0.02, lp, -9);
    const o2 = this.O('sawtooth', f, t, t + hold + rel + 0.02, lp, 9);
    this.done(o1, [o1, o2, lp, g]);
  }

  lead(d: AudioNode, t: number, m: number, dur: number, vel: number, kind: LeadKind) {
    const f = mtof(m);
    const a = kind === 'clarinet' ? 0.03 : 0.012;
    const rel = 0.1;
    const hold = Math.max(dur - a, 0.02);
    const g = this.E(d, t, a, vel, hold, rel);
    const cut = kind === 'brass' ? f * 5 : kind === 'square' ? f * 6 : kind === 'clarinet' ? f * 4 : Math.min(f * 5, 5000);
    const lp = this.F('lowpass', cut, kind === 'clarinet' ? 0.5 : 1, g);
    if (kind === 'brass') {
      lp.frequency.setValueAtTime(fclamp(f * 1.5), t);
      lp.frequency.linearRampToValueAtTime(fclamp(f * 6), t + 0.05);
      lp.frequency.exponentialRampToValueAtTime(fclamp(f * 4), t + 0.25);
    }
    const t1 = t + a + hold + rel + 0.02;
    const o1 = this.O(kind === 'saw' || kind === 'brass' ? 'sawtooth' : 'square', f, t, t1, lp);
    const nodes: AudioNode[] = [o1, g, lp];
    if (kind === 'saw' || kind === 'brass') {
      const g2 = this.G(lp, 0.5);
      const o2 = this.O(kind === 'brass' ? 'square' : 'sawtooth', f, t, t1, g2, 7);
      nodes.push(o2, g2);
    }
    if (dur > 0.25) {
      // delayed vibrato
      const lfo = this.ac.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = this.ac.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(0, t + 0.15);
      lg.gain.linearRampToValueAtTime(14, t + 0.4);
      lfo.connect(lg);
      lg.connect(o1.detune);
      lfo.start(t);
      lfo.stop(t1);
      nodes.push(lfo, lg);
    }
    this.done(o1, nodes);
  }

  bass(d: AudioNode, t: number, m: number, dur: number, vel: number, kind: BassKind) {
    const f = mtof(m);
    const hold = Math.max(dur * 0.85, 0.02);
    const g = this.E(d, t, 0.006, vel, hold, 0.08);
    const t1 = t + hold + 0.12;
    if (kind === 'saw') {
      const lp = this.F('lowpass', f * 3, 2, g);
      lp.frequency.setValueAtTime(fclamp(f * 4), t);
      lp.frequency.exponentialRampToValueAtTime(fclamp(f * 1.6), t + 0.15);
      const o = this.O('sawtooth', f, t, t1, lp);
      const sg = this.G(g, 0.6);
      const s = this.O('sine', f, t, t1, sg);
      this.done(o, [o, lp, s, sg, g]);
    } else {
      const o = this.O('sine', f, t, t1, g);
      if (kind === 'round') {
        const g2 = this.G(g, 0.35);
        const o2 = this.O('triangle', f, t, t1, g2);
        this.done(o, [o, o2, g2, g]);
      } else this.done(o, [o, g]);
    }
  }

  pad(d: AudioNode, t: number, ms: number[], dur: number, vel: number, cut: number) {
    const g = this.E(d, t, 0.35, vel / Math.sqrt(ms.length * 2), Math.max(dur - 0.35, 0.05), 0.6);
    const lp = this.F('lowpass', cut, 0.7, g);
    const t1 = t + dur + 0.65;
    const nodes: AudioNode[] = [g, lp];
    let first: OscillatorNode | null = null;
    for (const m of ms) {
      const f = mtof(m);
      const a = this.O('sawtooth', f, t, t1, lp, -9);
      const b = this.O('sawtooth', f, t, t1, lp, 9);
      nodes.push(a, b);
      if (!first) first = a;
    }
    if (first) this.done(first, nodes);
  }

  arp(d: AudioNode, t: number, m: number, dur: number, vel: number, cut: number) {
    const f = mtof(m);
    const g = this.E(d, t, 0.003, vel, 0, Math.max(dur, 0.05));
    const lp = this.F('lowpass', cut * 1.8, 3, g);
    lp.frequency.setValueAtTime(fclamp(cut * 1.8), t);
    lp.frequency.exponentialRampToValueAtTime(fclamp(cut * 0.6), t + dur);
    const o = this.O('sawtooth', f, t, t + dur + 0.05, lp);
    const sg = this.G(lp, 0.3);
    const s = this.O('square', f * 0.5, t, t + dur + 0.05, sg);
    this.done(o, [o, s, sg, lp, g]);
  }
}

// ============================================================================================
// Music: harmony + melody generation
// ============================================================================================

interface Chord {
  root: number; // pitch class
  pcs: number[];
  set: Set<number>;
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11],
  sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], add9: [0, 4, 7, 2],
};

function parseChord(s: string): Chord {
  const m = /^([A-G])([#b]?)(.*)$/.exec(s.trim());
  let root = 0;
  let iv = QUAL[''];
  if (m) {
    root = mod12(PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
    iv = QUAL[m[3]] ?? QUAL[''];
  }
  const pcs = iv.map((i) => mod12(root + i));
  return { root, pcs, set: new Set(pcs) };
}

/** "C Bb F|G C" -> 4 bars, the third split in two halves. */
function bars(s: string): Chord[][] {
  return s.trim().split(/\s+/).map((b) => b.split('|').map(parseChord));
}

/** Close voicing of a chord centred around `center` (MIDI). */
function voicing(c: Chord, center: number): number[] {
  const lo = center - 6;
  return c.pcs.map((pc) => lo + mod12(pc - lo)).sort((a, b) => a - b);
}

/** The chord root at the octave inside [lo, lo+12). */
const rootIn = (c: Chord, lo: number) => lo + mod12(c.root - lo);

interface MelNote {
  step: number;
  len: number;
  midi: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

type Rh = [number, number][]; // [step, length] within a 16-step bar
const RHY: Rh[] = [
  [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
  [[0, 3], [3, 1], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
  [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
  [[0, 2], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4]],
  [[0, 6], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]],
  [[2, 2], [4, 2], [6, 2], [8, 4], [12, 4]],
  [[0, 2], [2, 2], [4, 2], [6, 2], [8, 8]],
  [[0, 3], [3, 3], [6, 2], [8, 4], [12, 4]],
];
const RHY_BOUNCY: Rh[] = [
  [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]],
  [[0, 2], [2, 1], [3, 3], [6, 2], [8, 4], [12, 4]],
  [[0, 3], [3, 1], [4, 3], [7, 1], [8, 4], [12, 2], [14, 2]],
  [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]],
  [[0, 3], [3, 3], [6, 2], [8, 6], [14, 2]],
];
const RHY_CAD: Rh[] = [
  [[0, 4], [4, 4], [8, 8]],
  [[0, 2], [2, 2], [4, 4], [8, 8]],
  [[0, 8], [8, 8]],
  [[0, 3], [3, 3], [6, 2], [8, 8]],
  [[0, 2], [2, 2], [4, 2], [6, 2], [8, 8]],
];
const RHY_SLOW: Rh[] = [
  [[0, 8], [8, 8]],
  [[0, 12], [12, 4]],
  [[0, 4], [4, 4], [8, 8]],
  [[0, 6], [6, 2], [8, 8]],
];

type MelKind = 'theme' | 'answer' | 'slow';

/**
 * Generate an 8-bar melody over the given chords as two 4-bar phrases ("sentence" form):
 * bar1 motif, bar2 continuation, bar3 = sequenced motif, bar4 = cadence; the second phrase
 * restates the first (re-fitted to its chords) and ends with a full cadence.
 * Strong beats land on chord tones, the rest moves stepwise through the scale.
 */
function genMelody(def: TrackDef, chords: Chord[][], seed: number, kind: MelKind): MelNote[][] {
  const rng = mulberry(seed);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rng() * a.length)];
  const { scale, tonic, lo, hi } = def;
  const scaleSet = new Set(scale.map((x) => mod12(tonic + x)));
  const d2m = (d: number) => tonic + 12 * Math.floor(d / 7) + scale[((d % 7) + 7) % 7];
  const chordAt = (b: number, s: number) => {
    const bc = chords[b % chords.length];
    return bc[s < 8 || bc.length < 2 ? 0 : bc.length - 1];
  };
  const inRange = (d: number) => {
    const m = d2m(d);
    return m >= lo && m <= hi;
  };
  const isCT = (d: number, b: number, s: number) => chordAt(b, s).set.has(mod12(d2m(d)));
  /** Nearest chord tone (in range) to degree d, preferring direction dir; avoids `avoid` if possible. */
  const nearestCT = (d: number, b: number, s: number, dir: number, avoid?: number) => {
    for (let pass = 0; pass < 2; pass++) {
      const ok = (c: number) => isCT(c, b, s) && inRange(c) && (pass === 1 || c !== avoid);
      if (ok(d)) return d;
      for (let k = 1; k < 8; k++) {
        for (const sg of dir >= 0 ? [1, -1] : [-1, 1]) {
          const c = d + sg * k;
          if (ok(c)) return c;
        }
      }
    }
    return d;
  };
  const fit = (d: number) => {
    let x = d;
    for (let i = 0; i < 20 && d2m(x) > hi; i++) x -= 2;
    for (let i = 0; i < 20 && d2m(x) < lo; i++) x += 2;
    return x;
  };

  const main = kind === 'slow' ? RHY_SLOW : def.bouncy ? RHY_BOUNCY : RHY;
  const cadP = kind === 'slow' ? RHY_SLOW : RHY_CAD;
  const r1 = pick(main), r2 = pick(main), c1 = pick(cadP);
  let c2 = pick(cadP);
  if (c2 === c1) c2 = cadP[(cadP.indexOf(c1) + 1) % cadP.length];
  const rhythms = [r1, r2, r1, c1, r1, r2, r1, c2];
  const contour = kind === 'answer' ? [-1, 1, -1, -1] : [1, 1, -1, -1];

  let midDeg = 0;
  const center = (lo + hi) / 2;
  for (let d = -14; d < 21; d++) if (Math.abs(d2m(d) - center) < Math.abs(d2m(midDeg) - center)) midDeg = d;
  let d = nearestCT(midDeg + (kind === 'answer' ? 2 : kind === 'slow' ? -1 : 0), 0, 0, 1);

  const degs: number[][] = [];
  const out: MelNote[][] = [];
  for (let b = 0; b < 8; b++) {
    const rh = rhythms[b];
    const pb = b & 3;
    const bd: number[] = [];
    if (b >= 4 && pb < 3) {
      // restate the first phrase
      degs[b - 4].forEach((x, i) => {
        const st = rh[i][0];
        bd.push(st % 8 === 0 && !isCT(x, b, st) ? nearestCT(x, b, st, 0) : x);
      });
    } else if (pb === 2) {
      // sequence of the bar-1 motif, starting on a chord tone near where we are
      const m0 = degs[b - 2];
      const start = nearestCT(d + contour[pb], b, rh[0][0], contour[pb]);
      const shift = start - m0[0];
      m0.forEach((x, i) => {
        const st = rh[i][0];
        let y = fit(x + shift);
        if (st % 4 === 0 && !isCT(y, b, st)) y = nearestCT(y, b, st, contour[pb]);
        bd.push(y);
      });
    } else if (pb === 3) {
      // cadence: stepwise approach to the root (final) or another chord tone (half cadence)
      const n = rh.length;
      const ch = chordAt(b, rh[n - 1][0]);
      const final = b === 7;
      let target = d;
      search: for (let k = 0; k < 8; k++) {
        for (const sg of [-1, 1]) {
          const c = d + sg * k;
          const pc = mod12(d2m(c));
          if (inRange(c) && (final ? pc === ch.root : ch.set.has(pc) && pc !== ch.root)) {
            target = c;
            break search;
          }
        }
      }
      const dir = d >= target ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const rem = n - 1 - i;
        let x = fit(target + dir * rem);
        const st = rh[i][0];
        if (rem > 0 && st % 8 === 0 && !isCT(x, b, st)) x = nearestCT(x, b, st, dir, target);
        bd.push(x);
      }
    } else {
      // free generation
      rh.forEach(([st, len], i) => {
        let x: number;
        if (b === 0 && i === 0) x = d;
        else {
          let dir = contour[pb];
          const m = d2m(d);
          if (m >= hi - 3) dir = -1; // turn around near the edges of the range
          else if (m <= lo + 3) dir = 1;
          const r = rng();
          x = r < 0.46 ? d + dir : r < 0.6 ? d - dir : r < 0.68 ? d : r < 0.88 ? d + dir * 2 : d + dir * (3 + Math.floor(rng() * 2));
          x = fit(x);
          const strong = st % 4 === 0 || len >= 4;
          if (strong && !isCT(x, b, st)) x = nearestCT(x, b, st, dir, d);
          const iv = Math.abs(d2m(x) - d2m(d));
          if (iv === 6 || iv > 9) {
            // no tritones / huge leaps: pull one step back towards the previous note
            x -= Math.sign(x - d);
            if (strong && !isCT(x, b, st)) x = nearestCT(x, b, st, -dir);
          }
        }
        d = x;
        bd.push(x);
      });
    }
    degs.push(bd);
    d = bd.length ? bd[bd.length - 1] : d;
    const bar: MelNote[] = rh.map(([st, len], i) => {
      let midi = d2m(bd[i]);
      // chromatic fix: follow chord tones outside the scale (e.g. C# over A major in D minor)
      const ch = chordAt(b, st);
      if (!ch.set.has(mod12(midi))) {
        for (const off of [1, -1]) {
          const pc = mod12(midi + off);
          if (ch.set.has(pc) && !scaleSet.has(pc)) {
            midi += off;
            break;
          }
        }
      }
      return { step: st, len, midi };
    });
    out.push(bar);
  }
  return out;
}

// ============================================================================================
// Music: tracks
// ============================================================================================

type Layer = 'bed' | 'counter' | 'perc' | 'drums' | 'lead' | 'extra';
const LAYERS: Layer[] = ['bed', 'counter', 'perc', 'drums', 'lead', 'extra'];
type Sec = 'A' | 'B' | 'C';
type FillKind = 'snare' | 'tom' | 'wood' | 'syn' | 'toy';

/** Intensity (0..1) -> layer level. */
function layerLevel(l: Layer, I: number): number {
  switch (l) {
    case 'bed':
      return 1;
    case 'counter':
      return 1 - 0.8 * smoothstep(0.3, 0.7, I);
    case 'perc':
      return 0.65 + 0.35 * I;
    case 'drums':
      return smoothstep(0.1, 0.4, I);
    case 'lead':
      return smoothstep(0.3, 0.6, I);
    case 'extra':
      return smoothstep(0.7, 0.95, I);
  }
}

interface SC {
  I: Instr;
  t: number; // time of this step (swing applied)
  s: number; // step in bar 0..15
  bar: number; // bar in loop 0..31
  sb: number; // bar in section 0..7
  sec: Sec;
  loop: number;
  ch: Chord; // current chord
  nx: Chord; // chord at the next bar
  sps: number; // seconds per step
  L: Record<Layer, GainNode | null>; // null = layer inactive
  mel: MelNote | undefined; // melody note starting on this step
  fill: number; // 0 = none, else fill variant (1..)
  r: () => number;
}

interface TrackDef {
  bpm: number;
  swing: number; // 0..0.5 of a step, applied to odd 16ths
  tonic: number; // MIDI of scale degree 0 for the melody
  scale: number[];
  lo: number;
  hi: number; // melody range (MIDI)
  sec: Record<Sec, Chord[][]>;
  order: Sec[][]; // section order per loop pass (alternates)
  seed: number;
  vol: number;
  rev: number;
  revL?: Partial<Record<Layer, number>>;
  full?: boolean; // ignores intensity (menu)
  bouncy?: boolean;
  fills: FillKind[];
  arrange(c: SC): void;
}

function drumFill(c: SC, d: AudioNode, kinds: FillKind[]): boolean {
  if (!c.fill || c.s < 8) return false;
  const kind = kinds[(c.fill - 1) % kinds.length];
  const k = c.s - 8;
  const I = c.I, t = c.t;
  const cres = 0.55 + k * 0.065;
  switch (kind) {
    case 'snare':
      if (k >= 4 || k % 2 === 0) I.snare(d, t, 0.26 * cres);
      break;
    case 'tom':
      if (k % 2 === 0 || k === 7) I.tom(d, t, 0.42, [240, 200, 160, 130, 110][Math.min(4, (k >> 1) + (k === 7 ? 1 : 0))]);
      break;
    case 'wood':
      I.wood(d, t, 0.12 * cres, k % 2 === 0);
      break;
    case 'syn':
      if (k % 2 === 0 || k >= 6) I.synTom(d, t, 0.34, 300 - k * 22);
      break;
    case 'toy':
      if (k % 2 === 0 || k >= 6) I.snare(d, t, 0.09 * cres, 360, 0.06, 4500);
      break;
  }
  if (k === 0) I.kick(d, t, 0.42);
  return true;
}

const PLAZA_STRUM: Record<number, number> = { 0: 1, 4: 1, 6: -1, 10: -1, 12: 1, 14: -1 }; // 1 = down, -1 = up
const NEON_ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 3, 1, 2, 0, 2];

const TRACKS: Record<MusicTrack, TrackDef> = {
  // ------------------------------------------------------------------ MENU: heroic cartoon theme
  menu: {
    bpm: 120, swing: 0, tonic: 72, scale: MAJOR, lo: 67, hi: 86, seed: 1207, vol: 0.85, rev: 0.22,
    revL: { lead: 0.15 }, full: true, fills: ['snare', 'tom'],
    sec: { A: bars('C Bb F C C Bb F G'), B: bars('Am F C G Am F Dm G'), C: bars('F G Em Am F G Dm G7') },
    order: [['A', 'B', 'A', 'C'], ['A', 'B', 'C', 'A']],
    arrange(c) {
      const { I, t, s, L, ch, sps } = c;
      if (L.bed) {
        if (s === 0) I.pad(L.bed, t, voicing(ch, 60), 16 * sps, 0.09, 1400);
        const hit = s === 0 ? 3 : s === 6 || s === 10 ? 2 : s === 12 ? 3 : 0;
        if (hit) for (const m of voicing(ch, 65)) I.brass(L.bed, t, m, hit * sps, 0.05, 1);
        if (s % 2 === 0) {
          const r = rootIn(ch, 36);
          let m = r + [0, 0, 7, 12, 0, 0, 7, 7][s >> 1];
          if (s === 14 && c.nx.root !== ch.root) m = rootIn(c.nx, 36) - 1;
          I.bass(L.bed, t, m, sps * 1.7, 0.28, 'saw');
        }
      }
      if (L.perc && s % 2 === 0) I.hat(L.perc, t, s % 4 === 2 ? 0.07 : 0.045);
      if (L.drums && !drumFill(c, L.drums, ['snare', 'tom'])) {
        if (s === 0 || s === 8 || (s === 10 && c.r() < 0.3)) I.kick(L.drums, t, 0.5);
        if (s === 4 || s === 12) I.snare(L.drums, t, 0.28);
        if (s === 14 || s === 15) I.snare(L.drums, t, 0.07);
      }
      if (L.lead && c.mel) I.lead(L.lead, t, c.mel.midi, c.mel.len * sps * 0.92, 0.15, 'brass');
      if (L.extra) {
        if (c.mel) I.bell(L.extra, t, c.mel.midi + 12, 0.045, 'glock');
        if (s === 0 && c.sb % 4 === 0) I.crash(L.extra, t, 0.1);
        if (s === 0) I.tom(L.extra, t, 0.22, mtof(rootIn(ch, 36)));
      }
    },
  },

  // ------------------------------------------------------------------ PLAZA: sunny uke + marimba
  plaza: {
    bpm: 118, swing: 0.12, tonic: 67, scale: MAJOR, lo: 67, hi: 86, seed: 3141, vol: 1, rev: 0.16,
    bouncy: true, fills: ['tom', 'snare'],
    sec: { A: bars('G D Em C G D C D'), B: bars('C D Bm Em Am D G G'), C: bars('Em C G D Em C Am D') },
    order: [['A', 'B', 'A', 'C'], ['A', 'B', 'C', 'A']],
    arrange(c) {
      const { I, t, s, L, ch, sps } = c;
      if (L.bed) {
        const st = PLAZA_STRUM[s];
        if (st) {
          const vs = voicing(ch, 69);
          const vel = (st > 0 ? 0.075 : 0.05) * (s === 0 ? 1.2 : 1);
          (st > 0 ? vs : [...vs].reverse()).forEach((m, i) => I.pluck(L.bed!, t + i * 0.011, m, vel, 0.32));
        }
        const r = rootIn(ch, 43);
        if (s === 0) I.bass(L.bed, t, r, sps * 5, 0.32, 'round');
        else if (s === 6) I.bass(L.bed, t, r, sps * 1.6, 0.2, 'round');
        else if (s === 8) I.bass(L.bed, t, r + 7 > 55 ? r - 5 : r + 7, sps * 4, 0.26, 'round');
        else if (s === 14 && c.r() < 0.6) I.bass(L.bed, t, rootIn(c.nx, 43) - 1, sps * 1.6, 0.18, 'round');
      }
      if (L.counter && s % 4 === 0) {
        const vs = voicing(ch, 79);
        I.marimba(L.counter, t, vs[[0, 1, 2, 1][s >> 2] % vs.length], 0.12);
      }
      if (L.perc && s % 2 === 0) I.shaker(L.perc, t, s % 4 === 2 ? 0.08 : 0.045);
      if (L.drums && !drumFill(c, L.drums, ['tom', 'snare'])) {
        if (s === 0 || s === 8 || (s === 10 && c.r() < 0.35)) I.kick(L.drums, t, 0.48);
        if (s === 4 || s === 12) I.rim(L.drums, t, 0.2);
      }
      if (L.lead && c.mel) {
        const m = c.mel;
        I.marimba(L.lead, t, m.midi, 0.28, 0.6);
        if (m.len >= 6) for (let k = 2; k < m.len; k += 1) I.marimba(L.lead, t + k * sps * 0.5 + sps, m.midi, 0.09, 0.2);
      }
      if (L.extra) {
        if (c.mel) I.bell(L.extra, t, c.mel.midi + 12, 0.05, 'glock');
        if (s === 4 || s === 12) I.clap(L.extra, t, 0.16);
        if (s % 2 === 1) I.shaker(L.extra, t, 0.035);
        if (s === 0 && c.sb === 0) I.crash(L.extra, t, 0.12);
      }
    },
  },

  // ------------------------------------------------------------------ PAPER: whimsical pizzicato
  paper: {
    bpm: 110, swing: 0.22, tonic: 77, scale: MAJOR, lo: 72, hi: 89, seed: 2718, vol: 1.6, rev: 0.2,
    bouncy: true, fills: ['wood', 'snare'],
    sec: { A: bars('F Dm Gm C F Dm Gm|C F'), B: bars('Bb C Am Dm Gm C F C'), C: bars('Dm Bb F C Dm Bb Gm C7') },
    order: [['A', 'B', 'A', 'C'], ['A', 'B', 'C', 'A']],
    arrange(c) {
      const { I, t, s, L, ch, sps } = c;
      if (L.bed) {
        const r = rootIn(ch, 41);
        if (s === 0) I.pad(L.bed, t, voicing(ch, 60), 16 * sps, 0.06, 900); // soft reed/accordion bed
        if (s === 0) I.pizz(L.bed, t, r, 0.34, 0.35);
        if (s === 8) I.pizz(L.bed, t, r + 7 > 52 ? r - 5 : r + 7, 0.28, 0.3);
        if (s === 14 && c.r() < 0.4) I.pizz(L.bed, t, rootIn(c.nx, 41) - 1, 0.2, 0.2);
        if (s === 4 || s === 12) for (const m of voicing(ch, 62)) I.pizz(L.bed, t, m, 0.065, 0.18);
      }
      if (L.perc) {
        if (s === 0 || s === 8) I.wood(L.perc, t, 0.14, false);
        else if (s === 4 || s === 12) I.wood(L.perc, t, 0.11, true);
        else if (s === 14 && c.r() < 0.5) I.wood(L.perc, t, 0.06, true);
      }
      if (L.counter && (s === 0 || s === 6 || s === 10)) {
        const vs = voicing(ch, 79);
        I.xylo(L.counter, t, vs[(s === 0 ? 0 : s === 6 ? 2 : 1) % vs.length], 0.13);
      }
      if (L.drums && !drumFill(c, L.drums, ['wood', 'snare'])) {
        if (s === 0 || s === 8) I.kick(L.drums, t, 0.36, 110, 45, 0.25);
        if (s === 4 || s === 12) I.snare(L.drums, t, 0.11, 200, 0.12, 1800);
      }
      if (L.lead && c.mel) {
        I.xylo(L.lead, t, c.mel.midi, 0.26);
        if (c.mel.len >= 6) I.xylo(L.lead, t + sps * 2, c.mel.midi, 0.12);
      }
      if (L.extra) {
        if (c.mel && c.mel.len >= 2) I.lead(L.extra, t, c.mel.midi - 12, c.mel.len * sps * 0.9, 0.05, 'clarinet');
        if (s % 2 === 1) I.wood(L.extra, t, 0.04, true);
        if (s === 0 && c.sb === 0) I.crash(L.extra, t, 0.08);
      }
    },
  },

  // ------------------------------------------------------------------ COMIC: brassy stabs, big snare
  comic: {
    bpm: 132, swing: 0, tonic: 62, scale: MINOR, lo: 62, hi: 81, seed: 4242, vol: 0.85, rev: 0.18,
    revL: { drums: 0.35 }, fills: ['tom', 'snare'],
    sec: { A: bars('Dm Bb C Dm Dm Bb C A'), B: bars('F C Bb C F C Bb A'), C: bars('Gm Dm Bb A Gm Dm Bb|C A') },
    order: [['A', 'B', 'A', 'C'], ['A', 'B', 'C', 'A']],
    arrange(c) {
      const { I, t, s, L, ch, sps } = c;
      if (L.bed) {
        const hit = s === 0 ? 2 : s === 3 ? 1.5 : s === 6 ? 2 : s === 10 ? 1.5 : s === 12 ? 2 : 0;
        if (hit) for (const m of voicing(ch, 62)) I.brass(L.bed, t, m, hit * sps * 0.8, 0.065, 1.1);
        if (s % 2 === 0) {
          const r = rootIn(ch, 38);
          I.bass(L.bed, t, r + [0, 0, 12, 0, 0, 0, 12, 7][s >> 1], sps * 1.6, 0.27, 'saw');
        }
      }
      if (L.counter && s === 0) I.pad(L.counter, t, voicing(ch, 57), 16 * sps, 0.06, 1500);
      if (L.perc && s % 2 === 0) I.hat(L.perc, t, s % 4 === 2 ? 0.08 : 0.05);
      if (L.drums && !drumFill(c, L.drums, ['tom', 'snare'])) {
        if (s === 0 || s === 6 || s === 10 || (s === 11 && c.r() < 0.3)) I.kick(L.drums, t, 0.52);
        if (s === 4 || s === 12) I.snare(L.drums, t, 0.36, 180, 0.2, 2200);
      }
      if (L.lead && c.mel) I.lead(L.lead, t, c.mel.midi, c.mel.len * sps * 0.9, 0.17, 'brass');
      if (L.extra) {
        if (s % 2 === 1) I.hat(L.extra, t, 0.035);
        if (c.mel) I.lead(L.extra, t, c.mel.midi + 12, c.mel.len * sps * 0.9, 0.04, 'square');
        if (s === 0 && c.sb % 4 === 0) I.crash(L.extra, t, 0.14);
      }
    },
  },

  // ------------------------------------------------------------------ TOY: music box & glockenspiel
  toy: {
    bpm: 104, swing: 0.06, tonic: 84, scale: MAJOR, lo: 77, hi: 93, seed: 1618, vol: 1.6, rev: 0.28,
    fills: ['toy'],
    sec: { A: bars('C Am F G C Am Dm|G C'), B: bars('F G Em Am Dm G C C'), C: bars('Am F C G Am F Dm G') },
    order: [['A', 'B', 'A', 'C'], ['A', 'B', 'C', 'A']],
    arrange(c) {
      const { I, t, s, L, ch, sps } = c;
      if (L.bed) {
        if (s % 2 === 0) {
          const vs = voicing(ch, 72);
          const i = [0, 2, 1, 2, 3, 2, 1, 2][s >> 1];
          I.bell(L.bed, t, i === 3 ? vs[0] + 12 : vs[i % vs.length], 0.06, 'musicbox');
        }
        const r = rootIn(ch, 48);
        if (s === 0) I.bass(L.bed, t, r, sps * 6, 0.22, 'sine');
        if (s === 8) I.bass(L.bed, t, r + 7 > 59 ? r - 5 : r + 7, sps * 6, 0.18, 'sine');
      }
      if (L.counter && s === 0) for (const m of voicing(ch, 64)) I.bell(L.counter, t + Math.random() * 0.01, m, 0.04, 'toypiano');
      if (L.perc && s % 4 === 2) I.shaker(L.perc, t, 0.045);
      if (L.drums && !drumFill(c, L.drums, ['toy'])) {
        if (s === 0 || s === 8) I.kick(L.drums, t, 0.34, 100, 50, 0.2);
        if (s === 4 || s === 12) I.snare(L.drums, t, 0.09, 330, 0.07, 4500);
      }
      if (L.lead && c.mel) I.bell(L.lead, t, c.mel.midi, 0.2, 'glock');
      if (L.extra) {
        if (s % 4 === 2) for (const m of voicing(ch, 67)) I.bell(L.extra, t, m, 0.028, 'toypiano');
        if (c.mel) I.xylo(L.extra, t, c.mel.midi - 12, 0.08);
        if (s === 4 || s === 12) I.clap(L.extra, t, 0.08);
      }
    },
  },

  // ------------------------------------------------------------------ NEON: synthwave
  neon: {
    bpm: 100, swing: 0, tonic: 69, scale: MINOR, lo: 64, hi: 84, seed: 8088, vol: 0.9, rev: 0.25,
    revL: { lead: 0.35, drums: 0.3 }, fills: ['syn'],
    sec: { A: bars('Am F C G Am F G G'), B: bars('F G Em Am F G Am Am'), C: bars('Dm Am F G Dm Am F E') },
    order: [['A', 'B', 'A', 'C'], ['A', 'B', 'C', 'A']],
    arrange(c) {
      const { I, t, s, L, ch, sps } = c;
      if (L.bed) {
        if (s === 0) I.pad(L.bed, t, voicing(ch, 60), 16 * sps, 0.07, 1600);
        if (s % 2 === 0) {
          const r = rootIn(ch, 33);
          I.bass(L.bed, t, s % 4 === 2 ? r + 12 : r, sps * 1.7, 0.3, 'saw');
        }
      }
      const vs = voicing(ch, 69);
      const arpNotes = [vs[0], vs[1], vs[2 % vs.length], vs[0] + 12];
      if (L.perc) I.arp(L.perc, t, arpNotes[NEON_ARP[s]], sps * 0.9, 0.055, 1500);
      if (L.drums && !drumFill(c, L.drums, ['syn'])) {
        if (s % 4 === 0) I.kick(L.drums, t, 0.52, 120, 40, 0.35);
        if (s === 4 || s === 12) I.gsnare(L.drums, t, 0.26);
        if (s % 4 === 2) I.hat(L.drums, t, 0.06);
      }
      if (L.lead && c.mel) I.lead(L.lead, t, c.mel.midi, c.mel.len * sps * 0.95, 0.13, 'saw');
      if (L.extra) {
        if (s % 2 === 1) I.hat(L.extra, t, 0.03);
        if (s % 2 === 0) I.arp(L.extra, t, arpNotes[NEON_ARP[s]] + 12, sps * 0.9, 0.025, 3000);
        if (s === 0 && c.sb % 4 === 0) I.crash(L.extra, t, 0.08);
      }
    },
  },
};

// ============================================================================================
// Music: sequencer / player (lookahead scheduling on the AudioContext clock)
// ============================================================================================

export class MusicPlayer {
  readonly def: TrackDef;
  private readonly out: GainNode;
  private readonly wet: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly lg: Record<Layer, GainNode>;
  private readonly until: Record<Layer, number>;
  private readonly I: Instr;
  private readonly sps: number;
  private readonly mel: Record<Sec, (MelNote | undefined)[][]>;
  private step = 0;
  private nextT: number;
  private fill = 0;
  private intensity = 0.5;
  stopAt = Infinity;
  disposed = false;

  constructor(readonly ch: AudioChain, readonly track: MusicTrack, start: number, fadeIn: number) {
    const ac = ch.ac;
    this.def = TRACKS[track] ?? TRACKS.menu;
    const def = this.def;
    this.I = new Instr(ac, ch.noise);
    this.sps = 60 / def.bpm / 4;
    this.nextT = start;

    this.out = ac.createGain();
    this.wet = ac.createGain();
    for (const g of [this.out, this.wet]) {
      g.gain.setValueAtTime(0, 0);
      g.gain.setValueAtTime(0, start);
      if (fadeIn > 0) g.gain.linearRampToValueAtTime(def.vol, start + fadeIn);
      else g.gain.setValueAtTime(def.vol, start);
    }
    this.out.connect(ch.musicIn);
    this.wet.connect(ch.musicRev);
    this.lp = ac.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.6;
    this.lp.frequency.value = 20000;
    this.lp.connect(this.out);

    const lg = {} as Record<Layer, GainNode>;
    const until = {} as Record<Layer, number>;
    for (const l of LAYERS) {
      const g = ac.createGain();
      g.gain.value = 0;
      g.connect(this.lp);
      const send = ac.createGain();
      send.gain.value = def.rev + (def.revL?.[l] ?? 0);
      g.connect(send);
      send.connect(this.wet);
      lg[l] = g;
      until[l] = 0;
    }
    this.lg = lg;
    this.until = until;

    // melodies: A = theme, B = answer, C = slow/lyrical
    const mk = (sec: Sec, seedOff: number, kind: MelKind) => {
      const bars8 = genMelody(def, def.sec[sec], def.seed + seedOff, kind);
      return bars8.map((notes) => {
        const idx: (MelNote | undefined)[] = new Array(16).fill(undefined);
        for (const n of notes) idx[n.step] = n;
        return idx;
      });
    };
    this.mel = { A: mk('A', 0, 'theme'), B: mk('B', 101, 'answer'), C: mk('C', 202, 'slow') };
    this.setIntensity(0.5, start, true);
  }

  setIntensity(v: number, now: number, immediate = false) {
    const I = this.def.full ? 1 : clamp(num(v, 0.5), 0, 1);
    this.intensity = I;
    for (const l of LAYERS) {
      const target = layerLevel(l, I);
      const g = this.lg[l].gain;
      if (immediate) {
        g.cancelScheduledValues(0);
        g.setValueAtTime(target, 0);
        g.setValueAtTime(target, now);
      } else g.setTargetAtTime(target, now, 0.35);
      if (target > 0.02) this.until[l] = Infinity;
      else if (this.until[l] === Infinity || immediate) this.until[l] = immediate ? 0 : now + 1.5;
    }
    const cut = this.def.full ? 20000 : Math.min(20000, 3200 * Math.pow(2, I * 2.62));
    if (immediate) this.lp.frequency.setValueAtTime(cut, 0);
    else this.lp.frequency.setTargetAtTime(cut, now, 0.5);
  }

  /** Schedule every step that starts before `until` (AudioContext time). */
  schedule(until: number) {
    if (this.disposed) return;
    const now = this.ch.ac.currentTime;
    if (this.nextT < now - 0.1) {
      // fell behind (tab throttled / frozen): skip ahead instead of bursting notes
      const skip = Math.ceil((now - this.nextT) / this.sps);
      this.step += skip;
      this.nextT += skip * this.sps;
    }
    const def = this.def;
    while (this.nextT < until && this.nextT < this.stopAt) {
      const s = this.step % 16;
      const barAbs = Math.floor(this.step / 16);
      const loop = Math.floor(barAbs / 32);
      const bar = barAbs % 32;
      const order = def.order[loop % def.order.length];
      const sec = order[bar >> 3];
      const sb = bar & 7;
      if (s === 0) {
        const r = Math.random();
        this.fill = (sb === 7 && r < 0.8) || (sb === 3 && r < 0.3) ? 1 + Math.floor(Math.random() * 4) : 0;
      }
      const bc = def.sec[sec][sb];
      const chord = bc[s < 8 || bc.length < 2 ? 0 : bc.length - 1];
      const nbar = (bar + 1) % 32;
      const nsec = def.order[(loop + (bar === 31 ? 1 : 0)) % def.order.length][nbar >> 3];
      const nx = def.sec[nsec][nbar & 7][0];
      const t = this.nextT + (s % 2 === 1 ? def.swing * this.sps : 0);
      const L = {} as Record<Layer, GainNode | null>;
      for (const l of LAYERS) L[l] = this.until[l] > t ? this.lg[l] : null;
      try {
        def.arrange({
          I: this.I, t, s, bar, sb, sec, loop, ch: chord, nx, sps: this.sps, L,
          mel: this.mel[sec][sb][s], fill: this.fill, r: Math.random,
        });
      } catch {
        /* never let a note error kill the scheduler */
      }
      this.step++;
      this.nextT += this.sps;
    }
  }

  fadeOut(now: number, dur: number) {
    const d = Math.max(dur, 0.02);
    for (const g of [this.out, this.wet]) {
      const p = g.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0, now + d);
    }
    this.stopAt = Math.min(this.stopAt, now + d);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    safeDisconnect([this.out, this.wet, this.lp, ...LAYERS.map((l) => this.lg[l])]);
  }
}

/** Dev helper: the chords and generated melodies of a track, as note names (for inspection/tests). */
export function describeTrack(track: MusicTrack) {
  const def = TRACKS[track];
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const nn = (m: number) => names[mod12(m)] + (Math.floor(m / 12) - 1);
  const out: Record<string, { chords: string; melody: string }> = {};
  (['A', 'B', 'C'] as Sec[]).forEach((sec, i) => {
    const mel = genMelody(def, def.sec[sec], def.seed + i * 101, (['theme', 'answer', 'slow'] as MelKind[])[i]);
    out[sec] = {
      chords: def.sec[sec].map((b) => b.map((c) => names[c.root] + (c.pcs[1] - c.root === 3 || c.pcs[1] - c.root === -9 ? 'm' : '')).join('|')).join(' '),
      melody: mel.map((bar) => bar.map((n) => `${nn(n.midi)}:${n.len}`).join(' ')).join(' / '),
    };
  });
  return { bpm: def.bpm, ...out };
}

// ============================================================================================
// Engine (realtime singleton)
// ============================================================================================

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private ch: AudioChain | null = null;
  private sfx: SfxBank | null = null;
  private failed = false;
  private vol = { master: 1, music: 0.7, sfx: 1 };
  private world: WorldId = 'plaza';
  private listener: Vec3 = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  private paused = false;
  private intensity = 0.5;
  private wantTrack: MusicTrack | null = null;
  private cur: MusicPlayer | null = null;
  private fading: MusicPlayer[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private gestureHooked = false;

  constructor() {
    this.hookGestures();
  }

  /** Create / resume the AudioContext. Call from a user gesture; safe to call many times. */
  unlock(): void {
    try {
      if (this.failed) return;
      if (!this.ctx) {
        const w = typeof window !== 'undefined' ? (window as any) : undefined;
        const Ctor: (new (opts?: AudioContextOptions) => AudioContext) | undefined = w && (w.AudioContext || w.webkitAudioContext);
        if (!Ctor) {
          this.failed = true;
          return;
        }
        let ctx: AudioContext;
        try {
          ctx = new Ctor({ latencyHint: 'interactive' });
        } catch {
          ctx = new Ctor();
        }
        this.ctx = ctx;
        this.ch = createChain(ctx);
        this.sfx = new SfxBank(this.ch);
        this.sfx.world = this.world;
        this.applyVolumes(true);
        this.applyPause(true);
      }
      const ctx = this.ctx;
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      // iOS: playing a buffer inside the gesture fully unlocks output
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.onended = () => safeDisconnect([s]);
      s.start(0);
      if (this.wantTrack && !this.cur) this.startMusic(this.wantTrack);
    } catch {
      /* no-throw */
    }
  }

  setVolumes(master: number, music: number, sfx: number): void {
    try {
      this.vol = {
        master: clamp(num(master, this.vol.master), 0, 1),
        music: clamp(num(music, this.vol.music), 0, 1),
        sfx: clamp(num(sfx, this.vol.sfx), 0, 1),
      };
      this.applyVolumes(false);
    } catch {
      /* no-throw */
    }
  }

  setWorld(world: WorldId): void {
    try {
      if (!WORLD_IDS.includes(world)) return;
      this.world = world;
      if (this.sfx) this.sfx.world = world;
    } catch {
      /* no-throw */
    }
  }

  setListener(pos: { x: number; y: number; z: number }, yaw: number): void {
    try {
      if (pos) {
        this.listener.x = num(pos.x, this.listener.x);
        this.listener.y = num(pos.y, this.listener.y);
        this.listener.z = num(pos.z, this.listener.z);
      }
      this.yaw = num(yaw, this.yaw);
      if (this.sfx) {
        this.sfx.listener = this.listener;
        this.sfx.yaw = this.yaw;
      }
    } catch {
      /* no-throw */
    }
  }

  play(name: SfxName, opts?: PlayOpts): void {
    try {
      const ctx = this.ctx;
      if (!ctx || !this.sfx || ctx.state !== 'running') return;
      const meta = META[name];
      if (!meta) return;
      if (this.paused && !meta.ui) return;
      this.sfx.play(name, opts);
    } catch {
      /* no-throw */
    }
  }

  startMusic(track: MusicTrack): void {
    try {
      if (typeof track !== 'string' || !Object.prototype.hasOwnProperty.call(TRACKS, track)) return;
      this.wantTrack = track;
      const ctx = this.ctx, ch = this.ch;
      if (!ctx || !ch) return; // will start on unlock()
      if (this.cur && this.cur.track === track && this.cur.stopAt === Infinity) return;
      const now = ctx.currentTime;
      const prev = this.cur;
      if (prev) {
        prev.fadeOut(now, 1.2);
        this.fading.push(prev);
      }
      this.cur = new MusicPlayer(ch, track, now + (prev ? 0.35 : 0.08), prev ? 1.0 : 0.4);
      this.cur.setIntensity(this.intensity, now, true);
      this.ensureTimer();
      this.tick();
    } catch {
      /* no-throw */
    }
  }

  stopMusic(fadeSec = 1): void {
    try {
      this.wantTrack = null;
      const ctx = this.ctx;
      if (!ctx || !this.cur) return;
      this.cur.fadeOut(ctx.currentTime, clamp(num(fadeSec, 1), 0, 30));
      this.fading.push(this.cur);
      this.cur = null;
    } catch {
      /* no-throw */
    }
  }

  setMusicIntensity(v: number): void {
    try {
      const nv = clamp(num(v, this.intensity), 0, 1);
      if (Math.abs(nv - this.intensity) < 0.005) return; // cheap when called every frame
      this.intensity = nv;
      if (this.ctx && this.cur) this.cur.setIntensity(this.intensity, this.ctx.currentTime);
    } catch {
      /* no-throw */
    }
  }

  setPaused(p: boolean): void {
    try {
      if (!!p === this.paused) return;
      this.paused = !!p;
      this.applyPause(false);
    } catch {
      /* no-throw */
    }
  }

  /** Debug / test helper (not part of the game-facing contract). */
  debugInfo() {
    return {
      state: this.ctx ? this.ctx.state : 'none',
      failed: this.failed,
      voices: this.sfx ? this.sfx.activeVoices : 0,
      track: this.cur ? this.cur.track : null,
      wantTrack: this.wantTrack,
      fading: this.fading.length,
      world: this.world,
      paused: this.paused,
      intensity: this.intensity,
    };
  }

  // ------------------------------------------------------------------ internals
  private applyVolumes(immediate: boolean) {
    const ch = this.ch, ctx = this.ctx;
    if (!ch || !ctx) return;
    const set = (p: AudioParam, v: number) => {
      if (immediate) p.value = v;
      else p.setTargetAtTime(v, ctx.currentTime, 0.04);
    };
    // squared curve = roughly perceptual slider response
    set(ch.master.gain, this.vol.master * this.vol.master);
    set(ch.sfxVol.gain, this.vol.sfx * this.vol.sfx);
    set(ch.musicVol.gain, this.vol.music * this.vol.music * MUSIC_LEVEL);
  }

  private applyPause(immediate: boolean) {
    const ch = this.ch, ctx = this.ctx;
    if (!ch || !ctx) return;
    const p = this.paused;
    const now = ctx.currentTime;
    const set = (prm: AudioParam, v: number, tc: number) => {
      if (immediate) prm.value = v;
      else {
        prm.cancelScheduledValues(now);
        prm.setTargetAtTime(v, now, tc);
      }
    };
    set(ch.sfxGame.gain, p ? 0 : 1, 0.03);
    set(ch.musicDuck.gain, p ? 0.45 : 1, 0.15);
    set(ch.musicLP.frequency, p ? 650 : 20000, 0.12);
  }

  private ensureTimer() {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), 25);
  }

  private tick() {
    try {
      const ctx = this.ctx;
      if (!ctx) return;
      const now = ctx.currentTime;
      const hidden = typeof document !== 'undefined' && document.hidden;
      const la = hidden ? 1.2 : 0.16;
      if (this.cur) this.cur.schedule(now + la);
      for (let i = this.fading.length - 1; i >= 0; i--) {
        const f = this.fading[i];
        f.schedule(Math.min(now + la, f.stopAt));
        if (now > f.stopAt + 2) {
          f.dispose();
          this.fading.splice(i, 1);
        }
      }
      if (!this.cur && this.fading.length === 0 && this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    } catch {
      /* no-throw */
    }
  }

  private hookGestures() {
    try {
      if (this.gestureHooked || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      this.gestureHooked = true;
      // Kept for the page lifetime (cheap): unlocks on the first gesture and also recovers
      // contexts that iOS "interrupts" (calls, app switch) on the next tap.
      const evs = ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click'];
      const handler = () => {
        if (!this.failed && (!this.ctx || this.ctx.state !== 'running')) this.unlock();
      };
      for (const e of evs) window.addEventListener(e, handler, { capture: true, passive: true });
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          try {
            if (!document.hidden && this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
          } catch {
            /* ignore */
          }
        });
      }
    } catch {
      /* no-throw */
    }
  }
}

export const audio: AudioEngine = new AudioEngine();
