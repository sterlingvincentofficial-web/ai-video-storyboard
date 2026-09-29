import * as THREE from 'three';
import type { Batcher } from '../../render/Batcher';
import { boxGeo } from '../../render/Batcher';
import { roundedBox } from '../common';

/** Places geometry into a batcher relative to a movable local frame. */
export class Placer {
  m = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  constructor(public batch: Batcher) {}

  at(x: number, y: number, z: number, rotY = 0) {
    this.m.makeRotationY(rotY).setPosition(x, y, z);
    return this;
  }

  add(geo: THREE.BufferGeometry, mat: THREE.Material, lx = 0, ly = 0, lz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this.q.setFromEuler(this.e.set(rx, ry, rz));
    this.tmp.compose(this.p.set(lx, ly, lz), this.q, this.s.set(sx, sy, sz));
    this.tmp.premultiply(this.m);
    this.batch.add(geo, mat, this.tmp);
  }

  box(mat: THREE.Material, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) {
    this.add(boxGeo(sx, sy, sz), mat, lx, ly, lz, rx, ry, rz);
  }
}

// cached primitive geometries
const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}
export const cyl = (rt: number, rb: number, h: number, seg = 10, open = false) =>
  cached(`c${rt}|${rb}|${h}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
export const sph = (r: number, ws = 12, hs = 8) => cached(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
export const hemi = (r: number, ws = 12) => cached(`h${r}|${ws}`, () => new THREE.SphereGeometry(r, ws, 6, 0, Math.PI * 2, 0, Math.PI / 2));
export const rbox = (w: number, h: number, d: number, r: number, seg = 2) => cached(`r${w}|${h}|${d}|${r}|${seg}`, () => roundedBox(w, h, d, r, seg));
export const cone = (r: number, h: number, seg = 10) => cached(`k${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
export const torus = (r: number, t: number, seg = 16) => cached(`t${r}|${t}|${seg}`, () => new THREE.TorusGeometry(r, t, 5, seg));
export const capsule = (r: number, l: number) => cached(`p${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));

export interface PropMats {
  ink: THREE.Material;
  metal: THREE.Material;
  darkMetal: THREE.Material;
  chrome: THREE.Material;
  glass: THREE.Material;
  tyre: THREE.Material;
  lampGlow: THREE.Material;
  tail: THREE.Material;
  white: THREE.Material;
  green: THREE.Material;
  red: THREE.Material;
  yellow: THREE.Material;
  concrete: THREE.Material;
  stave: THREE.Material;
  sign: THREE.Material;
  checker: THREE.Material;
  glowRed: THREE.Material;
  glowAmber: THREE.Material;
  glowGreen: THREE.Material;
  glowBlue: THREE.Material;
  mail: THREE.Material;
}

/** Retro rounded sedan / taxi / patrol car. Local frame: length along +Z (front), ground at y=0. */
export function carVisual(P: Placer, M: PropMats, body: THREE.Material, opts: { taxi?: boolean; police?: boolean; roof?: THREE.Material; signGeo?: THREE.BufferGeometry[] }) {
  P.add(rbox(1.9, 0.62, 4.4, 0.24), body, 0, 0.66, 0);
  // fenders
  for (const z of [-1.35, 1.35]) P.add(rbox(2.0, 0.5, 1.25, 0.22), body, 0, 0.7, z);
  // cabin: dark window band + roof
  P.add(rbox(1.72, 0.42, 2.25, 0.14), M.glass, 0, 1.2, 0);
  P.add(rbox(1.64, 0.24, 2.12, 0.1), opts.roof ?? body, 0, 1.46, 0);
  // pillars
  for (const x of [-0.83, 0.83]) {
    P.box(opts.roof ?? body, x, 1.2, 1.0, 0.08, 0.42, 0.14);
    P.box(opts.roof ?? body, x, 1.2, 0.0, 0.08, 0.42, 0.1);
    P.box(opts.roof ?? body, x, 1.2, -1.0, 0.08, 0.42, 0.18);
  }
  // wheels
  for (const x of [-0.86, 0.86])
    for (const z of [-1.35, 1.35]) {
      P.add(cyl(0.36, 0.36, 0.28, 14), M.tyre, x, 0.36, z, 0, 0, Math.PI / 2);
      P.add(cyl(0.17, 0.17, 0.3, 10), M.chrome, x, 0.36, z, 0, 0, Math.PI / 2);
    }
  // bumpers, grille, lights
  for (const z of [-2.22, 2.22]) P.add(rbox(2.02, 0.17, 0.22, 0.07), M.chrome, 0, 0.44, z);
  P.box(M.chrome, 0, 0.7, 2.2, 1.0, 0.24, 0.06);
  for (const x of [-0.64, 0.64]) {
    P.add(cyl(0.14, 0.14, 0.08, 12), M.lampGlow, x, 0.78, 2.18, Math.PI / 2, 0, 0);
    P.box(M.tail, x * 1.1, 0.8, -2.2, 0.22, 0.14, 0.06);
  }
  if (opts.taxi) {
    P.box(M.checker, 0, 0.82, -0.1, 1.92, 0.14, 3.0);
    P.box(M.yellow, 0, 1.68, 0, 0.62, 0.22, 0.3);
    if (opts.signGeo) {
      P.add(opts.signGeo[0], M.sign, 0, 1.68, 0.16);
      P.add(opts.signGeo[0], M.sign, 0, 1.68, -0.16, 0, Math.PI, 0);
    }
  }
  if (opts.police) {
    P.box(M.white, 0, 0.72, 0, 1.93, 0.36, 1.9);
    P.box(M.glowRed, -0.3, 1.66, 0, 0.5, 0.18, 0.3);
    P.box(M.glowBlue, 0.3, 1.66, 0, 0.5, 0.18, 0.3);
    if (opts.signGeo) {
      P.add(opts.signGeo[0], M.sign, 0.97, 0.72, 0, 0, Math.PI / 2, 0);
      P.add(opts.signGeo[0], M.sign, -0.97, 0.72, 0, 0, -Math.PI / 2, 0);
    }
  }
}

/** Box van: cargo z∈[-2.6,0.9] (2.5 tall), cab z∈[0.9,2.6]. Front = +Z. */
export function vanVisual(P: Placer, M: PropMats, body: THREE.Material, stripe: THREE.Material, signGeo?: THREE.BufferGeometry) {
  P.add(rbox(2.1, 2.2, 3.5, 0.14), body, 0, 1.38, -0.85);
  P.box(stripe, 0, 1.0, -0.85, 2.12, 0.28, 3.3);
  P.add(rbox(2.0, 1.05, 1.75, 0.26), body, 0, 0.92, 1.72);
  P.add(rbox(1.9, 0.5, 1.2, 0.16), M.glass, 0, 1.5, 1.52);
  P.add(rbox(1.84, 0.12, 1.1, 0.05), body, 0, 1.8, 1.45);
  for (const x of [-0.9, 0.9])
    for (const z of [-1.7, 1.75]) {
      P.add(cyl(0.42, 0.42, 0.3, 14), M.tyre, x, 0.42, z, 0, 0, Math.PI / 2);
      P.add(cyl(0.2, 0.2, 0.32, 10), M.chrome, x, 0.42, z, 0, 0, Math.PI / 2);
    }
  P.add(rbox(2.1, 0.2, 0.22, 0.07), M.chrome, 0, 0.45, 2.58);
  P.add(rbox(2.1, 0.2, 0.22, 0.07), M.chrome, 0, 0.45, -2.62);
  for (const x of [-0.7, 0.7]) P.add(cyl(0.15, 0.15, 0.08, 12), M.lampGlow, x, 0.85, 2.6, Math.PI / 2, 0, 0);
  if (signGeo) {
    P.add(signGeo, M.sign, 1.065, 1.75, -0.85, 0, Math.PI / 2, 0);
    P.add(signGeo, M.sign, -1.065, 1.75, -0.85, 0, -Math.PI / 2, 0);
  }
}

/** Street lamp; the arm points along local +Z. */
export function lampVisual(P: Placer, M: PropMats, h: number, globe = false) {
  P.add(cyl(0.22, 0.3, 0.7, 10), M.green, 0, 0.35, 0);
  P.add(cyl(0.07, 0.1, h, 8), M.green, 0, h / 2, 0);
  P.add(cyl(0.14, 0.14, 0.14, 10), M.green, 0, 1.3, 0);
  if (globe) {
    for (const s of [-1, 1]) {
      P.box(M.green, 0, h - 0.4, s * 0.45, 0.07, 0.07, 0.9);
      P.add(sph(0.26, 12, 8), M.lampGlow, 0, h - 0.2, s * 0.85);
      P.add(cyl(0.1, 0.16, 0.12, 8), M.green, 0, h - 0.44, s * 0.85);
    }
    P.add(sph(0.3, 12, 8), M.lampGlow, 0, h + 0.2, 0);
    return;
  }
  P.box(M.green, 0, h - 0.12, 0.7, 0.08, 0.08, 1.4);
  P.box(M.green, 0, h - 0.5, 0.3, 0.06, 0.06, 0.8, Math.PI / 4, 0, 0);
  P.add(cyl(0.12, 0.42, 0.3, 10), M.green, 0, h - 0.26, 1.35);
  P.add(sph(0.18, 10, 6), M.lampGlow, 0, h - 0.42, 1.35);
  P.add(sph(0.1, 8, 6), M.green, 0, h + 0.04, 0);
}

/** Traffic light: pole + arm along local +Z with a hanging signal. */
export function trafficVisual(P: Placer, M: PropMats, h: number) {
  P.add(cyl(0.2, 0.26, 0.5, 10), M.darkMetal, 0, 0.25, 0);
  P.add(cyl(0.09, 0.11, h, 8), M.darkMetal, 0, h / 2, 0);
  const arm = 3.6;
  P.box(M.darkMetal, 0, h - 0.3, arm / 2, 0.1, 0.1, arm);
  const signal = (lz: number, ly: number, rot: number) => {
    P.box(M.yellow, 0, ly, lz, 0.42, 1.15, 0.36, 0, rot, 0);
    for (let k = 0; k < 3; k++) {
      const mat = [M.glowRed, M.glowAmber, M.glowGreen][k];
      const on = k === 0;
      for (const s of [-1, 1]) {
        const dx = Math.sin(rot + (s < 0 ? Math.PI : 0)) * 0.19, dz = Math.cos(rot + (s < 0 ? Math.PI : 0)) * 0.19;
        P.add(cyl(0.12, 0.12, 0.05, 10), on ? mat : M.darkMetal, dx, ly + 0.34 - k * 0.34, lz + dz, Math.PI / 2, rot, 0);
      }
    }
  };
  signal(arm - 0.2, h - 0.9, Math.PI / 2);
  signal(0.25, 2.9, 0);
}

export function hydrantVisual(P: Placer, M: PropMats) {
  P.add(cyl(0.24, 0.26, 0.1, 10), M.red, 0, 0.05, 0);
  P.add(cyl(0.16, 0.18, 0.62, 10), M.red, 0, 0.4, 0);
  P.add(cyl(0.21, 0.21, 0.08, 10), M.red, 0, 0.68, 0);
  P.add(hemi(0.16, 10), M.red, 0, 0.71, 0);
  P.add(cyl(0.04, 0.04, 0.1, 6), M.red, 0, 0.9, 0);
  P.add(cyl(0.07, 0.07, 0.5, 8), M.red, 0, 0.46, 0, 0, 0, Math.PI / 2);
  P.add(cyl(0.08, 0.08, 0.18, 8), M.red, 0, 0.44, 0.15, Math.PI / 2, 0, 0);
}

export function waterTower(P: Placer, M: PropMats, r = 1.4, legH = 2.4) {
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.box(M.darkMetal, x * r * 0.7, legH / 2, z * r * 0.7, 0.14, legH, 0.14);
  P.box(M.darkMetal, 0, legH * 0.45, r * 0.7, r * 1.4, 0.08, 0.08);
  P.box(M.darkMetal, 0, legH * 0.45, -r * 0.7, r * 1.4, 0.08, 0.08);
  P.box(M.darkMetal, r * 0.7, legH * 0.45, 0, 0.08, 0.08, r * 1.4);
  P.box(M.darkMetal, -r * 0.7, legH * 0.45, 0, 0.08, 0.08, r * 1.4);
  P.add(cyl(r * 1.08, r * 1.08, 0.12, 14), M.darkMetal, 0, legH + 0.06, 0);
  const th = r * 1.7;
  P.add(cyl(r, r * 1.03, th, 16, true), M.stave, 0, legH + 0.12 + th / 2, 0);
  for (const f of [0.2, 0.5, 0.8]) P.add(torus(r * 1.02, 0.035, 18), M.darkMetal, 0, legH + 0.12 + th * f, 0, Math.PI / 2, 0, 0);
  P.add(cone(r * 1.12, r * 0.9, 16), M.darkMetal, 0, legH + 0.12 + th + r * 0.45, 0);
  P.add(sph(0.12, 8, 6), M.darkMetal, 0, legH + 0.12 + th + r * 0.92, 0);
  // ladder
  P.box(M.darkMetal, 0, legH / 2 + 0.6, r * 0.72 + 0.1, 0.4, legH + 1.2, 0.04);
}

/**
 * Fire escape on a facade. Local frame: facade plane at z=0, balconies stick out toward +Z.
 * Visual only (callers make it ghost).
 */
export function fireEscape(P: Placer, M: PropMats, width: number, y0: number, y1: number, floor = 4) {
  const dep = 1.25;
  let k = 0;
  for (let y = y0; y <= y1 + 0.01; y += floor, k++) {
    P.box(M.darkMetal, 0, y, dep / 2, width, 0.08, dep);
    // railings
    P.box(M.darkMetal, 0, y + 0.95, dep, width, 0.06, 0.06);
    P.box(M.darkMetal, 0, y + 0.5, dep, width, 0.04, 0.04);
    P.box(M.darkMetal, -width / 2, y + 0.95, dep / 2, 0.06, 0.06, dep);
    P.box(M.darkMetal, width / 2, y + 0.95, dep / 2, 0.06, 0.06, dep);
    const n = Math.max(3, Math.round(width / 0.4));
    for (let i = 0; i <= n; i++) P.box(M.darkMetal, -width / 2 + (i / n) * width, y + 0.48, dep, 0.035, 0.95, 0.035);
    for (const s of [-1, 1]) P.box(M.darkMetal, s * width / 2, y + 0.48, dep / 2 + 0.3, 0.035, 0.95, 0.035);
    // brackets
    P.box(M.darkMetal, -width / 2 + 0.2, y - 0.35, dep / 2, 0.06, 0.06, dep * 1.1, -0.55, 0, 0);
    P.box(M.darkMetal, width / 2 - 0.2, y - 0.35, dep / 2, 0.06, 0.06, dep * 1.1, -0.55, 0, 0);
    // stair to the next floor
    if (y + floor <= y1 + 0.01) {
      const run = width * 0.62;
      const ang = Math.atan2(floor, run);
      const len = Math.hypot(floor, run);
      const sx = k % 2 ? 1 : -1;
      P.box(M.darkMetal, sx * (width / 2 - run / 2 - 0.2), y + floor / 2, dep * 0.55, len, 0.07, 0.5, 0, 0, sx * ang);
      P.box(M.darkMetal, sx * (width / 2 - run / 2 - 0.2), y + floor / 2 + 0.5, dep * 0.55 + 0.26, len, 0.04, 0.04, 0, 0, sx * ang);
    }
  }
  // drop ladder at the bottom
  P.box(M.darkMetal, width / 2 - 0.5, y0 - 1.1, dep - 0.1, 0.45, 2.2, 0.04);
}

/** Bronze hero statue, feet at y=0, facing +Z. */
export function statue(P: Placer, bronze: THREE.Material, gold: THREE.Material, cape: THREE.Material) {
  // legs (wide heroic stance)
  P.add(capsule(0.2, 0.9), bronze, -0.28, 0.62, 0, 0, 0, -0.16);
  P.add(capsule(0.2, 0.9), bronze, 0.28, 0.62, 0, 0, 0, 0.16);
  P.add(rbox(0.3, 0.26, 0.5, 0.1), bronze, -0.36, 0.12, 0.06);
  P.add(rbox(0.3, 0.26, 0.5, 0.1), bronze, 0.36, 0.12, 0.06);
  // torso
  P.add(rbox(0.9, 0.5, 0.5, 0.2), bronze, 0, 1.35, 0);
  P.add(rbox(1.05, 0.72, 0.58, 0.24), bronze, 0, 1.9, 0);
  P.add(rbox(0.86, 0.14, 0.52, 0.06), gold, 0, 1.48, 0);
  // chest star
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rr = i % 2 ? 0.1 : 0.24;
    if (i) starShape.lineTo(Math.cos(a) * rr, -Math.sin(a) * rr);
    else starShape.moveTo(Math.cos(a) * rr, -Math.sin(a) * rr);
  }
  const sg = new THREE.ExtrudeGeometry(starShape, { depth: 0.06, bevelEnabled: false });
  P.add(sg, gold, 0, 1.98, 0.28);
  // head
  P.add(cyl(0.14, 0.16, 0.2, 10), bronze, 0, 2.34, 0);
  P.add(sph(0.3, 14, 10), bronze, 0, 2.62, 0.02);
  P.add(rbox(0.56, 0.12, 0.2, 0.05), gold, 0, 2.66, 0.2);
  // left arm on hip
  P.add(capsule(0.14, 0.5), bronze, -0.66, 1.92, 0, 0, 0, -0.9);
  P.add(capsule(0.13, 0.42), bronze, -0.72, 1.5, 0.05, 0, 0, 0.8);
  // right arm raised with fist
  P.add(capsule(0.14, 0.55), bronze, 0.66, 2.45, 0, 0, 0, -0.35);
  P.add(capsule(0.13, 0.5), bronze, 0.82, 3.05, 0.02, 0, 0, -0.12);
  P.add(sph(0.2, 10, 8), bronze, 0.88, 3.45, 0.02);
  // cape: open half-cylinder flaring down behind the back
  const capeG = new THREE.CylinderGeometry(0.5, 1.05, 2.1, 14, 1, true, Math.PI * 0.55, Math.PI * 0.9);
  P.add(capeG, cape, 0, 1.25, -0.12, 0.18, Math.PI, 0);
  P.add(rbox(1.1, 0.16, 0.3, 0.06), cape, 0, 2.26, -0.2);
}
