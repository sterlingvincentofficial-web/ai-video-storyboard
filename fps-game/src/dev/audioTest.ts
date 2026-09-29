/**
 * Dev-only audio test page (audio-test.html). Renders every SFX (per world) and every music track
 * through an OfflineAudioContext using the real master chain and reports objective stats.
 * Also exposes a small realtime playground. Not imported by the game.
 */
import {
  audio, createChain, SfxBank, MusicPlayer, SFX_NAMES, WORLD_IDS, MUSIC_TRACKS,
  type SfxName, type WorldId, type MusicTrack, type PlayOpts,
} from '../core/Audio';

const SR = 44100;

export interface Stat {
  peak: number; // max abs sample after the limiter
  rms: number; // RMS over the audible part
  loud: number; // max short-term (50 ms) RMS, dBFS
  dur: number; // seconds from onset to last sample above -40 dB rel. peak (and > -60 dBFS)
  nan: number;
  centroid: number; // spectral centroid (Hz) of the loudest 2048-sample window
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function analyze(buf: AudioBuffer): Stat {
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = buf.length;
  let peak = 0, nan = 0;
  for (let i = 0; i < n; i++) {
    const a = L[i], b = R[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      nan++;
      continue;
    }
    const x = Math.max(Math.abs(a), Math.abs(b));
    if (x > peak) peak = x;
  }
  const thr = Math.max(0.001, peak * 0.01);
  let first = -1, last = -1;
  for (let i = 0; i < n; i++) {
    const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (x > thr) {
      if (first < 0) first = i;
      last = i;
    }
  }
  let sum = 0;
  if (first >= 0) for (let i = first; i <= last; i++) sum += (L[i] * L[i] + R[i] * R[i]) / 2;
  const rms = first >= 0 ? Math.sqrt(sum / (last - first + 1)) : 0;
  // short-term loudness
  const win = Math.floor(SR * 0.05), hop = Math.floor(SR * 0.01);
  let loudMax = 0, loudAt = 0;
  for (let s = 0; s + win < n; s += hop) {
    let e = 0;
    for (let i = s; i < s + win; i++) e += (L[i] * L[i] + R[i] * R[i]) / 2;
    const r = Math.sqrt(e / win);
    if (r > loudMax) {
      loudMax = r;
      loudAt = s;
    }
  }
  // energy-weighted spectral centroid over the audible part (up to 32 windows) + the loudest window
  const N = 2048;
  const re = new Float64Array(N), im = new Float64Array(N);
  let nm = 0, dn = 0;
  const starts: number[] = [loudAt];
  if (first >= 0) {
    const span = Math.max(1, last - first - N);
    const cnt = Math.min(32, Math.max(1, Math.floor(span / N)));
    for (let w = 0; w < cnt; w++) starts.push(first + Math.floor((w / cnt) * span));
  }
  for (const st of starts) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < N; i++) {
      const s = (L[st + i] ?? 0) + (R[st + i] ?? 0);
      re[i] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const m = re[k] * re[k] + im[k] * im[k]; // power-weighted
      nm += m * ((k * SR) / N);
      dn += m;
    }
  }
  return {
    peak, rms, nan,
    loud: loudMax > 0 ? 20 * Math.log10(loudMax) : -120,
    dur: first >= 0 ? (last - first) / SR : 0,
    centroid: dn > 0 ? nm / dn : 0,
  };
}

async function renderSfx(name: SfxName, world: WorldId, echo: boolean, opts?: PlayOpts, secs = 3.5) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
  const ch = createChain(ctx);
  const bank = new SfxBank(ch);
  bank.world = world;
  bank.echoEnabled = echo;
  const ok = bank.play(name, opts, 0.02);
  const buf = await ctx.startRendering();
  return { ok, stat: analyze(buf) };
}

async function renderMusic(track: MusicTrack, intensity: number, secs: number) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
  const ch = createChain(ctx);
  const mp = new MusicPlayer(ch, track, 0.05, 0);
  mp.setIntensity(intensity, 0, true);
  const t0 = performance.now();
  mp.schedule(secs);
  const schedMs = performance.now() - t0;
  const buf = await ctx.startRendering();
  // skip the first 2 s (reverb build-up) for the stats of the steady part
  return { stat: analyze(buf), schedMs };
}

export interface CompCfg { thr: number; knee: number; ratio: number; att: number; rel: number }

