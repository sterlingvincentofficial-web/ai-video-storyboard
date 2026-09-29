import * as THREE from 'three';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

/** Shortest signed angle difference a->b. */
export function angleDiff(a: number, b: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Framerate-independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Deterministic PRNG (mulberry32) for level decoration. */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Direction vector from yaw/pitch (yaw 0 looks toward -Z, like three.js cameras). */
export function dirFromYawPitch(yaw: number, pitch: number, out = new THREE.Vector3()) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

export function yawTo(fromX: number, fromZ: number, toX: number, toZ: number) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function isMobileLike() {
  return isTouchDevice() && Math.min(window.innerWidth, window.innerHeight) < 900;
}

export class Pool<T> {
  items: T[] = [];
  private idx = 0;
  constructor(private make: () => T, size: number) {
    for (let i = 0; i < size; i++) this.items.push(make());
  }
  next(): T {
    const it = this.items[this.idx];
    this.idx = (this.idx + 1) % this.items.length;
    return it;
  }
}

export function formatTime(sec: number) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function hexToCss(hex: number) {
  return '#' + hex.toString(16).padStart(6, '0');
}
