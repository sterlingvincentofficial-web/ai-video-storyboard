import * as THREE from 'three';
import type { WorldBuildContext } from '../types';
import type { BoxDef, RampDef } from '../../world/Level';
import { Batcher, boxGeo } from '../../render/Batcher';
import { skyDome, cloud, crateTexture, rampGeometry, stripeTexture, bunting } from '../common';
import { canvasTexture } from '../../render/Materials';
import { mulberry } from '../../core/utils';
import * as TX from './textures';
import {
  Placer, type PropMats, carVisual, vanVisual, lampVisual, trafficVisual, hydrantVisual, waterTower, fireEscape, statue,
  cyl, sph, hemi, rbox, cone,
} from './props';

export const BLUE = 0x1d5cff;
export const RED = 0xe8222e;

interface Face { x: number; z: number; nx: number; nz: number; w: number; rot: number }
function faceOf(b: BoxDef, nx: number, nz: number): Face {
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  if (nx) return { x: nx > 0 ? b.max[0] : b.min[0], z: cz, nx, nz: 0, w: b.max[2] - b.min[2], rot: Math.atan2(nx, 0) };
  return { x: cx, z: nz > 0 ? b.max[2] : b.min[2], nx: 0, nz, w: b.max[0] - b.min[0], rot: Math.atan2(0, nz) };
}

/** World position -> coordinate along a face's local X axis. */
function along(f: Face, wx: number, wz: number) {
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  return (wx - f.x) * c - (wz - f.z) * s;
}