/** Everything at once: 8 automatic weapons + explosions + music at full intensity. */
async function renderStress(cfg?: CompCfg) {
  const secs = 3;
  const ctx = new OfflineAudioContext(2, SR * secs, SR);
  const ch = createChain(ctx);
  if (cfg) {
    ch.comp.threshold.value = cfg.thr;
    ch.comp.knee.value = cfg.knee;
    ch.comp.ratio.value = cfg.ratio;
    ch.comp.attack.value = cfg.att;
    ch.comp.release.value = cfg.rel;
  }
  const bank = new SfxBank(ch);
  bank.world = 'comic';
  const mp = new MusicPlayer(ch, 'comic', 0.0, 0);
  mp.setIntensity(1, 0, true);
  mp.schedule(secs);
  let played = 0, dropped = 0, maxVoices = 0;
  const guns: SfxName[] = ['blaster', 'scatter', 'boomer', 'zapper'];
  for (let t = 0.05; t < secs - 0.5; t += 0.111) {
    for (let p = 0; p < 8; p++) {
      const name = p === 0 ? 'blaster' : guns[p % 4];
      const pos = p === 0 ? undefined : { x: Math.cos(p) * (3 + p * 2), y: 1, z: Math.sin(p) * (3 + p * 2) };
      if (bank.play(name, { pos }, t + p * 0.004)) played++;
      else dropped++;
      maxVoices = Math.max(maxVoices, bank.activeVoices);
    }
    if (Math.random() < 0.15) bank.play('explosion', { pos: { x: 5, y: 0, z: -3 } }, t + 0.02);
    bank.play('hit', undefined, t + 0.03);
    bank.play('footstep', { pos: { x: 2, y: 0, z: 1 } }, t + 0.05);
    maxVoices = Math.max(maxVoices, bank.activeVoices);
  }
  bank.play('explosion', undefined, 1.0);
  bank.play('explosion', { pos: { x: 1, y: 0, z: 1 } }, 1.001);
  bank.play('headshot', undefined, 1.01);
  bank.play('kill', undefined, 1.02);
  const buf = await ctx.startRendering();
  return { stat: analyze(buf), played, dropped, maxVoices };
}

/** Pan / distance sanity: a sound to the right of a listener looking down -Z should be louder on the right. */
async function renderPanCheck(pos: { x: number; y: number; z: number }, yaw: number) {
  const ctx = new OfflineAudioContext(2, SR * 1, SR);
  const ch = createChain(ctx);
  const bank = new SfxBank(ch);
  bank.echoEnabled = false;
  bank.yaw = yaw;
  bank.play('blaster', { pos }, 0.02);
  const buf = await ctx.startRendering();
  const e = (d: Float32Array) => {
    let s = 0;
    for (let i = 0; i < d.length; i++) s += d[i] * d[i];
    return Math.sqrt(s / d.length);
  };
  return { l: e(buf.getChannelData(0)), r: e(buf.getChannelData(1)) };
}

function realtimeApiChecks(): string[] {
  const errors: string[] = [];
  const tryIt = (label: string, f: () => void) => {
    try {
      f();
    } catch (e) {
      errors.push(`${label}: ${String(e)}`);
    }
  };
  // before unlock: all calls must be silent no-ops
  tryIt('setVolumes', () => audio.setVolumes(0.9, 0.6, 1));
  tryIt('setVolumes NaN', () => audio.setVolumes(NaN, Infinity, -3));
  tryIt('setWorld', () => audio.setWorld('neon'));
  tryIt('setWorld bad', () => audio.setWorld('nope' as unknown as WorldId));
  tryIt('setListener', () => audio.setListener({ x: 1, y: 2, z: 3 }, 0.5));
  tryIt('setListener NaN', () => audio.setListener({ x: NaN, y: 2, z: 3 }, NaN));
  tryIt('setListener null', () => audio.setListener(null as unknown as { x: number; y: number; z: number }, 0));
  for (const n of SFX_NAMES) tryIt('play ' + n, () => audio.play(n, { pos: { x: 1, y: 0, z: 1 }, volume: 1, pitch: 1 }));
  tryIt('play bad', () => audio.play('nope' as unknown as SfxName));
  tryIt('startMusic', () => audio.startMusic('menu'));
  tryIt('startMusic bad', () => audio.startMusic('nope' as unknown as MusicTrack));
  tryIt('setMusicIntensity', () => audio.setMusicIntensity(0.7));
  tryIt('setPaused', () => audio.setPaused(true));
  tryIt('setPaused', () => audio.setPaused(false));
  tryIt('stopMusic', () => audio.stopMusic(0.5));
  tryIt('startMusic again', () => audio.startMusic('menu'));
  return errors;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function realtimeUnlockedChecks() {
  const errors: string[] = [];
  const before = audio.debugInfo();
  audio.unlock();
  audio.unlock();
  for (let i = 0; i < 40 && audio.debugInfo().state !== 'running'; i++) await sleep(50);
  const afterUnlock = audio.debugInfo();
  let maxVoices = 0;
  let calls = 0;
  let playMs = 0;
  try {
    audio.setWorld('neon');
    audio.startMusic('neon');
    audio.setMusicIntensity(1);
    audio.setListener({ x: 0, y: 1.6, z: 0 }, 0);
    // 8 shooters at ~9 shots/s for 1.5 s
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      for (let p = 0; p < 8; p++) {
        const s = performance.now();
        audio.play(p % 2 ? 'blaster' : 'scatter', p === 0 ? undefined : { pos: { x: p * 3, y: 1, z: -p * 2 } });
        audio.play('footstep', { pos: { x: p, y: 0, z: p } });
        playMs += performance.now() - s;
        calls += 2;
      }
      maxVoices = Math.max(maxVoices, audio.debugInfo().voices);
      await sleep(111);
    }
    for (const n of SFX_NAMES) audio.play(n, { pos: { x: Math.random() * 20, y: 0, z: Math.random() * 20 } });
    maxVoices = Math.max(maxVoices, audio.debugInfo().voices);
    await sleep(120); // let the per-name rate limiter reset
    audio.setPaused(true);
    const v0 = audio.debugInfo().voices;
    audio.play('explosion');
    audio.play('ui_click');
    const v1 = audio.debugInfo().voices;
    audio.setPaused(false);
    audio.startMusic('menu'); // crossfade
    await sleep(600);
    const mid = audio.debugInfo();
    audio.stopMusic(0.3);
    await sleep(2600);
    const end = audio.debugInfo();
    return { errors, before, afterUnlock, maxVoices, avgPlayMs: playMs / calls, pausedVoiceDelta: v1 - v0, mid, end };
  } catch (e) {
    errors.push(String(e));
    return { errors, before, afterUnlock, maxVoices };
  }
}

const JINGLES: SfxName[] = [
  'flag_taken', 'flag_captured', 'flag_returned', 'flag_dropped', 'zone_capture', 'zone_contested',
  'countdown', 'go', 'victory', 'defeat', 'multikill', 'respawn', 'pickup_health', 'pickup_ammo',
  'pickup_weapon', 'pickup_power', 'kill', 'death', 'explosion',
];
const WEAPONS: SfxName[] = ['blaster', 'scatter', 'boomer', 'zapper'];
const UI: SfxName[] = ['ui_click', 'ui_hover', 'ui_back'];

function limitFor(n: SfxName) {
  if (WEAPONS.includes(n)) return 0.5;
  if (UI.includes(n)) return 0.2;
  if (JINGLES.includes(n)) return 3;
  return 1.5;
}