export function buildComic(ctx: WorldBuildContext) {
  const { scene, level, mats, batch } = ctx;
  const far = new Batcher(false, false);
  const P = new Placer(batch);
  const F = new Placer(far);
  const m4 = new THREE.Matrix4();

  // ------------------------------------------------------------------ materials
  const facade = TX.FACADES.map((st, i) => {
    const t = TX.facadeTex(st, 100 + i);
    t.anisotropy = 8;
    return mats.mat(0xffffff, { map: t });
  });
  const brickPlain = mats.mat(0xffffff, { map: TX.facadeTex({ ...TX.FACADES[0], lit: 0 }, 7, false) });
  const brickOrange = mats.mat(0xffffff, { map: TX.facadeTex({ ...TX.FACADES[2], lit: 0 }, 8, false) });
  const roofMat = mats.mat(0xffffff, { map: TX.roofTex() });
  const trim = mats.mat(0xf1e4c4);
  const trimDark = mats.mat(0x3b2a33);
  const stone = mats.mat(0xd9d2c2);
  const concrete = mats.mat(0xbdb8ad);
  const asphaltTex = TX.asphaltTex();
  asphaltTex.repeat.set(15, 19);
  const asphalt = mats.mat(0xffffff, { map: asphaltTex });
  const sidewalk = mats.mat(0xffffff, { map: TX.sidewalkTex() });
  const paver = mats.mat(0xffffff, { map: TX.paverTex() });
  const storefrontM = mats.mat(0xffffff, { map: TX.storefrontTex() });
  const signM = mats.mat(0xffffff, { map: TX.signAtlas() });
  const posterM = [mats.mat(0xffffff, { map: TX.posterAtlas(0) }), mats.mat(0xffffff, { map: TX.posterAtlas(1) })];
  const billM = mats.mat(0xffffff, { map: TX.billboardAtlas() });
  const hqM = mats.mat(0xffffff, { map: TX.hqAtlas(), side: THREE.DoubleSide });
  const teamM = [mats.mat(BLUE), mats.mat(RED)];
  const white = mats.mat(0xfaf6ec);
  const paintWhite = white;
  const paintYellow = mats.mat(0xffcc1a);
  // four striped awning fabrics in one atlas (rows), stripes repeat along U
  const awningTex = canvasTexture(64, 256, (g) => {
    const cols: [string, string][] = [['#fff6e6', '#e8322b'], ['#fff6e6', '#1d5cff'], ['#fff6e6', '#2f8a4f'], ['#fff3c4', '#ff8a1f']];
    cols.forEach(([a, b], i) => {
      g.fillStyle = a;
      g.fillRect(0, i * 64, 32, 64);
      g.fillStyle = b;
      g.fillRect(32, i * 64, 32, 64);
    });
  }, { repeat: true });
  const awningM = mats.mat(0xffffff, { map: awningTex, side: THREE.DoubleSide });
  const awningV = (i: number): [number, number] => [1 - (i + 1) / 4 + 0.03, 1 - i / 4 - 0.03];
  const stripeBlue = stripeTexture('#ffffff', '#1d5cff', 8);
  const stripeRed = stripeTexture('#ffffff', '#e8222e', 8);
  const planks = mats.mat(0xffffff, { map: TX.planksTex() });
  const hazard = mats.mat(0xffffff, { map: TX.hazardTex() });
  const shutter = mats.mat(0xffffff, { map: TX.shutterTex() });
  const crateM = mats.mat(0xffffff, { map: crateTexture('#d09a55', '#8a5a2a', '#3b2412') });
  const bronze = mats.mat(0x4f9c86, { side: THREE.DoubleSide });
  const gold = mats.mat(0xf2c230);
  const hedgeM = mats.mat(0x3e9a44);
  const skyGlass = mats.mat(0x9cc8f0);
  const dumpsterM = mats.mat(0x3a7d4c);
  const carM: Record<string, THREE.Material> = {
    taxi: mats.mat(0xffc814), teal: mats.mat(0x2aa3a0), cream: mats.mat(0xf0dfb8), purple: mats.mat(0x7a4db0),
    van: mats.mat(0xf6f1e4), van2: mats.mat(0xf6f1e4), van3: mats.mat(0xffc814),
  };
  const M: PropMats = {
    ink: mats.mat(0x17111f),
    metal: mats.mat(0x8d97a6),
    darkMetal: mats.mat(0x2c2a36),
    chrome: mats.mat(0xdfe5ee),
    glass: mats.mat(0x24375f),
    tyre: mats.mat(0x1a1a20),
    lampGlow: mats.glow(0xfff0b0, 1.1),
    tail: mats.glow(0xff3a2a, 1),
    white,
    green: mats.mat(0x245a45),
    red: mats.mat(0xdd2a2a),
    yellow: mats.mat(0xffcc1a),
    concrete,
    stave: mats.mat(0xffffff, { map: TX.staveTex() }),
    sign: signM,
    checker: mats.mat(0xffffff, { map: TX.checkerTex() }),
    glowRed: mats.glow(0xff3b30, 1.2),
    glowAmber: mats.glow(0xffb020, 1),
    glowGreen: mats.glow(0x3dff7a, 1),
    glowBlue: mats.glow(0x3a7bff, 1.2),
    mail: mats.mat(0x2553b8),
  };
  const signGeo = (i: number, w: number, h: number) => TX.atlasPlane(w, h, TX.signUV(i));
  const posterGeo = (i: number, s: number) => TX.atlasPlane(s, s, TX.posterUV(i));

  // ------------------------------------------------------------------ helpers
  const storefront = (f: Face, u0: number, u1: number, variant: number, sign: number, awning: number | null, h = 3.4) => {
    P.at(f.x, 0, f.z, f.rot);
    const w = u1 - u0, uc = (u0 + u1) / 2;
    const g = new THREE.PlaneGeometry(w, h);
    const v0 = variant ? 0.005 : 0.505, v1 = variant ? 0.495 : 0.995;
    TX.uvRectGeo(g, [0, v0, w / 8, v1]);
    P.add(g, storefrontM, uc, h / 2, 0.04);
    const sw = Math.min(w * 0.72, 4.6);
    P.box(trimDark, uc, h + 0.42, 0.08, sw + 0.2, 0.84, 0.16);
    P.add(signGeo(sign, sw, sw / 8 * 1.0 > 0.7 ? 0.7 : sw / 4), signM, uc, h + 0.42, 0.17);
    if (awning !== null) {
      const [av0, av1] = awningV(awning);
      // slopes from the sign down to h-0.55 at 1.3m out, 0.25 valance -> lowest edge h-0.8
      const aw = new THREE.PlaneGeometry(w * 0.92, Math.hypot(1.3, 0.6));
      TX.uvRectGeo(aw, [0, av0, (w * 0.92) / 1.6, av1]);
      P.add(aw, awningM, uc, h - 0.25, 0.65, -Math.atan2(1.3, 0.6), 0, 0);
      const val = new THREE.PlaneGeometry(w * 0.92, 0.25);
      TX.uvRectGeo(val, [0, av0, (w * 0.92) / 1.6, av1]);
      P.add(val, awningM, uc, h - 0.675, 1.3);
    }
  };
  const poster = (f: Face, u: number, y: number, s: number, set: number, idx: number, d = 0.05) => {
    P.at(f.x, 0, f.z, f.rot);
    P.box(trimDark, u, y, d - 0.03, s + 0.24, s + 0.24, 0.06);
    P.add(posterGeo(idx, s), posterM[set], u, y, d + 0.01);
  };
  const banner = (f: Face, u: number, y: number, team: number, s = 1) => {
    P.at(f.x, 0, f.z, f.rot);
    const g = TX.atlasPlane(1.4 * s, 2.8 * s, [team * 0.25, 0, team * 0.25 + 0.25, 0.5]);
    P.add(g, hqM, u, y, 0.12);
    P.box(M.darkMetal, u, y + 1.45 * s, 0.14, 1.7 * s, 0.07, 0.07);
    P.box(M.darkMetal, u, y + 1.45 * s, 0.07, 0.05, 0.05, 0.14);
  };
  const billboard = (x: number, y: number, z: number, rot: number, w: number, idx: number, legs = 2.4) => {
    P.at(x, y, z, rot);
    const h = w / 4;
    P.box(M.darkMetal, 0, legs + h / 2, -0.1, w + 0.3, h + 0.3, 0.14);
    P.add(TX.atlasPlane(w, h, TX.billboardUV(idx)), billM, 0, legs + h / 2, 0.0);
    for (const u of [-w * 0.35, 0, w * 0.35]) {
      P.box(M.darkMetal, u, legs / 2, -0.3, 0.14, legs, 0.14);
      P.box(M.darkMetal, u, legs / 2, -1.0, 0.1, legs * 1.1, 0.1, 0.55, 0, 0);
    }
    P.box(M.darkMetal, 0, legs - 0.1, 0.3, w, 0.08, 0.7);
    for (let k = 0; k < 4; k++) {
      const u = -w / 2 + (k + 0.5) * (w / 4);
      P.box(M.darkMetal, u, legs + h + 0.3, 0.45, 0.05, 0.5, 0.05, -0.6, 0, 0);
      P.add(cone(0.22, 0.3, 8), M.darkMetal, u, legs + h + 0.5, 0.75, -2.2, 0, 0);
    }
  };
  const roofCap = (b: BoxDef, inset = 0.05) => {
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    batch.add(boxGeo(b.max[0] - b.min[0] - inset * 2, 0.02, b.max[2] - b.min[2] - inset * 2, 0.125), roofMat, m4.makeTranslation(cx, b.max[1] + 0.005, cz));
  };
  const cornice = (b: BoxDef, over = 0.3) => {
    const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const sx = b.max[0] - b.min[0], sz = b.max[2] - b.min[2];
    batch.box(trim, cx, b.max[1] - 0.18, cz, sx + over * 2, 0.36, sz + over * 2);
    batch.box(trimDark, cx, b.max[1] - 0.52, cz, sx + over * 1.2, 0.32, sz + over * 1.2);
    batch.box(trim, cx, b.max[1] - 0.8, cz, sx + over, 0.14, sz + over);
  };

  const r = mulberry(4242);

  // ------------------------------------------------------------------ boxes
  for (const b of level.boxes) {
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
    const team = ((b.data?.team as number | undefined) ?? 0) as 0 | 1;
    const half = cz >= 0 ? 0 : 1; // which team's half the object sits in
    const d = b.data ?? {};
    switch (b.kind) {
      case 'floor':
      case 'carcab':
      case 'srail':
      case 'statue':
        break;
      case 'bldg': {
        const tone = (d.tone as number) ?? 0;
        batch.add(boxGeo(sx, sy, sz, 0.125), facade[tone], m4.makeTranslation(cx, cy, cz));
        roofCap(b);
        cornice(b);
        const nx = Math.abs(cx) > 31 ? -Math.sign(cx) : 0;
        const nz = nx ? 0 : -Math.sign(cz);
        const f = faceOf(b, nx, nz);
        const seed = (d.seed as number) ?? 1;
        const rr = mulberry(seed);
        // ground floor: storefront or poster wall
        const lo = -f.w / 2 + 0.5, hi = f.w / 2 - 0.5;
        if (rr() < 0.72) storefront(f, lo, hi, Math.floor(rr() * 2), Math.floor(rr() * 7), Math.floor(rr() * 4));
        else {
          P.at(f.x, 0, f.z, f.rot);
          P.box(trimDark, 0, 0.5, 0.05, f.w - 0.6, 1.0, 0.1);
          const n = Math.max(1, Math.floor((f.w - 1) / 3.6));
          for (let k = 0; k < n; k++) poster(f, -((n - 1) * 3.6) / 2 + k * 3.6, 2.6, 3.0, half, Math.floor(rr() * 4), 0.08);
        }
        // fire escape
        if (d.fire && sy >= 11) {
          const u = (rr() - 0.5) * (f.w - 5);
          const c = Math.cos(f.rot), s = Math.sin(f.rot);
          P.at(f.x + u * c, 0, f.z - u * s, f.rot);
          fireEscape(P, M, 3.4, 4.6, Math.floor((sy - 3.5) / 4) * 4 + 0.6);
        }
        // team banners on upper floors
        if (Math.abs(cz) > 6 && rr() < 0.6) {
          const u = (rr() - 0.5) * (f.w - 3);
          banner(f, u, Math.min(sy - 3.5, 9), half);
        }
        if (d.tower) {
          P.at(cx + (rr() - 0.5) * 2 * nz, b.max[1], cz + (rr() - 0.5) * 2 * nx);
          waterTower(P, M, 1.3 + rr() * 0.4, 2.0 + rr() * 1.0);
        }
        if (d.bill) billboard(f.x - f.nx * 3.5, b.max[1], f.z - f.nz * 3.5, f.rot, 9, half === 0 ? 0 : 2);
        break;
      }
      case 'hq': {
        const f = faceOf(b, 0, -Math.sign(cz));
        batch.add(boxGeo(sx, sy, sz, 0.125), facade[3], m4.makeTranslation(cx, cy, cz));
        roofCap(b);
        P.at(f.x, 0, f.z, f.rot);
        // art-deco pilasters
        for (let k = 0; k <= 8; k++) {
          const u = -f.w / 2 + 0.3 + k * ((f.w - 0.6) / 8);
          P.box(trim, u, 5 + (sy - 5) / 2, 0.15, 0.55, sy - 5, 0.3);
        }
        P.box(teamM[team], 0, 4.9, 0.25, f.w + 0.2, 0.5, 0.5);
        P.box(trim, 0, 5.3, 0.3, f.w + 0.4, 0.3, 0.6);
        // setback crown
        for (let t = 0; t < 3; t++) {
          const w = sx - 4 - t * 4.5, dd = sz - 2 - t * 1.6, hh = 3 - t * 0.5;
          const y0 = sy + t * 3 - t * 0.3;
          batch.box(facade[3], cx, y0 + hh / 2, cz, w, hh, dd);
          batch.box(teamM[team], cx, y0 + hh - 0.25, cz, w + 0.2, 0.5, dd + 0.2);
        }
        // flag
        P.at(cx, sy + 7.8, cz);
        P.add(cyl(0.08, 0.1, 7, 6), M.darkMetal, 0, 3.5, 0);
        P.add(sph(0.2, 8, 6), gold, 0, 7.1, 0);
        const flag = TX.atlasPlane(2.2, 3.2, [team * 0.25, 0, team * 0.25 + 0.25, 0.5]);
        flag.rotateZ(Math.PI / 2);
        P.add(flag, hqM, 1.65, 6.0, 0);
        // entrance
        P.at(f.x, 0, f.z, f.rot);
        P.box(trimDark, 0, 3.1, 0.06, 6.2, 3.8, 0.12);
        P.box(M.glass, -1.3, 3.0, 0.14, 2.3, 3.1, 0.06);
        P.box(M.glass, 1.3, 3.0, 0.14, 2.3, 3.1, 0.06);
        P.box(gold, 0, 3.0, 0.18, 0.12, 3.1, 0.06);
        // canopy (visual overhang)
        P.box(teamM[team], 0, 5.35, 1.6, 9, 0.35, 3.2);
        P.box(trim, 0, 5.1, 1.6, 9.2, 0.15, 3.3);
        for (const s of [-1, 1]) P.box(M.darkMetal, s * 4.2, 5.8, 1.6, 0.06, 0.06, 3.0, 0.5, 0, 0);
        // marquee + emblem
        const sg = TX.atlasPlane(9, 2.25, [0, team ? 0.5 : 0.75, 1, team ? 0.75 : 1]);
        P.box(trimDark, 0, 7.3, 0.4, 9.4, 2.6, 0.2);
        P.add(sg, hqM, 0, 7.3, 0.52);
        const emb = new THREE.Shape();
        if (team === 0) {
          for (let i = 0; i < 10; i++) {
            const a = Math.PI / 2 + (i / 10) * Math.PI * 2, rr2 = i % 2 ? 0.9 : 2.1;
            if (i) emb.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
            else emb.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
          }
        } else {
          const pts = [[0.5, 2.1], [-1.2, -0.2], [-0.1, -0.2], [-0.8, -2.2], [1.3, 0.5], [0.2, 0.5], [1.0, 2.1]];
          pts.forEach(([x, y], i) => (i ? emb.lineTo(x, y) : emb.moveTo(x, y)));
        }
        const eg = new THREE.ExtrudeGeometry(emb, { depth: 0.3, bevelEnabled: false });
        P.add(eg, gold, 0, 11.8, 0.62);
        P.add(eg, white, 0, 11.8, 0.47, 0, 0, 0, 1.22, 1.22, 1);
        P.add(new THREE.CylinderGeometry(2.9, 2.9, 0.3, 28), teamM[team], 0, 11.8, 0.3, Math.PI / 2, 0, 0);
        P.add(new THREE.TorusGeometry(3.0, 0.16, 6, 28), gold, 0, 11.8, 0.46);
        banner(f, -7.4, 8.6, team, 1.4);
        banner(f, 7.4, 8.6, team, 1.4);
        break;
      }
      case 'sidewalk':
        batch.add(boxGeo(sx, sy, sz, 0.25), sidewalk, m4.makeTranslation(cx, cy, cz));
        break;
      case 'median':
        batch.add(boxGeo(sx, sy, sz, 0.25), sidewalk, m4.makeTranslation(cx, cy, cz));
        break;
      case 'shop': {
        batch.add(boxGeo(sx, sy - 0.02, sz, 0.125), brickOrange, m4.makeTranslation(cx, cy - 0.01, cz));
        batch.add(boxGeo(sx - 0.02, 0.02, sz - 0.02, 0.125), roofMat, m4.makeTranslation(cx, b.max[1] - 0.005, cz));
        const sgn = team === 0 ? 1 : -1;
        const fa = faceOf(b, -sgn, 0); // avenue side
        const fc = faceOf(b, 0, -sgn); // centre side
        const fb = faceOf(b, 0, sgn); // base side
        const fl = faceOf(b, sgn, 0); // alley side
        // avenue: diner (left of the pad) + comics shop
        const padU = along(fa, 9.4 * sgn, 21.5 * sgn);
        const lo = -fa.w / 2 + 0.4, hi = fa.w / 2 - 0.4;
        const a0 = Math.min(padU - 2.2, padU + 2.2), a1 = Math.max(padU - 2.2, padU + 2.2);
        storefront(fa, lo, a0, 0, 0, 0, 2.9);
        storefront(fa, a1, hi, 1, 1, 3, 2.9);
        P.at(fa.x, 0, fa.z, fa.rot);
        P.add(posterGeo(team === 0 ? 1 : 3, 2.4), posterM[team], padU, 1.5, 0.06);
        storefront(fc, -fc.w / 2 + 0.4, fc.w / 2 - 0.4, 1, 5, team === 0 ? 1 : 0, 2.9);
        storefront(fb, -fb.w / 2 + 0.4, fb.w / 2 - 0.4, 0, 6, 2, 2.9);
        // alley side: back door and a poster
        P.at(fl.x, 0, fl.z, fl.rot);
        P.box(trimDark, along(fl, 20 * sgn, 14.3 * sgn), 1.2, 0.05, 1.3, 2.4, 0.1);
        break;
      }
      case 'booth': {
        P.at(cx, 0.3, cz, d.mirrored ? Math.PI : 0);
        const hb = sy - 0.3;
        P.box(M.darkMetal, 0, 0.05, 0, sx, 0.1, sz);
        for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.box(M.red, x * (sx / 2 - 0.06), hb / 2, z * (sz / 2 - 0.06), 0.12, hb, 0.12);
        P.box(M.red, 0, hb - 0.12, 0, sx + 0.08, 0.24, sz + 0.08);
        P.box(M.red, 0, 0.25, 0, sx - 0.04, 0.3, sz - 0.04);
        P.box(skyGlass, 0, 1.35, 0, sx - 0.1, 1.9, sz - 0.1);
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2, dx = Math.sin(a) * (sx / 2 + 0.045), dz = Math.cos(a) * (sz / 2 + 0.045);
          P.add(signGeo(14, 0.84, 0.2), signM, dx, hb - 0.12, dz, 0, a, 0);
          P.box(M.red, dx * 0.99, 1.35, dz * 0.99, Math.abs(dz) > 0.1 ? sx - 0.2 : 0.06, 0.07, Math.abs(dx) > 0.1 ? sz - 0.2 : 0.06);
        }
        P.box(M.darkMetal, 0, 1.4, -sz / 2 + 0.15, 0.25, 0.4, 0.12);
        break;
      }
      case 'vent': {
        P.at(cx, b.min[1], cz);
        P.box(M.metal, 0, sy / 2, 0, sx, sy, sz);
        P.box(M.darkMetal, 0, sy + 0.03, 0, sx + 0.1, 0.06, sz + 0.1);
        P.add(cyl(0.16, 0.16, 0.5, 10), M.metal, sx * 0.2, sy + 0.25, 0);
        P.add(cone(0.3, 0.25, 10), M.darkMetal, sx * 0.2, sy + 0.6, 0);
        break;
      }
      case 'skylight': {
        P.at(cx, b.min[1], cz);
        P.box(trim, 0, sy * 0.4, 0, sx, sy * 0.8, sz);
        const pyr = new THREE.ConeGeometry(Math.hypot(sx, sz) / 2 - 0.1, sy * 0.5, 4, 1);
        pyr.rotateY(Math.PI / 4);
        P.add(pyr, skyGlass, 0, sy * 0.8 + sy * 0.25, 0, 0, 0, 0, sx / Math.hypot(sx, sz) * 1.41, 1, sz / Math.hypot(sx, sz) * 1.41);
        break;
      }
      case 'parapet':
        batch.add(boxGeo(sx, sy - 0.1, sz, 0.125), brickOrange, m4.makeTranslation(cx, cy - 0.05, cz));
        batch.box(trim, cx, b.max[1] - 0.05, cz, sx + 0.12, 0.1, sz + 0.12);
        break;
      case 'bulkhead': {
        batch.add(boxGeo(sx, sy, sz, 0.125), brickPlain, m4.makeTranslation(cx, cy, cz));
        batch.box(trim, cx, b.max[1] + 0.06, cz, sx + 0.2, 0.12, sz + 0.2);
        const sgn = team === 0 ? 1 : -1;
        const f = faceOf(b, -sgn, 0);
        P.at(f.x, 0, f.z, f.rot);
        P.box(trimDark, 0, b.min[1] + 1.1, 0.04, 1.1, 2.2, 0.08);
        P.at(cx, b.max[1] + 0.12, cz);
        waterTower(P, M, 1.25, 1.9);
        break;
      }
      case 'brown': {
        batch.add(boxGeo(sx, sy, sz, 0.125), facade[1], m4.makeTranslation(cx, cy, cz));
        roofCap(b);
        cornice(b, 0.35);
        const sgn = team === 0 ? 1 : -1;
        const fa = faceOf(b, sgn, 0); // avenue side (+x for blue twin)
        const fc = faceOf(b, 0, -sgn);
        const fb = faceOf(b, 0, sgn);
        const fl = faceOf(b, -sgn, 0); // alley side
        const stoopU = along(fa, -10.45 * sgn, 20 * sgn);
        storefront(fa, -fa.w / 2 + 0.4, Math.min(stoopU - 1.5, stoopU + 1.5), 0, 2, 1, 3.2);
        storefront(fa, Math.max(stoopU - 1.5, stoopU + 1.5), fa.w / 2 - 0.4, 1, 3, 0, 3.2);
        P.at(fa.x, 0, fa.z, fa.rot);
        P.box(trimDark, stoopU, 1.75, 0.05, 1.6, 2.7, 0.1);
        P.box(M.glass, stoopU, 2.3, 0.1, 1.1, 1.2, 0.04);
        P.box(trim, stoopU, 3.25, 0.12, 2.0, 0.3, 0.24);
        // big murals facing the intersection and the base street
        poster(fc, 0, 4.2, 5.2, team, 0, 0.1);
        poster(fb, 0, 4.4, 4.6, team, team === 0 ? 1 : 2, 0.1);
        // loading door + fire escape on the alley side
        P.at(fl.x, 0, fl.z, fl.rot);
        const du = along(fl, -20 * sgn, 20 * sgn);
        P.box(trimDark, du, 2.75, 0.04, 5.6, 3.3, 0.08);
        const sh = new THREE.PlaneGeometry(5.0, 2.7);
        TX.uvRectGeo(sh, [0, 0, 2.5, 1.4]);
        P.add(sh, shutter, du, 2.6, 0.1);
        P.box(teamM[team], du, 4.35, 0.5, 6.2, 0.12, 1.0, 0.25, 0, 0);
        P.add(signGeo(10, 2.2, 0.55), signM, du, 4.75, 0.1);
        P.at(fl.x, 0, fl.z, fl.rot);
        fireEscape(P, M, 3.4, 5.0, 9.0);
        P.at(cx - sgn * 1.5, b.max[1], cz + sgn * 2);
        waterTower(P, M, 1.5, 2.6);
        banner(fa, stoopU, 6.8, team);
        break;
      }
      case 'dock': {
        batch.box(concrete, cx, cy, cz, sx, sy, sz);
        const sgn = team === 0 ? 1 : -1;
        const f = faceOf(b, -sgn, 0);
        P.at(f.x, 0, f.z, f.rot);
        const hz = new THREE.PlaneGeometry(f.w, 0.22);
        TX.uvRectGeo(hz, [0, 0, f.w / 1.0, 1]);
        P.add(hz, hazard, 0, sy - 0.11, 0.01);
        for (let k = -2; k <= 2; k++) P.box(M.tyre, k * 1.9, sy - 0.45, 0.06, 0.4, 0.5, 0.12);
        P.box(M.darkMetal, 0, sy + 0.01, -0.12, f.w, 0.03, 0.25);
        break;
      }
      case 'stoop':
        batch.box(stone, cx, cy, cz, sx, sy, sz);
        batch.box(teamM[team], cx, b.max[1] + 0.01, cz, sx - 1.2, 0.02, sz - 0.6);
        batch.box(trim, cx, b.max[1] - 0.06, cz, sx + 0.1, 0.12, sz + 0.1);
        break;
      case 'stoop1':
        batch.box(stone, cx, cy, cz, sx, sy, sz);
        batch.box(trim, cx, b.max[1] - 0.04, cz, sx + 0.06, 0.08, sz + 0.06);
        break;
      case 'newsstand': {
        P.at(cx, 0, cz);
        P.box(M.green, 0, 1.15, 0, sx, 2.3, sz);
        P.box(M.green, 0, 2.5, 0, sx + 0.7, 0.2, sz + 0.9);
        P.box(trim, 0, 2.38, 0, sx + 0.72, 0.06, sz + 0.92);
        for (const s of [-1, 1]) {
          P.at(cx, 0, cz, s > 0 ? 0 : Math.PI);
          P.add(TX.atlasPlane(2.0, 1.25, [0.5, 0, 1, 0.3125]), hqM, 0, 1.45, sz / 2 + 0.02);
          P.box(M.darkMetal, 0, 0.8, sz / 2 + 0.15, sx, 0.08, 0.3);
          P.box(trimDark, 0, 2.95, sz / 2 + 0.3, 2.3, 0.7, 0.12);
          P.add(signGeo(9, 2.1, 0.55), signM, 0, 2.95, sz / 2 + 0.37);
          // stacks of papers
          for (let k = -2; k <= 2; k++) P.box(k % 2 ? paintWhite : M.yellow, k * 0.42, 0.95, sz / 2 + 0.2, 0.32, 0.22, 0.24);
        }
        break;
      }
      case 'column': {
        P.at(cx, 0, cz);
        P.add(cyl(0.7, 0.72, 0.3, 16), M.green, 0, 0.15, 0);
        const cg = new THREE.CylinderGeometry(0.62, 0.62, 2.5, 20, 1, true);
        TX.uvRectGeo(cg, [0, 0.5, 2, 1]);
        P.add(cg, posterM[team], 0, 1.55, 0);
        P.add(cyl(0.72, 0.66, 0.24, 16), M.green, 0, 2.9, 0);
        P.add(hemi(0.62, 16), M.green, 0, 3.0, 0);
        P.add(sph(0.12, 8, 6), gold, 0, 3.66, 0);
        break;
      }
      case 'car': {
        const col = d.color as string;
        let rot = d.alongX ? Math.PI / 2 : 0;
        if (d.van) {
          const front = (d.front as number) ?? 1;
          const vx = d.mirrored ? -(d.cx as number) : (d.cx as number), vz = d.mirrored ? -(d.cz as number) : (d.cz as number);
          rot = d.alongX ? (front > 0 ? Math.PI / 2 : -Math.PI / 2) : front > 0 ? 0 : Math.PI;
          if (d.mirrored) rot += Math.PI;
          P.at(vx, 0, vz, rot);
          vanVisual(P, M, carM[col] ?? white, teamM[half], signGeo(8, 3.2, 0.4));
          break;
        }
        if (d.mirrored) rot += Math.PI;
        P.at(cx, 0, cz, rot);
        if (col === 'police') carVisual(P, M, teamM[half], { police: true, roof: white, signGeo: [signGeo(half ? 15 : 12, 1.6, 0.2)] });
        else carVisual(P, M, carM[col] ?? carM.teal, { taxi: col === 'taxi', signGeo: [signGeo(7, 0.56, 0.14)] });
        break;
      }
      case 'barrier': {
        P.at(cx, 0, cz, sx > sz ? 0 : Math.PI / 2);
        const len = Math.max(sx, sz), dep = Math.min(sx, sz);
        const shape = new THREE.Shape();
        shape.moveTo(-dep / 2, 0);
        shape.lineTo(dep / 2, 0);
        shape.lineTo(dep / 2 - 0.1, 0.3);
        shape.lineTo(0.14, 1.1);
        shape.lineTo(-0.14, 1.1);
        shape.lineTo(-dep / 2 + 0.1, 0.3);
        shape.closePath();
        const eg = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
        eg.translate(0, 0, -len / 2);
        eg.rotateY(Math.PI / 2);
        P.add(eg, concrete, 0, 0, 0);
        const stripes = new THREE.PlaneGeometry(len - 0.2, 0.3);
        TX.uvRectGeo(stripes, [0, 0, (len - 0.2) / 0.9, 1]);
        const stM = mats.mat(0xffffff, { map: team === 0 ? stripeBlue : stripeRed });
        P.add(stripes, stM, 0, 0.62, 0.22, -0.2, 0, 0);
        P.add(stripes, stM, 0, 0.62, -0.22, -0.2, Math.PI, 0);
        break;
      }
      case 'traffic':
      case 'lamp': {
        const arm = (d.arm as [number, number]) ?? [0, 1];
        let rot = Math.atan2(arm[0], arm[1]);
        if (d.mirrored) rot += Math.PI;
        P.at(cx, 0, cz, rot);
        if (b.kind === 'traffic') trafficVisual(P, M, sy);
        else lampVisual(P, M, sy, !!d.globe, d.globe ? undefined : { geo: TX.atlasPlane(0.8, 1.6, [half * 0.25, 0, half * 0.25 + 0.25, 0.5]), mat: hqM });
        break;
      }
      case 'hydrant':
        P.at(cx, 0, cz, cx * 0.3);
        hydrantVisual(P, M);
        break;
      case 'mailbox': {
        P.at(cx, 0, cz, d.mirrored ? Math.PI : 0);
        for (const [x, z] of [[-0.28, -0.2], [0.28, -0.2], [-0.28, 0.2], [0.28, 0.2]]) P.box(M.darkMetal, x, 0.15, z, 0.07, 0.3, 0.07);
        P.add(rbox(0.72, 0.8, 0.56, 0.06), M.mail, 0, 0.7, 0);
        P.add(cyl(0.36, 0.36, 0.56, 14, false), M.mail, 0, 1.08, 0, Math.PI / 2, 0, Math.PI / 2);
        P.add(signGeo(13, 0.5, 0.13), signM, 0.37, 0.85, 0, 0, Math.PI / 2, 0);
        P.add(signGeo(13, 0.5, 0.13), signM, -0.37, 0.85, 0, 0, -Math.PI / 2, 0);
        P.box(M.darkMetal, 0, 1.08, 0.29, 0.4, 0.08, 0.02);
        break;
      }
      case 'dumpster': {
        P.at(cx, 0, cz, sx > sz ? 0 : Math.PI / 2);
        const len = Math.max(sx, sz), dep = Math.min(sx, sz);
        P.add(rbox(len, sy - 0.25, dep, 0.06), dumpsterM, 0, 0.2 + (sy - 0.25) / 2, 0);
        P.box(M.darkMetal, 0, sy - 0.02, 0.05, len + 0.1, 0.1, dep + 0.08, -0.08, 0, 0);
        P.box(M.darkMetal, 0, 0.55, dep / 2 + 0.02, len, 0.08, 0.04);
        for (const u of [-len / 2 + 0.25, len / 2 - 0.25]) for (const s of [-1, 1]) P.add(cyl(0.1, 0.1, 0.08, 8), M.tyre, u, 0.1, s * (dep / 2 - 0.15), Math.PI / 2, 0, 0);
        break;
      }
      case 'trash': {
        P.at(cx, 0, cz);
        P.add(cyl(sx * 0.45, sx * 0.4, sy - 0.08, 12), M.metal, 0, (sy - 0.08) / 2, 0);
        for (const y of [0.25, 0.6]) P.add(cyl(sx * 0.47, sx * 0.47, 0.05, 12), M.darkMetal, 0, y, 0);
        P.add(cyl(sx * 0.5, sx * 0.5, 0.06, 12), M.metal, 0, sy - 0.05, 0);
        P.add(sph(0.06, 6, 4), M.darkMetal, 0, sy + 0.02, 0);
        break;
      }
      case 'crate':
        batch.add(rbox(sx, sy, sz, 0.05, 1), crateM, m4.makeTranslation(cx, cy, cz));
        break;
      case 'hoarding': {
        P.at(cx, 0, cz, sx > sz ? 0 : Math.PI / 2);
        const len = Math.max(sx, sz), dep = Math.min(sx, sz);
        const pg = new THREE.BoxGeometry(len, sy, dep);
        TX.uvRectGeo(pg, [0, 0, len / 4, sy / 4]);
        P.add(pg, planks, 0, sy / 2, 0);
        P.box(trimDark, 0, sy + 0.05, 0, len + 0.1, 0.1, dep + 0.1);
        for (const s of [-1, 1]) {
          for (let k = 0; k < 2; k++) {
            P.at(cx, 0, cz, (sx > sz ? 0 : Math.PI / 2) + (s < 0 ? Math.PI : 0));
            P.add(posterGeo((k + (s > 0 ? 0 : 2)) % 4, 1.9), posterM[half], -1.1 + k * 2.2, 1.35, dep / 2 + 0.02, 0, 0, (k ? -0.04 : 0.05));
          }
        }
        break;
      }
      case 'crashsign': {
        // fallen rooftop billboard wedged into the street
        P.at(cx, 0, cz, sz > sx ? Math.PI / 2 : 0);
        const len = Math.max(sx, sz);
        P.box(M.darkMetal, 0, sy / 2, 0, len - 0.1, sy - 0.1, 0.22, 0.1, 0, 0.03);
        P.add(TX.atlasPlane(len - 0.4, (len - 0.4) / 4, TX.billboardUV(team === 0 ? 1 : 3)), billM, 0, sy / 2 + 0.1, 0.14, 0.1, 0, 0.03);
        P.add(TX.atlasPlane(len - 0.4, (len - 0.4) / 4, TX.billboardUV(team === 0 ? 3 : 1)), billM, 0, sy / 2 + 0.1, -0.14, -0.1, Math.PI, -0.03);
        // bent girders sticking up
        P.box(M.darkMetal, -len * 0.3, sy + 0.9, 0.1, 0.14, 2.6, 0.14, 0.35, 0, 0.5);
        P.box(M.darkMetal, len * 0.25, sy + 0.5, -0.1, 0.14, 2.0, 0.14, -0.3, 0, -0.7);
        P.box(M.darkMetal, len * 0.05, sy + 0.2, 0.05, 1.8, 0.1, 0.1, 0, 0, 0.25);
        // rubble
        const rr2 = mulberry(Math.round(cx * 13 + cz * 7));
        for (let k = 0; k < 9; k++) {
          const g = new THREE.DodecahedronGeometry(0.18 + rr2() * 0.22, 0);
          P.add(g, k % 3 ? concrete : brickOrange, (rr2() - 0.5) * len, 0.08, (rr2() > 0.5 ? 1 : -1) * (0.45 + rr2() * 0.4), rr2(), rr2(), rr2(), 1, 0.55, 1);
        }
        break;
      }
      case 'hedge': {
        batch.add(rbox(sx, 0.6, sz, 0.06), concrete, m4.makeTranslation(cx, 0.3, cz));
        batch.box(trim, cx, 0.62, cz, sx + 0.08, 0.06, sz + 0.08);
        batch.add(rbox(sx - 0.2, sy - 0.6, sz - 0.2, 0.22, 2), hedgeM, m4.makeTranslation(cx, 0.6 + (sy - 0.6) / 2, cz));
        const rr2 = mulberry(Math.round(cx * 11 + cz * 3 + 99));
        for (let k = 0; k < 7; k++) batch.add(sph(0.09, 6, 4), k % 2 ? M.red : M.yellow, m4.makeTranslation(cx + (rr2() - 0.5) * (sx - 0.4), sy + 0.02, cz + (rr2() - 0.5) * (sz - 0.4)));
        break;
      }
      case 'island': {
        batch.add(boxGeo(sx, sy, sz, 0.25), paver, m4.makeTranslation(cx, cy, cz));
        batch.box(stone, cx, sy - 0.02, b.min[2] + 0.15, sx, 0.06, 0.3);
        batch.box(stone, cx, sy - 0.02, b.max[2] - 0.15, sx, 0.06, 0.3);
        batch.box(stone, b.min[0] + 0.15, sy - 0.02, cz, 0.3, 0.06, sz);
        batch.box(stone, b.max[0] - 0.15, sy - 0.02, cz, 0.3, 0.06, sz);
        break;
      }
      case 'pedestal': {
        P.at(cx, 0, cz);
        P.box(stone, 0, 0.35, 0, sx, 0.7, sz);
        P.box(trim, 0, 0.72, 0, sx + 0.1, 0.08, sz + 0.1);
        P.box(stone, 0, 1.55, 0, sx - 0.24, 1.6, sz - 0.24);
        P.box(trim, 0, sy - 0.2, 0, sx - 0.2, 0.4, sz - 0.2);
        for (const rot of [0, Math.PI]) {
          P.at(cx, 0, cz, rot);
          P.box(trimDark, 0, 1.55, (sz - 0.24) / 2 + 0.02, 1.9, 0.8, 0.04);
          P.add(TX.atlasPlane(1.8, 0.68, [0.5, 0.3125, 1, 0.5]), hqM, 0, 1.55, (sz - 0.24) / 2 + 0.05);
        }
        P.at(0, sy, 0, Math.PI / 2 + 0.25);
        statue(P, bronze, gold, bronze);
        break;
      }
      default:
        batch.box(stone, cx, cy, cz, sx, sy, sz);
    }
  }

  // ------------------------------------------------------------------ ramps
  for (const rd of level.ramps) rampVisual(rd);

  function rampVisual(rd: RampDef) {
    const len = rd.axis === 'x' ? rd.max[0] - rd.min[0] : rd.max[2] - rd.min[2];
    const wid = rd.axis === 'x' ? rd.max[2] - rd.min[2] : rd.max[0] - rd.min[0];
    const hAt = (t: number) => rd.h0 + (rd.h1 - rd.h0) * (rd.dir === 1 ? t : 1 - t);
    const pos = (t: number, s: number): [number, number] => {
      const a = (rd.axis === 'x' ? rd.min[0] : rd.min[2]) + t * len;
      const c = rd.axis === 'x' ? (rd.min[2] + rd.max[2]) / 2 : (rd.min[0] + rd.max[0]) / 2;
      return rd.axis === 'x' ? [a, c + s] : [c + s, a];
    };
    const geo = rampGeometry(rd);
    if (rd.kind === 'fescape') {
      batch.add(geo, brickOrange);
      const n = Math.round(len / 0.5);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const [x, z] = pos(t, 0);
        const h = hAt(t);
        batch.box(M.darkMetal, x, h + 0.02, z, rd.axis === 'x' ? 0.3 : wid, 0.06, rd.axis === 'x' ? wid : 0.3);
      }
      // outer railing follows the slope (collision is the stepped 'srail' boxes)
      const outer = rd.min[0] + (rd.max[0] - rd.min[0]) / 2 > 0 ? rd.max[0] - 0.1 : rd.min[0] + 0.1;
      const cxr = rd.axis === 'z' ? outer - (rd.min[0] + rd.max[0]) / 2 : 0;
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const [x, z] = pos(t, cxr);
        const h = hAt(t);
        batch.box(M.darkMetal, x, h + 0.48, z, 0.07, 0.96, 0.07);
      }
      const [xa, za] = pos(0, cxr), [xb, zb] = pos(1, cxr);
      const ha = hAt(0) + 0.95, hb = hAt(1) + 0.95;
      const L = Math.hypot(xb - xa, zb - za, hb - ha);
      const rail = new THREE.Mesh(boxGeo(0.09, 0.09, L));
      rail.position.set((xa + xb) / 2, (ha + hb) / 2, (za + zb) / 2);
      rail.lookAt(xb, hb, zb);
      rail.updateMatrixWorld();
      batch.add(rail.geometry, M.darkMetal, rail.matrixWorld);
      rail.position.y -= 0.45;
      rail.updateMatrixWorld();
      batch.add(boxGeo(0.05, 0.05, L), M.darkMetal, rail.matrixWorld);
      // brick side wall face toward the alley
      return;
    }
    batch.add(geo, rd.kind === 'steps' ? stone : concrete);
    const n = Math.floor(len / (rd.kind === 'steps' ? 0.35 : 0.6));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const [x, z] = pos(t, 0);
      const h = hAt(t);
      batch.box(rd.kind === 'steps' ? trim : hazard, x, h + 0.01, z, rd.axis === 'x' ? 0.06 : wid, 0.03, rd.axis === 'x' ? wid : 0.06);
    }
  }

  // ------------------------------------------------------------------ ground & road markings
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 152), asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const decal = (mat: THREE.Material, x: number, z: number, w: number, d: number, y = 0.025, rot = 0) => {
    far.box(mat, x, y - 0.012, z, w, 0.024, d, rot);
  };
  for (const s of [1, -1]) {
    // zebra crossings across the avenue near the roundabout and near the base
    for (let k = 0; k < 8; k++) decal(paintWhite, s * (-6.3 + k * 1.8), s * 9.6, 0.8, 2.6);
    // zebra across the alleys
    for (let k = 0; k < 3; k++) decal(paintWhite, s * (22.6 + k * 1.8), s * 10.3, 0.8, 2.4);
    for (let k = 0; k < 3; k++) decal(paintWhite, s * -(22.6 + k * 1.8), s * 10.3, 0.8, 2.4);
    // lane dashes on the avenue
    for (let z = 12; z < 28.5; z += 3) {
      decal(paintWhite, s * 4.2, s * (z + 0.75), 0.18, 1.5);
      decal(paintWhite, s * -4.2, s * (z + 0.75), 0.18, 1.5);
    }
    decal(paintYellow, s * 0.14, s * 14.2, 0.12, 5.4);
    decal(paintYellow, s * -0.14, s * 14.2, 0.12, 5.4);
    // stop line
    decal(paintWhite, s * 0, s * 11.2, 15.5, 0.3);
    // centre line on the cross street
    for (let x = 9; x < 27; x += 3) decal(paintWhite, s * (x + 0.75), 0, 1.5, 0.18);
    // parking lines on the base street
    for (let x = -26; x <= 26; x += 5.5) if (Math.abs(x) > 9) decal(paintWhite, x * s, s * 39.6, 0.14, 2.2);
  }
  // "HERO LANE" / "VILLAIN LANE" painted on the avenue
  const laneTex = TX.inkTex(512, 128, (g, w, h) => {
    TX.inkText(g, 'HERO LANE', w / 2, h * 0.28, 52, { fill: '#f4f1e8', maxW: w * 0.9 });
    TX.inkText(g, 'VILLAIN LANE', w / 2, h * 0.76, 52, { fill: '#f4f1e8', maxW: w * 0.9 });
  }, {}, true);
  const laneM = mats.mat(0xffffff, { map: laneTex, transparent: true });
  for (const s of [0, 1]) {
    const g = TX.atlasPlane(5.2, 1.3, [0, s ? 0 : 0.5, 1, s ? 0.5 : 1]);
    g.rotateX(-Math.PI / 2);
    const mm = new THREE.Mesh(g, laneM);
    mm.position.set(s ? 5.9 : -5.9, 0.02, s ? -32 : 32);
    mm.rotation.y = s ? Math.PI : 0;
    far.addMesh(mm);
  }

  // manholes and puddles
  const manTex = TX.inkTex(128, 128, (g, w) => {
    g.fillStyle = '#3b3a44';
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = TX.INK;
    g.lineWidth = 4;
    g.stroke();
    g.strokeStyle = '#6a6876';
    g.lineWidth = 3;
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.arc(w / 2, w / 2, (w / 2) * (k / 4), 0, Math.PI * 2);
      g.stroke();
    }
    for (let k = 0; k < 8; k++) {
      g.beginPath();
      g.moveTo(w / 2, w / 2);
      g.lineTo(w / 2 + Math.cos(k * 0.785) * w * 0.45, w / 2 + Math.sin(k * 0.785) * w * 0.45);
      g.stroke();
    }
  });
  const manM = mats.mat(0xffffff, { map: manTex, transparent: true });
  const puddleTex = canvasTexture(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2);
    gr.addColorStop(0, '#bfe4ff');
    gr.addColorStop(0.8, '#7fb6ea');
    gr.addColorStop(1, 'rgba(127,182,234,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(w / 2, w / 2, w / 2 - 2, w / 2 - 12, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(w * 0.3, w * 0.55);
    g.lineTo(w * 0.55, w * 0.4);
    g.stroke();
  });
  const puddleM = mats.mat(0xffffff, { map: puddleTex, transparent: true });
  const flat = (mat: THREE.Material, x: number, z: number, s: number, rot = 0, sy = 1, y = 0.018) => {
    const mm = new THREE.Mesh(new THREE.PlaneGeometry(s, s * sy), mat);
    mm.rotation.set(-Math.PI / 2, 0, rot);
    mm.position.set(x, y, z);
    far.addMesh(mm);
  };
  for (const s of [1, -1]) {
    flat(manM, s * 3.2, s * 19.5, 1.0);
    flat(manM, s * -25.5, s * 20.5, 1.0);
    flat(manM, s * 18.5, s * 3.5, 1.0);
    flat(puddleM, s * -3.4, s * 29.5, 3.2, 0.4, 0.6);
    flat(puddleM, s * 24.2, s * 16, 2.4, 1.2, 0.7);
    flat(puddleM, s * 10.5, s * -4.5, 2.8, 2.2, 0.5);
  }
  // crash crater decal around the fallen billboard
  const craterTex = TX.inkTex(256, 256, (g, w) => {
    TX.burst(g, w / 2, w / 2, w * 0.2, w * 0.48, 13, 'rgba(40,36,48,0.55)', TX.INK, 3, 5);
    g.strokeStyle = TX.INK;
    g.lineWidth = 2.5;
    const rr = mulberry(3);
    for (let k = 0; k < 14; k++) {
      const a = rr() * Math.PI * 2;
      let x = w / 2 + Math.cos(a) * w * 0.15, y = w / 2 + Math.sin(a) * w * 0.15;
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += Math.cos(a + (rr() - 0.5)) * 18;
        y += Math.sin(a + (rr() - 0.5)) * 18;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  const craterM = mats.mat(0xffffff, { map: craterTex, transparent: true });
  flat(craterM, -15.5, 3.2, 8.5, 0.3);
  flat(craterM, 15.5, -3.2, 8.5, 2.1);
  // star mosaic around the statue
  const starTex = TX.inkTex(256, 256, (g, w) => {
    g.fillStyle = '#f1e4c4';
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 4, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = TX.INK;
    g.stroke();
    g.save();
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI);
    g.closePath();
    g.clip();
    g.fillStyle = '#e8322b';
    TX.starPath(g, w / 2, w / 2, w * 0.46, w * 0.2);
    g.fill();
    g.restore();
    g.save();
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 6, Math.PI, Math.PI * 2);
    g.closePath();
    g.clip();
    g.fillStyle = '#1d5cff';
    TX.starPath(g, w / 2, w / 2, w * 0.46, w * 0.2);
    g.fill();
    g.restore();
    TX.starPath(g, w / 2, w / 2, w * 0.46, w * 0.2);
    g.stroke();
  });
  const starM = mats.mat(0xffffff, { map: starTex, transparent: true });
  flat(starM, 0, 0, 10.5, 0, 1, 0.315);

  // ------------------------------------------------------------------ sky, clouds, skyline
  scene.add(skyDome({ top: 0x2f86e8, horizon: 0xd4efff, bottom: 0xeae3d2, sunColor: 0xfff6cf, sunDir: [0.5, 0.62, -0.6], sunSize: 0.05 }));
  const cloudBatch = new Batcher(false, false);
  const cr = mulberry(19);
  const cloudMat = mats.mat(0xffffff);
  for (let i = 0; i < 16; i++) {
    const c = cloud(mats, 0xffffff, i + 3, 2.0 + cr() * 1.6);
    const a = (i / 16) * Math.PI * 2 + cr() * 0.3, dd = 150 + cr() * 110;
    c.position.set(Math.cos(a) * dd, 55 + cr() * 45, Math.sin(a) * dd);
    c.rotation.y = cr() * 6;
    c.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = cloudMat;
    });
    cloudBatch.addMesh(c);
  }
  const clouds = new THREE.Group();
  cloudBatch.flush(clouds, false);
  clouds.userData.dynamic = true;
  scene.add(clouds);
  ctx.animate((dt) => {
    clouds.rotation.y += dt * 0.005;
  });

  skyline(F, mats, facade, M, gold);

  // team pennant strings across the avenue
  for (const t of [0, 1] as const) {
    const s = t === 0 ? 1 : -1;
    const cols = [t === 0 ? BLUE : RED, 0xffffff, 0xffd21f];
    for (const z of [12.6, 27.4]) {
      bunting(scene, mats, new THREE.Vector3(-11.1 * s, 6.2, z * s), new THREE.Vector3(11.1 * s, 4.9, z * s), cols, 0.9, 18, batch);
    }
    bunting(scene, mats, new THREE.Vector3(-27.4 * s, 8.5, 40.5 * s), new THREE.Vector3(-10.2 * s, 9.0, 43.9 * s), cols, 1.2, 16, batch);
    bunting(scene, mats, new THREE.Vector3(27.4 * s, 8.5, 40.5 * s), new THREE.Vector3(10.2 * s, 9.0, 43.9 * s), cols, 1.2, 16, batch);
  }

  // blimp circling the skyline
  const blimpBatch = new Batcher(false, false);
  const BP = new Placer(blimpBatch);
  BP.at(0, 0, 0);
  const hull = mats.mat(0xe6ebf2);
  BP.add(sph(1, 24, 14), hull, 0, 0, 0, 0, 0, 0, 16, 4.6, 4.6);
  BP.add(sph(1, 16, 10), teamM[1], 13.8, 0, 0, 0, 0, 0, 2.4, 2.6, 2.6);
  BP.add(cyl(4.7, 4.7, 1.2, 24, true), teamM[0], 3, 0, 0, 0, 0, Math.PI / 2);
  for (let k = 0; k < 4; k++) BP.box(teamM[k % 2], -13.2, 0, 0, 3.6, 0.3, 6.4, (k * Math.PI) / 2, 0, 0);
  BP.add(rbox(4.2, 1.2, 1.6, 0.4), M.white, 1, -4.9, 0);
  BP.box(M.glass, 1, -4.9, 0, 3.6, 0.5, 1.64);
  for (const zs of [-1, 1]) {
    const bg = TX.atlasPlane(13, 3.25, TX.billboardUV(3));
    BP.add(bg, billM, -1, 0.3, zs * 4.75, 0, zs > 0 ? 0 : Math.PI, 0);
  }
  const blimp = new THREE.Group();
  blimpBatch.flush(blimp, false);
  const blimpPivot = new THREE.Group();
  blimp.position.set(150, 78, 0);
  blimp.rotation.y = Math.PI / 2;
  blimpPivot.add(blimp);
  blimpPivot.userData.dynamic = true;
  blimp.userData.dynamic = true;
  scene.add(blimpPivot);
  ctx.animate((_dt, t) => {
    blimpPivot.rotation.y = -t * 0.012 + 1.2;
    blimp.position.y = 78 + Math.sin(t * 0.3) * 1.5;
  });

  // second row of city blocks just behind the playable walls (sells the city)
  const br = mulberry(77);
  for (const side of [1, -1]) {
    let z = -64;
    while (z < 64) {
      const w = 8 + Math.floor(br() * 8), h = 17 + Math.floor(br() * 16), dd = 8 + br() * 6;
      const x = side * (38 + dd / 2 + br() * 2);
      batch.add(boxGeo(dd, h, w, 0.125), facade[Math.floor(br() * 4)], m4.makeTranslation(x, h / 2, z + w / 2));
      batch.box(trim, x, h - 0.2, z + w / 2, dd + 0.5, 0.4, w + 0.5);
      if (br() < 0.4) {
        P.at(x, h, z + w / 2);
        waterTower(P, M, 1.4 + br() * 0.5, 2.4);
      } else if (br() < 0.25) billboard(x - side * 2, h, z + w / 2, -side * Math.PI / 2, 10, Math.floor(br() * 4));
      z += w;
    }
    let x = -42;
    while (x < 42) {
      const w = 8 + Math.floor(br() * 8), h = 19 + Math.floor(br() * 16), dd = 8 + br() * 6;
      const zz = side * (52 + dd / 2 + br() * 2);
      batch.add(boxGeo(w, h, dd, 0.125), facade[Math.floor(br() * 4)], m4.makeTranslation(x + w / 2, h / 2, zz));
      batch.box(trim, x + w / 2, h - 0.2, zz, w + 0.5, 0.4, dd + 0.5);
      if (br() < 0.35) {
        P.at(x + w / 2, h, zz);
        waterTower(P, M, 1.4 + br() * 0.5, 2.4);
      }
      x += w;
    }
  }
  // giant rooftop sound-effect signs flanking the intersection
  const sfxM = mats.mat(0xffffff, { map: TX.sfxAtlas(), side: THREE.DoubleSide });
  (sfxM as THREE.MeshToonMaterial).alphaTest = 0.5;
  const roofAt = (x: number, z: number) => {
    let h = 0;
    for (const bb of level.boxes) if (bb.kind === 'bldg' && x >= bb.min[0] && x <= bb.max[0] && z >= bb.min[2] && z <= bb.max[2]) h = Math.max(h, bb.max[1]);
    return h;
  };
  for (const s of [1, -1]) {
    const x = 32.5 * s, z = -3 * s, y = roofAt(x, z);
    P.at(x, y, z, -s * Math.PI / 2);
    P.add(TX.atlasPlane(10, 10, [s > 0 ? 0 : 0.5, 0, s > 0 ? 0.5 : 1, 1]), sfxM, 0, 6.0, 0, 0, 0, s * 0.08);
    for (const u of [-2, 2]) {
      P.box(M.darkMetal, u, 1.6, -0.25, 0.16, 3.2, 0.16);
      P.box(M.darkMetal, u, 1.4, -1.1, 0.12, 3.2, 0.12, 0.5, 0, 0);
    }
    P.box(M.darkMetal, 0, 2.9, -0.25, 4.6, 0.14, 0.14);
  }
  billboard(-20, 30, -57, 0, 12, 3);
  billboard(22, 29, 57, Math.PI, 12, 1);
  billboard(-44, 27, 20, Math.PI / 2, 12, 0);
  billboard(44, 26, -22, -Math.PI / 2, 12, 2);

  far.flush(scene, false);
}