export async function runAudioTests() {
  const out: Record<string, unknown> = {};
  const failures: string[] = [];

  out.preUnlockErrors = realtimeApiChecks();
  if ((out.preUnlockErrors as string[]).length) failures.push('pre-unlock API threw');

  const sfx: Record<string, Record<string, Stat & { ok: boolean; wetPeak: number; wetNan: number }>> = {};
  for (const name of SFX_NAMES) {
    sfx[name] = {};
    for (const w of WORLD_IDS) {
      const dry = await renderSfx(name, w, false);
      const wet = await renderSfx(name, w, true, { pos: { x: 6, y: 0, z: -4 } });
      const s = { ...dry.stat, ok: dry.ok, wetPeak: wet.stat.peak, wetNan: wet.stat.nan };
      sfx[name][w] = s;
      const tag = `${name}/${w}`;
      if (!dry.ok) failures.push(`${tag}: play() returned false`);
      if (s.nan || s.wetNan) failures.push(`${tag}: NaN samples`);
      if (s.peak < 0.01) failures.push(`${tag}: silent (peak ${s.peak.toFixed(4)})`);
      if (s.peak >= 1 || s.wetPeak >= 1) failures.push(`${tag}: peak >= 1`);
      if (s.dur > limitFor(name)) failures.push(`${tag}: too long ${s.dur.toFixed(3)}s > ${limitFor(name)}`);
    }
  }
  out.sfx = sfx;

  const music: Record<string, Record<string, Stat & { schedMs: number }>> = {};
  for (const tr of MUSIC_TRACKS) {
    music[tr] = {};
    for (const I of [0, 0.5, 1]) {
      const r = await renderMusic(tr, I, 10);
      music[tr][String(I)] = { ...r.stat, schedMs: r.schedMs };
      if (r.stat.nan) failures.push(`music ${tr}@${I}: NaN`);
      if (r.stat.peak < 0.01) failures.push(`music ${tr}@${I}: silent`);
      if (r.stat.peak >= 1) failures.push(`music ${tr}@${I}: peak >= 1`);
    }
  }
  out.music = music;

  const stress = await renderStress();
  out.stress = stress;
  if (stress.stat.peak >= 1) failures.push('stress: peak >= 1');
  if (stress.stat.nan) failures.push('stress: NaN');
  if (stress.maxVoices > 24) failures.push('stress: voice cap exceeded');

  const right = await renderPanCheck({ x: 5, y: 0, z: 0 }, 0); // yaw 0, looking -Z: +X is to the right
  const leftTurned = await renderPanCheck({ x: 5, y: 0, z: 0 }, -Math.PI / 2); // yaw -90deg: looking +X → in front
  const behind = await renderPanCheck({ x: 0, y: 0, z: 5 }, 0);
  const far = await renderPanCheck({ x: 0, y: 0, z: -50 }, 0);
  const tooFar = await renderPanCheck({ x: 0, y: 0, z: -70 }, 0);
  out.pan = { right, leftTurned, behind, far, tooFar };
  if (!(right.r > right.l * 2)) failures.push('pan: +X not on the right');
  if (!(Math.abs(leftTurned.r - leftTurned.l) < 0.15 * (leftTurned.l + leftTurned.r))) failures.push('pan: yaw not applied');
  if (!(far.l < right.l)) failures.push('distance attenuation');
  if (tooFar.l + tooFar.r > 0) failures.push('> 60 m should be silent');

  out.realtime = await realtimeUnlockedChecks();
  const rt = out.realtime as { errors: string[]; maxVoices: number; pausedVoiceDelta?: number };
  if (rt.errors.length) failures.push('realtime errors');
  if (rt.maxVoices > 24) failures.push('realtime voice cap exceeded');

  out.failures = failures;
  return out;
}

// ---------------------------------------------------------------- page UI
/** Dev helper: compare limiter settings on the stress scene. */
export async function compSweep(cfgs: CompCfg[]) {
  const res = [];
  for (const c of cfgs) {
    let pk = 0, loud = 0;
    for (let i = 0; i < 3; i++) {
      const r = await renderStress(c);
      pk = Math.max(pk, r.stat.peak);
      loud += r.stat.loud / 3;
    }
    res.push({ ...c, peak: pk, loud });
  }
  return res;
}

declare global {
  interface Window {
    runAudioTests: typeof runAudioTests;
    compSweep: typeof compSweep;
    __audioResults?: unknown;
  }
}
window.runAudioTests = runAudioTests;
window.compSweep = compSweep;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const outEl = $<HTMLPreElement>('out');
const worldSel = $<HTMLSelectElement>('world');
for (const w of WORLD_IDS) worldSel.add(new Option(w, w));
worldSel.onchange = () => audio.setWorld(worldSel.value as WorldId);
$<HTMLInputElement>('intensity').oninput = (e) => audio.setMusicIntensity(Number((e.target as HTMLInputElement).value));
$<HTMLInputElement>('paused').onchange = (e) => audio.setPaused((e.target as HTMLInputElement).checked);
const spatial = $<HTMLInputElement>('spatial');
audio.setListener({ x: 0, y: 0, z: 0 }, 0);

const mdiv = $<HTMLDivElement>('music');
for (const tr of MUSIC_TRACKS) {
  const b = document.createElement('button');
  b.textContent = '♪ ' + tr;
  b.onclick = () => {
    audio.unlock();
    audio.startMusic(tr);
  };
  mdiv.appendChild(b);
}
const stopB = document.createElement('button');
stopB.textContent = '■ stop music';
stopB.onclick = () => audio.stopMusic(1);
mdiv.appendChild(stopB);

const sdiv = $<HTMLDivElement>('sfx');
for (const n of SFX_NAMES) {
  const b = document.createElement('button');
  b.textContent = n;
  b.onclick = () => {
    audio.unlock();
    const a = Math.random() * Math.PI * 2;
    audio.play(n, spatial.checked ? { pos: { x: Math.cos(a) * 10, y: 0, z: Math.sin(a) * 10 } } : undefined);
  };
  sdiv.appendChild(b);
}

$<HTMLButtonElement>('run').onclick = async () => {
  outEl.textContent = 'running…';
  const r = await runAudioTests();
  window.__audioResults = r;
  outEl.textContent = JSON.stringify(r, (_k, v) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v), 1);
};