/** Art-deco skyscrapers around the city block, incl. two landmark spires. */
function skyline(F: Placer, mats: WorldBuildContext['mats'], facade: THREE.Material[], M: PropMats, gold: THREE.Material) {
  const towers = [
    mats.mat(0xffffff, { map: TX.towerTex('#a8bddf', '#35568c', 1) }),
    mats.mat(0xffffff, { map: TX.towerTex('#c6b6db', '#44427a', 2) }),
    mats.mat(0xffffff, { map: TX.towerTex('#e3d3ad', '#4a5c86', 3) }),
  ];
  const silver = mats.mat(0xdfe6f0);
  const r = mulberry(606);
  const tower = (x: number, z: number, w: number, d: number, h: number, mat: THREE.Material, crown: number) => {
    let y = 0, cw = w, cd = d;
    const tiers = 1 + Math.floor(r() * 3);
    for (let t = 0; t < tiers; t++) {
      const th = t === 0 ? h * (0.55 + r() * 0.15) : (h * 0.45) / (tiers - 1 || 1);
      F.batch.add(boxGeo(cw, th, cd, 1 / 16), mat, new THREE.Matrix4().makeTranslation(x, y + th / 2, z));
      F.batch.add(boxGeo(cw + 0.8, 0.8, cd + 0.8), M.white, new THREE.Matrix4().makeTranslation(x, y + th, z));
      y += th;
      cw *= 0.72;
      cd *= 0.72;
    }
    F.at(x, y, z);
    if (crown === 0) {
      F.add(cyl(0.3, 0.6, 12, 6), M.darkMetal, 0, 6, 0);
    } else if (crown === 1) {
      for (let k = 0; k < 3; k++) F.box(M.white, 0, 1 + k * 2, 0, cw * (1 - k * 0.28), 2, cd * (1 - k * 0.28));
      F.add(cone(cw * 0.2, 8, 8), gold, 0, 10, 0);
    } else if (crown === 2) {
      F.add(cyl(cw * 0.3, cw * 0.3, 4, 12), M.stave, 0, 4.5, 0);
      F.add(cone(cw * 0.34, 3, 12), M.darkMetal, 0, 8, 0);
      for (const [a, b] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) F.box(M.darkMetal, a * cw * 0.2, 1.3, b * cd * 0.2, 0.3, 2.6, 0.3);
    }
  };
  // ring of towers (skip the areas right behind the landmark spires)
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + r() * 0.05;
    const dist = 95 + r() * 80;
    const x = Math.cos(a) * dist * 0.85, z = Math.sin(a) * dist * 1.15;
    const h = 38 + r() * 55;
    const w = 14 + r() * 12, d = 14 + r() * 12;
    tower(x, z, w, d, h, towers[i % 3], Math.floor(r() * 4));
  }
  // --- landmark 1: the Liberty Spire (behind the red base)
  {
    const x = -16, z = -185;
    const mat = towers[0];
    const tiers: [number, number][] = [[30, 50], [23, 22], [17, 16], [12, 12], [8, 8]];
    let y = 0;
    for (const [w, h] of tiers) {
      F.batch.add(boxGeo(w, h, w, 1 / 16), mat, new THREE.Matrix4().makeTranslation(x, y + h / 2, z));
      F.batch.add(boxGeo(w + 1, 1, w + 1), M.white, new THREE.Matrix4().makeTranslation(x, y + h, z));
      for (const s of [-1, 1]) for (const t of [-1, 1]) F.batch.add(boxGeo(1.2, h, 1.2), M.white, new THREE.Matrix4().makeTranslation(x + s * w * 0.3, y + h / 2, z + t * (w / 2 + 0.3)));
      y += h;
    }
    F.at(x, y, z);
    F.add(cyl(3, 3.6, 8, 16), silver, 0, 4, 0);
    F.add(cyl(2, 2.6, 6, 16), M.white, 0, 11, 0);
    F.add(cone(1.6, 26, 12), silver, 0, 27, 0);
    F.add(sph(0.8, 10, 8), gold, 0, 40.5, 0);
  }
  // --- landmark 2: the Crown Tower (behind the blue base)
  {
    const x = 20, z = 185;
    const mat = towers[2];
    const tiers: [number, number][] = [[26, 60], [19, 22], [14, 10]];
    let y = 0;
    for (const [w, h] of tiers) {
      F.batch.add(boxGeo(w, h, w, 1 / 16), mat, new THREE.Matrix4().makeTranslation(x, y + h / 2, z));
      F.batch.add(boxGeo(w + 1, 1, w + 1), M.white, new THREE.Matrix4().makeTranslation(x, y + h, z));
      y += h;
    }
    F.at(x, y, z);
    for (let k = 0; k < 5; k++) {
      const rad = 7 - k * 1.3;
      F.add(cyl(rad * 0.82, rad, 4, 4 + 4 * (k % 2 ? 1 : 2)), k % 2 ? gold : silver, 0, 2 + k * 3.6, 0, 0, Math.PI / 4, 0);
    }
    F.add(cone(1.2, 22, 8), silver, 0, 29, 0);
  }
  void facade;
}
