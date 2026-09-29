import * as THREE from 'three';
import type { WorldBuildContext } from '../types';
import type { BoxDef, RampDef } from '../../world/Level';
import { rampHeight } from '../../world/Level';
import { Batcher } from '../../render/Batcher';
import { gradientMap } from '../../render/Materials';
import { skyDome, roundedBox } from '../common';
import { mulberry } from '../../core/utils';
import * as T from './textures';
import { H } from './layout';
import { topQuad, boxWalls, rampPieces, tube, atlasPlane, faceMatrix, FACE_N, flipFace, type Face } from './geo';

export const C = {
  cyan: 0x2ee6ff,
  blue: 0x3a7dff,
  pink: 0xff3fa8,
  red: 0xff2d6f,
  magenta: 0xd94dff,
  purple: 0x8a6dff,
  gold: 0xffc23d,
  lime: 0x7dff6a,
  orange: 0xff7a3d,
  white: 0xffffff,
};
const TEAM_GLOW = [C.cyan, C.red];

/** Visual bottom of the rooftop buildings (street far below). */
const STREET = -34;

export function build(ctx: WorldBuildContext) {
  const { scene, level, mats, batch, quality } = ctx;
  const low = quality === 'low';
  const glow = new Batcher(false, false);
  const far = new Batcher(false, false);
  const m4 = new THREE.Matrix4();

  // ------------------------------------------------------------ materials
  const grad = gradientMap([0.35, 0.7, 1]);
  const toon = (o: THREE.MeshToonMaterialParameters) => new THREE.MeshToonMaterial({ gradientMap: grad, ...o });
  const floorMat = (base: string, seam: string, seed: number, emissive: number, ei: number) => {
    const t = T.floorTextures(base, seam, seed);
    return toon({ map: t.map, emissive, emissiveMap: t.emis, emissiveIntensity: ei });
  };
  const floorPlaza = floorMat('#1f1450', '#2e2070', 1, C.magenta, 1.5);
  const floorTeam = [floorMat('#131b52', '#1f2c78', 2, 0x21b8ff, 0.85), floorMat('#2c0f40', '#44195e', 3, C.red, 1.3)];
  const FLOOR_TILE = 3;

  const facades = [
    T.facadeTextures('#251a56', '#33276e', 11, 0.36),
    T.facadeTextures('#1c1a4c', '#2a2766', 12, 0.3),
    T.facadeTextures('#2e1a4e', '#402468', 13, 0.42),
  ].map((f) => toon({ map: f.map, emissive: 0xffffff, emissiveMap: f.emis, emissiveIntensity: 1.15 }));
  const FACADE_TILE = 8;

  const metalDark = mats.mat(0x2a2358);
  const metalMid = mats.mat(0x4a4690);
  const metalLight = mats.mat(0x8b87d9);
  const concrete = mats.mat(0x3a3274);
  const blackish = mats.mat(0x120e2a);
  const truss = toon({ map: T.trussTexture() });
  const deck = toon({ map: T.deckTexture() });
  const crateTex = [T.crateTexture(T.CYAN), T.crateTexture('#ff3f7a'), T.crateTexture(T.MAGENTA)];
  const crateMat = crateTex.map((t) => toon({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.55 }));

  const bb = T.billboardAtlas();
  const pa = T.propAtlas();
  const signMat = (a: T.Atlas, k = 1.12) => new THREE.MeshBasicMaterial({ map: a.tex, color: new THREE.Color(k, k, k), toneMapped: false });
  const bbMat = signMat(bb);
  const paMat = signMat(pa);
  const flickerMat = signMat(pa);
  ctx.animate((_dt, t) => {
    const k = (Math.sin(t * 13) > 0.93 || (t % 7 > 6.6 && Math.sin(t * 40) > 0)) ? 0.25 : 1.12;
    flickerMat.color.setScalar(k);
  });
  const holoFloor = new THREE.MeshBasicMaterial({ map: pa.tex, color: new THREE.Color(0.55, 0.55, 0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const holoStatic = new THREE.MeshBasicMaterial({ map: pa.tex, color: new THREE.Color(0.9, 0.9, 0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

  /** Glow material; bright cyans are toned down so they bloom about as much as pinks. */
  const gl = (c: number, i = 1.8) => {
    const col = new THREE.Color(c);
    const lum = 0.299 * col.r + 0.587 * col.g + 0.114 * col.b;
    const k = lum > 0.5 ? 0.62 : 1;
    return mats.glow(c, Math.round(i * k * 100) / 100);
  };
  const farGlowCache = new Map<string, THREE.Material>();
  /** Glow that still fades into the fog (distant city). */
  const fgl = (c: number, i = 1.6) => {
    const k = `${c}|${i}`;
    let m = farGlowCache.get(k);
    if (!m) farGlowCache.set(k, (m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), toneMapped: false })));
    return m;
  };
  const lampTops: THREE.Vector3[] = [];
  /** Blinking aviation lights, merged into two phases. */
  const tips: [number, number, number, number][] = [];
  const teamOf = (b: BoxDef) => (b.data?.team as number | undefined) ?? -1;
  const glowFor = (team: number) => (team === 0 ? C.cyan : team === 1 ? C.red : C.magenta);
  const crateFor = (team: number) => crateMat[team === 0 ? 0 : team === 1 ? 1 : 2];

  // ------------------------------------------------------------ sky
  scene.add(skyDome({ top: 0x0d0730, horizon: 0xb4389e, bottom: 0x1a0836, sunColor: 0xffd35a, sunDir: [0, 0.25, -1], sunSize: 0.2, stripes: true }));
  scene.add(moon());
  scene.add(stars(low ? 250 : 600));

  // ------------------------------------------------------------ helpers
  /** Thin glowing rectangle frame on a z-facing plane. */
  const frame = (x: number, y: number, z: number, w: number, h: number, col: number) => {
    const g = gl(col, 1.7), t = 0.07;
    glow.box(g, x, y + h / 2, z, w + t, t, t);
    glow.box(g, x, y - h / 2, z, w + t, t, t);
    glow.box(g, x - w / 2, y, z, t, h, t);
    glow.box(g, x + w / 2, y, z, t, h, t);
  };
  const addWalls = (b: BatcherLike, mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, yb: number, yt: number, skip: Face[] = []) => {
    for (const g of boxWalls(x0, z0, x1, z1, yb, yt, FACADE_TILE, yt, skip)) b.add(g, mat);
  };
  /** Neon trim line wrapping a building just under its roof line + corner strips down into the alley. */
  const trim = (x0: number, z0: number, x1: number, z1: number, y: number, color: number, down = true, skip: Face[] = []) => {
    const m = gl(color, 1.7);
    const t = 0.09, o = 0.04;
    if (!skip.includes('pz')) glow.box(m, (x0 + x1) / 2, y, z1 + o, x1 - x0 + 2 * o, t, t);
    if (!skip.includes('nz')) glow.box(m, (x0 + x1) / 2, y, z0 - o, x1 - x0 + 2 * o, t, t);
    if (!skip.includes('px')) glow.box(m, x1 + o, y, (z0 + z1) / 2, t, t, z1 - z0 + 2 * o);
    if (!skip.includes('nx')) glow.box(m, x0 - o, y, (z0 + z1) / 2, t, t, z1 - z0 + 2 * o);
    if (down) {
      const yb = STREET + 6;
      for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) glow.box(m, cx + Math.sign(cx - (x0 + x1) / 2) * o, (y + yb) / 2, cz + Math.sign(cz - (z0 + z1) / 2) * o, t, y - yb, t);
    }
  };
  const sign = (a: T.Atlas, mat: THREE.Material, slot: string, w: number, h: number, x: number, y: number, z: number, nx: number, nz: number, b: BatcherLike = glow) => {
    b.add(atlasPlane(a, slot, w, h), mat, faceMatrix(x, y, z, nx, nz, m4));
  };

  // ------------------------------------------------------------ boxes
  for (const b of level.boxes) {
    if (b.invisible) continue;
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    const team = teamOf(b);
    const mirrored = !!b.data?.mirrored;
    const faceOf = (): Face => {
      const f = (b.data?.face as Face | undefined) ?? 'pz';
      return mirrored ? flipFace(f) : f;
    };
    switch (b.kind) {
      case 'roof': {
        const fl = b.data?.floor === 'plaza' ? floorPlaza : floorTeam[team === 1 ? 1 : 0];
        batch.add(topQuad(x0, z0, x1, z1, y1, FLOOR_TILE), fl);
        const fi = Math.abs(Math.round(cx * 3 + cz * 7)) % facades.length;
        addWalls(batch, facades[fi], x0, z0, x1, z1, STREET, y1);
        trim(x0, z0, x1, z1, y1 - 0.22, glowFor(b.data?.floor === 'plaza' ? -1 : team));
        // secondary band lower down
        trim(x0, z0, x1, z1, y1 - 8.5, [C.purple, C.pink, C.cyan][fi], false);
        break;
      }
      case 'dais': {
        batch.add(topQuad(x0, z0, x1, z1, y1, FLOOR_TILE), floorPlaza);
        for (const g of boxWalls(x0, z0, x1, z1, y0, y1, 2)) batch.add(g, truss);
        trim(x0, z0, x1, z1, y1 - 0.08, C.magenta, false);
        trim(x0, z0, x1, z1, y0 + 0.08, C.cyan, false);
        break;
      }
      case 'tower': {
        // extends visually away from the arena (behind the boundary)
        const zb = team === 0 ? z1 + 12 : z0 - 12;
        const tz0 = Math.min(z0, zb), tz1 = Math.max(z1, zb);
        addWalls(batch, facades[1], x0, tz0, x1, tz1, STREET, y1);
        batch.box(metalDark, cx, y1 + 0.3, (tz0 + tz1) / 2, sx + 0.6, 0.6, tz1 - tz0 + 0.6);
        trim(x0, tz0, x1, tz1, y1 - 0.3, TEAM_GLOW[team]);
        const face = team === 0 ? z0 : z1;
        const n = team === 0 ? -1 : 1;
        // team sign with frame
        const sw = 13, sh = sw / bb.aspect(team === 0 ? 'blue' : 'red');
        const sy0 = y1 - 0.9 - sh / 2;
        batch.box(metalDark, cx, sy0, face + n * 0.12, sw + 0.8, sh + 0.8, 0.24);
        sign(bb, bbMat, team === 0 ? 'blue' : 'red', sw, sh, cx, sy0, face + n * 0.26, 0, n);
        glow.box(gl(TEAM_GLOW[team], 2.2), cx, sy0 - sh / 2 - 0.6, face + n * 0.3, sw + 1.6, 0.14, 0.14);
        // side signs on the tower
        sign(pa, paMat, 'score', 6, 1.5, x0 + 4.5, H.base + 1.3, face + n * 0.03, 0, n);
        sign(pa, paMat, team === 0 ? 'glowy' : 'radical', 6, 1.5, x1 - 4.5, H.base + 1.3, face + n * 0.03, 0, n);
        // roof gear: antenna mast, dish, water tank
        rooftopGear(cx - 6, y1 + 0.6, (tz0 + tz1) / 2, team, true);
        waterTower(cx + 7, y1 + 0.6, (tz0 + tz1) / 2 + n * -2, 1.7);
        break;
      }
      case 'neighbour': {
        const outward = team === 0 ? -1 : 1;
        const bx0 = outward < 0 ? x0 - 10 : x0, bx1 = outward < 0 ? x1 : x1 + 10;
        addWalls(batch, facades[2], bx0, z0, bx1, z1, STREET, y1);
        batch.box(metalDark, (bx0 + bx1) / 2, y1 + 0.2, cz, bx1 - bx0 + 0.4, 0.4, sz + 0.4);
        trim(bx0, z0, bx1, z1, y1 - 0.3, C.pink);
        const fx = outward < 0 ? x1 : x0;
        const n = -outward;
        // big billboard on the arena face
        const bw = 15, bh = bw / bb.aspect('dreams');
        const by = H.lt + 6.2;
        batch.box(metalDark, fx + n * 0.2, by, cz, 0.4, bh + 0.9, bw + 0.9);
        sign(bb, bbMat, 'dreams', bw, bh, fx + n * 0.42, by, cz, n, 0);
        glow.box(gl(C.pink, 2), fx + n * 0.25, by + bh / 2 + 0.55, cz, 0.12, 0.12, bw + 1.2);
        glow.box(gl(C.pink, 2), fx + n * 0.25, by - bh / 2 - 0.55, cz, 0.12, 0.12, bw + 1.2);
        // vertical hotel sign at the corner & cafe sign over the vending machines
        const vz = team === 0 ? z1 - 1.2 : z0 + 1.2;
        sign(pa, paMat, 'hotel', 1.4, 5.6, fx + n * 0.9, H.lt + 7.6, vz, n, 0);
        sign(pa, flickerMat, 'cafe', 3.2, 1.6, fx + n * 0.03, H.lt + 3.2, team === 0 ? 10.6 : -10.6, n, 0);
        waterTower((bx0 + bx1) / 2 + outward * 2, y1 + 0.4, cz + 4, 1.9);
        rooftopGear((bx0 + bx1) / 2, y1 + 0.4, cz - 5, team, false);
        break;
      }
      case 'perch': {
        batch.add(topQuad(x0, z0, x1, z1, y1, FLOOR_TILE), floorTeam[team === 1 ? 1 : 0]);
        for (const g of boxWalls(x0, z0, x1, z1, y0, y1, 2, y1)) batch.add(g, truss);
        trim(x0, z0, x1, z1, y1 - 0.1, TEAM_GLOW[team], false);
        break;
      }
      case 'bigboard': {
        const f = faceOf();
        const [nx, nz] = FACE_N[f];
        batch.box(metalDark, cx, cy, cz, sx, sy, sz);
        const fx = cx + nx * (sx / 2 + 0.02), fz = cz + nz * (sz / 2 + 0.02);
        const w = (nx ? sz : sx) - 0.5;
        const hv = w / bb.aspect('vibes');
        sign(bb, bbMat, 'vibes', w, hv, fx, y1 - 0.3 - hv / 2, fz, nx, nz);
        sign(pa, paMat, 'zap', 4.2, 1.05, fx, y0 + 0.9, fz, nx, nz);
        glow.box(gl(C.cyan, 2), cx, y1 + 0.07, cz, sx + 0.1, 0.14, sz + 0.1);
        // spotlights on top
        for (const t of [-0.3, 0.3]) {
          const lx = cx + (nz ? t * sx : 0) + nx * 0.8, lz = cz + (nx ? t * sz : 0) + nz * 0.8;
          tube(batch, metalMid, cx + (nz ? t * sx : 0), y1, cz + (nx ? t * sz : 0), lx, y1 + 0.35, lz, 0.05);
          glow.add(new THREE.SphereGeometry(0.16, 8, 6), gl(C.white, 2), m4.makeTranslation(lx, y1 + 0.35, lz));
        }
        break;
      }
      case 'billboard': {
        // double-sided screen wall on the plaza
        batch.add(roundedBox(sx, sy, sz, 0.12, 1), metalDark, m4.makeTranslation(cx, cy, cz));
        const n = team === 0 ? 1 : -1;
        for (const s of [1, -1]) {
          const fz = cz + s * (sz / 2 + 0.02);
          const w = sx - 0.6, h = w / bb.aspect('nights');
          sign(bb, bbMat, 'nights', w, h, cx, y1 - 0.35 - h / 2, fz, 0, s);
          const facingHome = s === n;
          const lx = -s * sx * 0.22;
          const catCol = facingHome && team === 0 ? C.cyan : C.pink;
          sign(pa, paMat, facingHome ? (team === 0 ? 'catc' : 'catp') : 'catp', 2.4, 2.4, cx + lx, y0 + 2.2, fz, 0, s);
          frame(cx + lx, y0 + 2.2, fz + s * 0.02, 2.5, 2.5, catCol);
          sign(pa, paMat, facingHome ? 'glowy' : 'zap', 3.6, 0.9, cx - lx, y0 + 2.8, fz, 0, s);
          sign(pa, paMat, facingHome ? 'pizza' : 'score', 3.6, 0.9, cx - lx, y0 + 1.6, fz, 0, s);
        }
        glow.box(gl(C.magenta, 2), cx, y1 + 0.06, cz, sx + 0.1, 0.12, sz + 0.1);
        glow.box(gl(C.magenta, 2), cx, y0 + 0.08, cz, sx + 0.1, 0.12, sz + 0.1);
        glow.box(gl(C.cyan, 2), x0 - 0.02, cy, cz, 0.12, sy, sz + 0.1);
        glow.box(gl(C.cyan, 2), x1 + 0.02, cy, cz, 0.12, sy, sz + 0.1);
        break;
      }
      case 'deck': {
        batch.add(topQuad(x0, z0, x1, z1, y1, 2), deck);
        for (const g of boxWalls(x0, z0, x1, z1, y0, y1, 2, y1)) batch.add(g, truss);
        batch.box(truss, cx, y0 + 0.01, cz, sx, 0.02, sz);
        break;
      }
      case 'rail':
        railVisual(b);
        break;
      case 'arcade': {
        const f = faceOf();
        const [nx, nz] = FACE_N[f];
        const w = nx ? sz : sx, d = nx ? sx : sz;
        // cabinet: lower body, recessed screen, marquee
        batch.add(roundedBox(sx, sy, sz, 0.05, 1), metalDark, m4.makeTranslation(cx, cy, cz));
        const fx = cx + nx * (d / 2 + 0.01), fz = cz + nz * (d / 2 + 0.01);
        const scr = new THREE.PlaneGeometry(w * 0.72, 0.62);
        glow.add(scr, gl([C.cyan, C.pink, C.lime, C.gold][Math.abs(Math.round(cx * 3)) % 4], 1.3), faceMatrix(fx, y0 + 1.35, fz, nx, nz, m4));
        glow.add(new THREE.PlaneGeometry(w * 0.6, 0.4), blackish, faceMatrix(fx + nx * 0.005, y0 + 1.35, fz + nz * 0.005, nx, nz, m4));
        sign(pa, paMat, team === 1 ? 'catp' : 'catc', 0.42, 0.42, fx + nx * 0.01, y0 + 1.35, fz + nz * 0.01, nx, nz);
        glow.box(gl(team === 1 ? C.red : C.cyan, 1.8), cx + nx * (d / 2), y0 + 1.95, cz + nz * (d / 2), nx ? 0.06 : w, 0.18, nz ? 0.06 : w);
        batch.box(metalMid, cx + nx * (d / 2 + 0.12), y0 + 0.95, cz + nz * (d / 2 + 0.12), nx ? 0.25 : w, 0.08, nz ? 0.25 : w);
        for (const k of [-0.2, 0, 0.2]) glow.add(new THREE.SphereGeometry(0.035, 6, 4), gl([C.pink, C.gold, C.lime][Math.round(k * 5 + 1)], 2), m4.makeTranslation(cx + nx * (d / 2 + 0.15) + nz * k, y0 + 1.0, cz + nz * (d / 2 + 0.15) + nx * k));
        break;
      }
      case 'trunk':
        break; // drawn by the planter's palm
      case 'pylon': {
        batch.add(roundedBox(sx, sy, sz, 0.15, 1), metalDark, m4.makeTranslation(cx, cy, cz));
        batch.box(metalMid, cx, y1 + 0.15, cz, sx + 0.3, 0.3, sz + 0.3);
        // neon rings + corner tubes
        for (let i = 0; i < 5; i++) {
          const y = y0 + 1.2 + i * 1.35;
          glow.box(gl(i % 2 ? C.cyan : C.magenta, 1.8), cx, y, cz, sx + 0.06, 0.1, sz + 0.06);
        }
        for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) glow.box(gl(C.purple, 1.6), px, cy, pz, 0.12, sy - 0.4, 0.12);
        // speaker cones facing the zone
        const n = cx > 0 ? -1 : 1;
        for (const [dz, yy, r] of [[0, y0 + 1.9, 0.7], [0, y0 + 4.6, 0.55], [0, y0 + 6.3, 0.4]] as const) {
          const cone = new THREE.CylinderGeometry(r, r * 0.3, 0.3, 16, 1, true);
          cone.rotateZ(-n * Math.PI / 2);
          batch.add(cone, blackish, m4.makeTranslation(cx + n * (sx / 2 + 0.05), yy, cz + dz));
          glow.add(new THREE.TorusGeometry(r, 0.05, 4, 20).rotateY(Math.PI / 2), gl(C.cyan, 1.8), m4.makeTranslation(cx + n * (sx / 2 + 0.2), yy, cz + dz));
        }
        sign(pa, paMat, 'zap', 2.2, 0.55, cx + n * (sx / 2 + 0.03), y0 + 3.3, cz, n, 0);
        // beacon
        glow.add(new THREE.SphereGeometry(0.35, 12, 8), gl(C.pink, 2.2), m4.makeTranslation(cx, y1 + 0.6, cz));
        break;
      }
      case 'lamp': {
        const f = faceOf();
        const [nx, nz] = FACE_N[f];
        batch.add(new THREE.CylinderGeometry(0.12, 0.16, sy, 8), metalDark, m4.makeTranslation(cx, cy, cz));
        batch.add(new THREE.CylinderGeometry(0.28, 0.3, 0.35, 8), metalMid, m4.makeTranslation(cx, y0 + 0.17, cz));
        tube(batch, metalDark, cx, y1 - 0.2, cz, cx + nx * 1.3, y1 + 0.2, cz + nz * 1.3, 0.07, 6);
        const col = team === 1 ? C.red : C.cyan;
        tube(glow, gl(col, 2), cx + nx * 1.3, y1 - 0.6, cz + nz * 1.3, cx + nx * 1.3, y1 + 0.2, cz + nz * 1.3, 0.12, 8);
        glow.box(gl(C.magenta, 1.8), cx, y0 + 1.6, cz, 0.3, 1.8, 0.3);
        lampTops.push(new THREE.Vector3(cx + nx * 1.3, y1 + 0.2, cz + nz * 1.3));
        break;
      }
      case 'vending':
        vending(b, faceOf());
        break;
      case 'ac':
        acUnit(b, team);
        break;
      case 'vent':
        vent(cx, y0, cz, Math.min(sx, sz), sy);
        break;
      case 'crate': {
        batch.add(roundedBox(sx, sy, sz, 0.07, 1), crateFor(team), m4.makeTranslation(cx, cy, cz));
        const g = gl(glowFor(team), 1.8);
        glow.box(g, cx, y1 - 0.08, z0 - 0.015, sx - 0.2, 0.07, 0.03);
        glow.box(g, cx, y1 - 0.08, z1 + 0.015, sx - 0.2, 0.07, 0.03);
        glow.box(g, x0 - 0.015, y1 - 0.08, cz, 0.03, 0.07, sz - 0.2);
        glow.box(g, x1 + 0.015, y1 - 0.08, cz, 0.03, 0.07, sz - 0.2);
        break;
      }
      case 'lowwall': {
        batch.add(roundedBox(sx, sy, sz, 0.1, 1), concrete, m4.makeTranslation(cx, cy, cz));
        batch.box(metalDark, cx, y1 + 0.05, cz, sx + 0.1, 0.1, sz + 0.1);
        glow.box(gl(glowFor(team), 1.9), cx, y1 + 0.12, cz, sx - 0.2, 0.06, 0.08);
        glow.box(gl(C.purple, 1.6), cx, y0 + 0.25, cz, sx + 0.02, 0.06, sz + 0.02);
        break;
      }
      case 'block': {
        batch.add(roundedBox(sx, sy, sz, 0.1, 1), metalDark, m4.makeTranslation(cx, cy, cz));
        trim(x0, z0, x1, z1, y1 - 0.12, C.magenta, false);
        trim(x0, z0, x1, z1, y0 + 0.3, C.cyan, false);
        break;
      }
      case 'hut':
        hut(b, faceOf(), team);
        break;
      case 'planter': {
        batch.add(roundedBox(sx, sy, sz, 0.08, 1), concrete, m4.makeTranslation(cx, cy, cz));
        batch.box(blackish, cx, y1 - 0.02, cz, sx - 0.2, 0.04, sz - 0.2);
        glow.box(gl(glowFor(team), 1.8), cx, y1 - 0.2, cz, sx + 0.03, 0.06, sz + 0.03);
        synthPalm(cx, y1, cz, 5 + (Math.abs(cx * 13 + cz) % 1.5), Math.round(Math.abs(cx * 7 + cz * 3)));
        break;
      }
      default:
        batch.box(metalMid, cx, cy, cz, sx, sy, sz);
    }
  }

  // ------------------------------------------------------------ ramps
  for (const r of level.ramps) {
    if (r.kind === 'railRamp') {
      railRampVisual(r);
      continue;
    }
    const { top, sides } = rampPieces(r, 2);
    const onPlaza = Math.abs(r.min[0] + r.max[0]) / 2 < 13 && Math.abs(r.min[2] + r.max[2]) / 2 < 28 && Math.min(r.h0, r.h1) <= H.plaza + 0.01;
    const zc = (r.min[2] + r.max[2]) / 2;
    const col = r.kind === 'bridge' ? (zc > 0 ? C.cyan : C.red) : onPlaza ? C.magenta : zc > 0 ? C.cyan : C.red;
    batch.add(top, deck);
    for (const s of sides) batch.add(s, truss);
    // glowing edge lines along the slope + step lines across it
    const along = r.axis;
    const x0 = r.min[0], x1 = r.max[0], z0 = r.min[2], z1 = r.max[2];
    const hAt = (x: number, z: number) => rampHeight(r, x, z) + 0.03;
    const g = gl(col, 1.9);
    if (along === 'z') {
      for (const x of [x0 + 0.08, x1 - 0.08]) tube(glow, g, x, hAt(x, z0), z0, x, hAt(x, z1), z1, 0.05, 4);
      const n = Math.floor((z1 - z0) / 1.2);
      for (let i = 1; i < n; i++) {
        const z = z0 + (i / n) * (z1 - z0);
        glow.box(gl(C.purple, 1.4), (x0 + x1) / 2, hAt(x0, z), z, x1 - x0 - 0.5, 0.03, 0.06);
      }
    } else {
      for (const z of [z0 + 0.08, z1 - 0.08]) tube(glow, g, x0, hAt(x0, z), z, x1, hAt(x1, z), z, 0.05, 4);
      const n = Math.floor((x1 - x0) / 1.2);
      for (let i = 1; i < n; i++) {
        const x = x0 + (i / n) * (x1 - x0);
        glow.box(gl(C.purple, 1.4), x, hAt(x, z0), (z0 + z1) / 2, 0.06, 0.03, z1 - z0 - 0.5);
      }
    }
  }

  // ------------------------------------------------------------ gameplay dressing
  // jump pad rings (engine draws the pad itself; this is the painted launch marking)
  for (const p of level.pads) {
    const col = p.pos[2] > 0 ? C.cyan : C.red;
    const ring = new THREE.RingGeometry(1.35, 1.55, 32);
    ring.rotateX(-Math.PI / 2);
    glow.add(ring, gl(col, 2), m4.makeTranslation(p.pos[0], p.pos[1] + 0.03, p.pos[2]));
    const dx = p.target[0] - p.pos[0], dz = p.target[2] - p.pos[2];
    const yaw = Math.atan2(dx, dz);
    for (let i = 0; i < 3; i++) {
      const chev = new THREE.BufferGeometry();
      chev.setAttribute('position', new THREE.Float32BufferAttribute([-0.45, 0, 0, 0.45, 0, 0, 0, 0, 0.45, -0.45, 0, 0, 0, 0, 0.45, 0, 0, 0.45], 3));
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.1, 0, 0, 0.35, 0.5, 0, -0.1, 0.5, 0, -0.1, 0, 0, 0.35, 0, 0, 0.18, -0.5, 0, -0.1, 0, 0, 0.18, 0, 0, 0.35], 3));
      cg.computeVertexNormals();
      const d = 1.9 + i * 0.6;
      glow.add(cg, gl(col, 1.6 + i * 0.2), m4.makeRotationY(yaw).setPosition(p.pos[0] + Math.sin(yaw) * d, p.pos[1] + 0.03, p.pos[2] + Math.cos(yaw) * d));
      chev.dispose();
    }
  }
  // team emblem painted on each base floor
  level.flags.forEach((f, i) => {
    const e = new THREE.Mesh(atlasPlane(pa, i === 0 ? 'catc' : 'catp', 4.4, 4.4), holoFloor);
    e.rotation.x = -Math.PI / 2;
    e.rotation.z = i === 0 ? 0 : Math.PI;
    e.position.set(f[0], f[1] + 0.025, f[2] + (i === 0 ? 3.6 : -3.6));
    scene.add(e);
  });
  // flag base rings
  level.flags.forEach((f, i) => {
    for (const [r0, r1] of [[2.15, 2.25], [2.7, 2.76]]) {
      const ring = new THREE.RingGeometry(r0, r1, 40);
      ring.rotateX(-Math.PI / 2);
      glow.add(ring, gl(TEAM_GLOW[i], 1.5), m4.makeTranslation(f[0], f[1] + 0.03, f[2]));
    }
  });

  // ------------------------------------------------------------ string lights, alley signs, holo emblems
  stringLights();
  alleySigns();
  for (const f of level.flags) holoEmblem(f[0], H.base + 16, f[2] > 0 ? 51 : -51, f[2] > 0 ? 0 : 1);

  // ------------------------------------------------------------ centre hologram
  hologram();

  // ------------------------------------------------------------ city beyond the arena
  nearCity();
  skyline();
  streets();
  ufos();
  searchlights();

  // blinking aviation lights (two alternating phases)
  for (let ph = 0; ph < 2; ph++) {
    const tb = new Batcher(false, false);
    const grp = new THREE.Group();
    tips.forEach((t, i) => { if (i % 2 === ph) tb.add(new THREE.SphereGeometry(t[3], 8, 6), mats.glow(C.red, 2.5), m4.makeTranslation(t[0], t[1], t[2])); });
    tb.flush(grp, false);
    scene.add(grp);
    ctx.animate((_dt, t) => { grp.visible = Math.sin(t * 2.6 + ph * Math.PI) > -0.3; });
  }

  glow.flush(scene, false);
  far.flush(scene, false);

  /* ============================================================ builders */

  function railVisual(b: BoxDef) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const alongX = (b.data?.axis ?? (x1 - x0 > z1 - z0 ? 'x' : 'z')) === 'x';
    const team = teamOf(b);
    const onPlaza = Math.abs(y0 - H.plaza) < 0.01;
    const col = onPlaza ? C.magenta : glowFor(team);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    railRun(alongX ? x0 : cx, alongX ? cz : z0, alongX ? x1 : cx, alongX ? cz : z1, y0, y0, y1 - y0, col);
  }

  function railRampVisual(r: RampDef) {
    const alongX = r.axis === 'x';
    const cx = (r.min[0] + r.max[0]) / 2, cz = (r.min[2] + r.max[2]) / 2;
    const ax = alongX ? r.min[0] : cx, az = alongX ? cz : r.min[2];
    const bx = alongX ? r.max[0] : cx, bz = alongX ? cz : r.max[2];
    const ta = rampHeight(r, ax, az), tb = rampHeight(r, bx, bz);
    const hgt = 1.1;
    railRun(ax, az, bx, bz, ta - hgt, tb - hgt, hgt, cz > 0 ? C.cyan : C.red);
  }

  /** Posts + glowing top tube + dark mid rail from A to B (surface heights ya, yb). */
  function railRun(ax: number, az: number, bx: number, bz: number, ya: number, yb: number, h: number, col: number) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ya + (yb - ya) * t;
      tube(batch, metalMid, x, y, z, x, y + h - 0.05, z, 0.055, 6);
    }
    tube(glow, gl(col, 1.8), ax, ya + h - 0.04, az, bx, yb + h - 0.04, bz, 0.055, 6);
    tube(batch, metalDark, ax, ya + h * 0.5, az, bx, yb + h * 0.5, bz, 0.04, 5);
    tube(batch, metalDark, ax, ya + 0.15, az, bx, yb + 0.15, bz, 0.035, 4);
  }

  function vending(b: BoxDef, f: Face) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    const [nx, nz] = FACE_N[f];
    batch.add(roundedBox(sx, sy, sz, 0.08, 1), metalDark, m4.makeTranslation(cx, cy, cz));
    const fw = (nx ? sz : sx) * 0.86;
    const slot = b.data?.v === 1 ? 'snacks' : 'drinks';
    sign(pa, paMat, slot, fw, sy * 0.88, cx + nx * (sx / 2 + 0.015), cy - 0.02, cz + nz * (sz / 2 + 0.015), nx, nz);
    // glowing top cap & side stripe
    const col = b.data?.v === 1 ? C.gold : C.cyan;
    glow.box(gl(col, 1.8), cx, y1 + 0.04, cz, sx - 0.1, 0.08, sz - 0.1);
    glow.box(gl(C.pink, 1.8), cx, y0 + 0.08, cz, sx + 0.02, 0.06, sz + 0.02);
  }

  function acUnit(b: BoxDef, team: number) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    batch.add(roundedBox(sx, sy - 0.12, sz, 0.1, 1), metalMid, m4.makeTranslation(cx, cy + 0.06, cz));
    batch.box(blackish, cx, y0 + 0.06, cz, sx - 0.3, 0.12, sz - 0.3);
    // fans on top
    const long = sx > sz;
    const nf = Math.max(1, Math.round((long ? sx : sz) / 1.3));
    const fr = Math.min(sx, sz) * 0.36;
    for (let i = 0; i < nf; i++) {
      const t = (i + 0.5) / nf - 0.5;
      const fx = cx + (long ? t * sx : 0), fz = cz + (long ? 0 : t * sz);
      batch.add(new THREE.CylinderGeometry(fr, fr, 0.06, 16), blackish, m4.makeTranslation(fx, y1 + 0.01, fz));
      batch.add(new THREE.TorusGeometry(fr, 0.035, 4, 16).rotateX(Math.PI / 2), metalLight, m4.makeTranslation(fx, y1 + 0.04, fz));
      for (let k = 0; k < 3; k++) batch.box(metalLight, fx, y1 + 0.05, fz, fr * 1.8, 0.03, 0.08, (k / 3) * Math.PI + i);
    }
    // side grille slats
    for (let k = 0; k < 3; k++) {
      const y = y0 + 0.35 + k * 0.22;
      if (long) {
        batch.box(blackish, cx, y, z0 - 0.005, sx * 0.7, 0.06, 0.02);
        batch.box(blackish, cx, y, z1 + 0.005, sx * 0.7, 0.06, 0.02);
      } else {
        batch.box(blackish, x0 - 0.005, y, cz, 0.02, 0.06, sz * 0.7);
        batch.box(blackish, x1 + 0.005, y, cz, 0.02, 0.06, sz * 0.7);
      }
    }
    // status LED
    glow.box(gl(team === 1 ? C.red : C.lime, 2.2), long ? x1 - 0.3 : cx, y1 - 0.25, long ? z1 + 0.02 : z1 - 0.3, 0.12, 0.08, 0.04);
  }

  function vent(cx: number, y0: number, cz: number, s: number, h: number) {
    batch.box(metalMid, cx, y0 + 0.12, cz, s, 0.24, s);
    batch.add(new THREE.CylinderGeometry(s * 0.26, s * 0.3, h - 0.3, 10), metalLight, m4.makeTranslation(cx, y0 + 0.24 + (h - 0.3) / 2, cz));
    batch.add(new THREE.CylinderGeometry(s * 0.2, s * 0.52, 0.28, 12), metalMid, m4.makeTranslation(cx, y0 + h - 0.1, cz));
    glow.add(new THREE.TorusGeometry(s * 0.3, 0.025, 4, 14).rotateX(Math.PI / 2), gl(C.purple, 1.8), m4.makeTranslation(cx, y0 + h - 0.26, cz));
  }

  function hut(b: BoxDef, f: Face, team: number) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const sx = x1 - x0, sz = z1 - z0;
    addWalls(batch, concrete, x0, z0, x1, z1, y0, y1);
    batch.box(metalDark, cx, y1 + 0.15, cz, sx + 0.5, 0.3, sz + 0.5);
    glow.box(gl(glowFor(team), 1.8), cx, y1 - 0.05, cz, sx + 0.54, 0.08, sz + 0.54);
    const [nx, nz] = FACE_N[f];
    const fx = cx + nx * (sx / 2 + 0.02), fz = cz + nz * (sz / 2 + 0.02);
    // door
    batch.add(new THREE.PlaneGeometry(1.4, 2.2), blackish, faceMatrix(fx, y0 + 1.1, fz, nx, nz, m4));
    const dg = gl(C.lime, 1.8);
    const px = nz, pz = nx; // along-wall axis
    glow.box(dg, fx + px * 0.75, y0 + 1.15, fz + pz * 0.75, nx ? 0.08 : 0.08, 2.3, nx ? 0.08 : 0.08);
    glow.box(dg, fx - px * 0.75, y0 + 1.15, fz - pz * 0.75, 0.08, 2.3, 0.08);
    glow.box(dg, fx, y0 + 2.28, fz, nz ? 1.58 : 0.08, 0.08, nx ? 1.58 : 0.08);
    sign(pa, paMat, 'exit', 1.3, 0.65, fx + nx * 0.01, y0 + 2.75, fz + nz * 0.01, nx, nz);
    // awning over the door (visual overhang)
    batch.box(metalMid, fx + nx * 0.45, y0 + 2.5, fz + nz * 0.45, nx ? 0.9 : 2.2, 0.12, nz ? 0.9 : 2.2);
    glow.box(gl(C.lime, 1.6), fx + nx * 0.9, y0 + 2.46, fz + nz * 0.9, nx ? 0.05 : 2.2, 0.05, nz ? 0.05 : 2.2);
    // panel seams + posters on the other faces
    for (const k of [0.33, 0.66]) glow.box(gl(C.purple, 1.3), cx, y0 + k * (y1 - y0), cz, sx + 0.04, 0.04, sz + 0.04);
    for (const of of ['px', 'nx', 'pz', 'nz'] as Face[]) {
      if (of === f) continue;
      const [onx, onz] = FACE_N[of];
      const ox = cx + onx * (sx / 2 + 0.03), oz = cz + onz * (sz / 2 + 0.03);
      if (of === flipFace(f)) sign(pa, paMat, 'arcade', 0.75, 3, ox, cy + 0.2, oz, onx, onz);
      else sign(pa, paMat, team === 1 ? 'catp' : 'catc', 1.7, 1.7, ox, cy + 0.2, oz, onx, onz);
    }
    rooftopGear(cx - nx * 0.8 + nz * 0.8, y1 + 0.3, cz - nz * 0.8 - nx * 0.8, team, false);
  }

  function rooftopGear(x: number, y: number, z: number, team: number, big: boolean) {
    const hh = big ? 9 : 3.2;
    tube(batch, metalLight, x, y, z, x, y + hh, z, big ? 0.12 : 0.05, 6);
    for (let i = 1; i <= (big ? 4 : 2); i++) {
      const yy = y + (i / (big ? 5 : 3)) * hh;
      const w = (big ? 1.4 : 0.6) * (1 - i * 0.15);
      tube(batch, metalLight, x - w, yy, z, x + w, yy, z, 0.03, 4);
    }
    tips.push([x, y + hh + 0.1, z, big ? 0.3 : 0.14]);
    // satellite dish
    const dish = new THREE.SphereGeometry(big ? 1.2 : 0.55, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.35);
    dish.rotateX(Math.PI * 0.62);
    const dx = x + (big ? 2.4 : 1.1), dz = z;
    batch.add(dish, metalLight, m4.makeRotationY(team === 1 ? 0.6 : -0.6 + Math.PI).setPosition(dx, y + (big ? 1.4 : 0.7), dz));
    tube(batch, metalMid, dx, y, dz, dx, y + (big ? 1.2 : 0.6), dz, big ? 0.1 : 0.05, 5);
  }

  function waterTower(x: number, y: number, z: number, r: number) {
    const legH = r * 1.6;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      tube(batch, metalMid, x + Math.cos(a) * r * 0.85, y, z + Math.sin(a) * r * 0.85, x + Math.cos(a) * r * 0.75, y + legH, z + Math.sin(a) * r * 0.75, 0.09, 5);
    }
    const tank = new THREE.CylinderGeometry(r, r, r * 1.7, 14);
    batch.add(tank, mats.mat(0x5a3d8a), m4.makeTranslation(x, y + legH + r * 0.85, z));
    const roofG = new THREE.ConeGeometry(r * 1.08, r * 0.8, 14);
    batch.add(roofG, metalDark, m4.makeTranslation(x, y + legH + r * 1.7 + r * 0.4, z));
    for (const f of [0.3, 1.4]) glow.add(new THREE.TorusGeometry(r * 1.01, 0.04, 4, 20).rotateX(Math.PI / 2), gl(C.pink, 1.6), m4.makeTranslation(x, y + legH + r * f, z));
  }

  function synthPalm(x: number, y: number, z: number, h: number, seed: number) {
    const r = mulberry(seed + 5);
    const trunkM = mats.mat(0x33265e);
    const segs = 7;
    let px = x, pz = z;
    const lx = (r() - 0.5) * 0.07, lz = (r() - 0.5) * 0.07;
    for (let i = 0; i < segs; i++) {
      const g = new THREE.CylinderGeometry(0.17 - i * 0.008, 0.23 - i * 0.008, h / segs + 0.04, 7);
      px += lx * (h / segs);
      pz += lz * (h / segs);
      batch.add(g, trunkM, m4.makeTranslation(px, y + (i + 0.5) * (h / segs), pz));
    }
    const topY = y + h;
    const leaf = new THREE.ConeGeometry(0.55, 3.2, 4, 1, true);
    leaf.rotateZ(-Math.PI / 2);
    leaf.translate(1.6, 0, 0);
    leaf.scale(1, 0.22, 1);
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const leafM = mats.mat(0x1c9c9a, { side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
      e.set(0, (i / 8) * Math.PI * 2 + r(), -0.45 - r() * 0.35);
      m4.compose(new THREE.Vector3(px, topY, pz), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
      batch.add(leaf, leafM, m4);
      // neon rib on each frond
      const a = e.y, dip = e.z;
      const tipx = px + Math.cos(a) * Math.cos(dip) * 3.1, tipz = pz - Math.sin(a) * Math.cos(dip) * 3.1, tipy = topY + Math.sin(dip) * 3.1;
      tube(glow, gl(C.cyan, 1.6), px, topY + 0.05, pz, tipx, tipy + 0.05, tipz, 0.025, 3);
    }
  }

  function stringLights() {
    const cols = [C.pink, C.gold, C.cyan, C.magenta, C.lime];
    const bulb = new THREE.SphereGeometry(0.09, 6, 4);
    const run = (a: THREE.Vector3, b: THREE.Vector3, sag: number) => {
      const n = Math.max(6, Math.round(a.distanceTo(b) / 0.9));
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * sag;
        if (prev) tube(batch, blackish, prev.x, prev.y, prev.z, p.x, p.y, p.z, 0.015, 3);
        if (i > 0 && i < n) glow.add(bulb, gl(cols[i % cols.length], 1.8), m4.makeTranslation(p.x, p.y - 0.1, p.z));
        prev = p;
      }
    };
    const blueLamps = lampTops.filter((p) => p.z > 0);
    const redLamps = lampTops.filter((p) => p.z < 0);
    for (const L of [blueLamps, redLamps]) {
      if (L.length < 2) continue;
      const s = L[0].z > 0 ? 1 : -1;
      run(L[0], L[1], 0.9);
      for (const p of L) run(p, new THREE.Vector3(Math.sign(p.x) * 5.9, 7.4, s * 14), 0.8);
    }
    // across the base alleys from the base fronts to the side roofs' lamp heights
    for (const s of [1, -1]) {
      run(new THREE.Vector3(-13.9 * s, 8.2, 33.3 * s), new THREE.Vector3(13.9 * s, 8.2, 33.3 * s), 1.2);
    }
  }

  function alleySigns() {
    // vertical signs hanging off the facades below the roof line (seen across/down the alleys)
    const spots: [number, number, number, number, number, string][] = [
      // x, z, top, nx, nz, slot  (blue half; mirrored)
      [-18, 20, H.lt, 1, 0, 'ramen'],
      [-18, -1, H.lt, 1, 0, 'hotel'],
      [13, 11, H.plaza, 1, 0, 'arcade'],
      [-13, 22, H.plaza, -1, 0, 'open'],
      [18, 25, H.rt, -1, 0, 'hotel'],
      [-30, 28, H.lt, 0, 1, 'arcade'],
      [8, 33, H.base, 0, -1, 'ramen'],
      [-20, 33, H.wing, 0, -1, 'open'],
      [30, 7, H.rt, 0, -1, 'ramen'],
    ];
    for (const [x, z, top, nx, nz, slot] of spots) {
      for (const s of [1, -1]) {
        const px = x * s, pz = z * s, fnx = nx * s, fnz = nz * s;
        const h = 6, w = 1.5;
        const y = top - 2.2 - h / 2;
        // sign stands out perpendicular from the wall: faces along the wall
        const ox = px + fnx * (w / 2 + 0.2), oz = pz + fnz * (w / 2 + 0.2);
        const ax = fnz, az = fnx; // along-wall direction
        batch.box(metalDark, ox, y, oz, fnx ? w + 0.3 : 0.2, h + 0.3, fnz ? w + 0.3 : 0.2);
        const sm = slot === 'open' ? flickerMat : paMat;
        sign(pa, sm, slot, w, h, ox + ax * 0.11, y, oz + az * 0.11, ax, az);
        sign(pa, sm, slot, w, h, ox - ax * 0.11, y, oz - az * 0.11, -ax, -az);
        tube(batch, metalMid, px, y + h / 2 - 0.2, pz, ox, y + h / 2 - 0.2, oz, 0.05, 4);
      }
    }
  }

  function holoEmblem(x: number, y: number, z: number, team: number) {
    const m = new THREE.Mesh(atlasPlane(pa, team === 0 ? 'catc' : 'catp', 7, 7), holoStatic);
    m.position.set(x, y, z);
    m.rotation.y = team === 0 ? Math.PI : 0;
    scene.add(m);
  }

  function hologram() {
    const y = H.dais;
    // projector ring
    for (const [r0, r1, c] of [[1.1, 1.35, C.cyan], [1.6, 1.7, C.magenta]] as const) {
      const ring = new THREE.RingGeometry(r0, r1, 36);
      ring.rotateX(-Math.PI / 2);
      glow.add(ring, gl(c, 2.2), m4.makeTranslation(0, y + 0.03, 0));
    }
    batch.add(new THREE.CylinderGeometry(0.9, 1.05, 0.12, 20), metalMid, m4.makeTranslation(0, y + 0.06, 0));
    glow.add(new THREE.CylinderGeometry(0.6, 0.6, 0.02, 20), gl(C.cyan, 2.5), m4.makeTranslation(0, y + 0.13, 0));
    // light cone
    const fade = T.fadeTexture();
    const coneMat = new THREE.MeshBasicMaterial({ map: fade, color: new THREE.Color(C.cyan).multiplyScalar(0.22), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 0.6, 4.2, 24, 1, true), coneMat);
    cone.position.set(0, y + 2.2, 0);
    scene.add(cone);
    // rotating cat head
    const holoTex = pa.tex;
    const holoMat = new THREE.MeshBasicMaterial({ map: holoTex, color: new THREE.Color(0.55, 0.75, 0.85), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    const holo = new THREE.Group();
    const a = new THREE.Mesh(atlasPlane(pa, 'catc', 3.2, 3.2), holoMat);
    const b2 = new THREE.Mesh(atlasPlane(pa, 'catp', 3.2, 3.2), holoMat);
    b2.rotation.y = Math.PI / 2;
    holo.add(a, b2);
    holo.position.set(0, y + 3.4, 0);
    holo.userData.dynamic = true;
    scene.add(holo);
    ctx.animate((_dt, t) => {
      holo.rotation.y = t * 0.6;
      holo.position.y = y + 3.4 + Math.sin(t * 1.7) * 0.15;
      const flick = 0.85 + Math.sin(t * 23) * 0.08 + (Math.sin(t * 1.3) > 0.97 ? -0.4 : 0);
      holoMat.color.setRGB(0.55 * flick, 0.75 * flick, 0.85 * flick);
    });
  }

  function nearCity() {
    const r = mulberry(77);
    // grid of blocks around the arena
    const blocks: { x0: number; z0: number; x1: number; z1: number; top: number }[] = [];
    const inArena = (x0: number, z0: number, x1: number, z1: number) => x1 > -37 && x0 < 37 && z1 > -51 && z0 < 51;
    for (let gx = -8; gx < 8; gx++)
      for (let gz = -10; gz < 10; gz++) {
        const bx = gx * 16 + 2, bz = gz * 16 + 3;
        const w = 9 + r() * 5, d = 9 + r() * 5;
        const x0 = bx + r() * (14 - w), z0 = bz + r() * (14 - d);
        const x1 = x0 + w, z1 = z0 + d;
        if (inArena(x0, z0, x1, z1)) continue;
        const dist = Math.max(Math.abs((x0 + x1) / 2) - 36, Math.abs((z0 + z1) / 2) - 50, 0);
        if (dist > 70) continue;
        if (low && dist > 40) continue;
        const k = r();
        let top: number;
        if (k < 0.55) top = -12 + r() * 14;
        else if (k < 0.85) top = 4 + r() * 16;
        else top = 22 + r() * 26;
        // keep the sunset view over the red base mostly clear
        if (Math.abs((x0 + x1) / 2) < 44 && (z0 + z1) / 2 < -50 && top > 6) top = -4 + r() * 10;
        blocks.push({ x0, z0, x1, z1, top });
      }
    for (const bl of blocks) {
      const fi = Math.floor(r() * facades.length);
      addWalls(far, facades[fi], bl.x0, bl.z0, bl.x1, bl.z1, STREET, bl.top);
      far.add(topQuad(bl.x0, bl.z0, bl.x1, bl.z1, bl.top, 6), metalDark);
      const col = [C.pink, C.cyan, C.purple, C.magenta, C.gold][Math.floor(r() * 5)];
      nearGlow(fgl(col), bl, col);
      // rooftop props
      const cx = (bl.x0 + bl.x1) / 2, cz = (bl.z0 + bl.z1) / 2;
      const p = r();
      if (p < 0.3) waterTowerFar(cx + (r() - 0.5) * 4, bl.top, cz + (r() - 0.5) * 4, 1.4 + r());
      else if (p < 0.55) far.box(metalMid, cx, bl.top + 0.6, cz, 2.2, 1.2, 1.5);
      if (bl.top > 12 && r() < 0.6) {
        // vertical sign hanging off a corner facing the arena
        const sx = cx > 0 ? bl.x0 : bl.x1, sz = cz > 0 ? bl.z0 : bl.z1;
        const nx = Math.abs(cx) > Math.abs(cz) * 0.7 ? -Math.sign(cx) : 0;
        const nz = nx ? 0 : -Math.sign(cz);
        const slot = ['hotel', 'ramen', 'arcade', 'open'][Math.floor(r() * 4)];
        const hgt = Math.min(9, bl.top - 2);
        sign(pa, paMat, slot, hgt / 4, hgt, sx + nx * 0.05 + (nz ? (cx > 0 ? 1.5 : -1.5) : 0), bl.top - hgt / 2 - 1, sz + nz * 0.05 + (nx ? (cz > 0 ? 1.5 : -1.5) : 0), nx, nz, far);
      }
    }
    // two landmark billboard towers (mirrored)
    for (const s of [1, -1]) {
      const x0 = s > 0 ? 40 : -54, x1 = x0 + 14, z0 = s > 0 ? -16 : 2, z1 = z0 + 14, top = 30;
      addWalls(far, facades[0], x0, z0, x1, z1, STREET, top);
      far.add(topQuad(x0, z0, x1, z1, top, 6), metalDark);
      const fx = s > 0 ? x0 : x1, n = -s;
      const w = 13, h = w / bb.aspect('nights');
      far.box(metalDark, fx + n * 0.3, top - 5, (z0 + z1) / 2, 0.6, h + 1, w + 1);
      sign(bb, bbMat, 'nights', w, h, fx + n * 0.62, top - 5, (z0 + z1) / 2, n, 0, far);
      nearGlow(fgl(C.magenta), { x0, z0, x1, z1, top }, C.magenta);
      rooftopGear((x0 + x1) / 2, top, (z0 + z1) / 2, s > 0 ? 1 : 0, true);
    }
  }

  function nearGlow(m: THREE.Material, bl: { x0: number; z0: number; x1: number; z1: number; top: number }, _col: number) {
    const t = 0.14;
    const { x0, z0, x1, z1, top } = bl;
    far.box(m, (x0 + x1) / 2, top - 0.3, z0, x1 - x0, t, t);
    far.box(m, (x0 + x1) / 2, top - 0.3, z1, x1 - x0, t, t);
    far.box(m, x0, top - 0.3, (z0 + z1) / 2, t, t, z1 - z0);
    far.box(m, x1, top - 0.3, (z0 + z1) / 2, t, t, z1 - z0);
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) far.box(m, cx, (top + STREET) / 2, cz, t, top - STREET, t);
  }

  function waterTowerFar(x: number, y: number, z: number, rr: number) {
    const legH = rr * 1.5;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      tube(far, metalMid, x + Math.cos(a) * rr * 0.8, y, z + Math.sin(a) * rr * 0.8, x + Math.cos(a) * rr * 0.7, y + legH, z + Math.sin(a) * rr * 0.7, 0.08, 4);
    }
    far.add(new THREE.CylinderGeometry(rr, rr, rr * 1.6, 10), mats.mat(0x4a3478), m4.makeTranslation(x, y + legH + rr * 0.8, z));
    far.add(new THREE.ConeGeometry(rr * 1.08, rr * 0.7, 10), metalDark, m4.makeTranslation(x, y + legH + rr * 1.6 + rr * 0.35, z));
  }

  function skyline() {
    const r = mulberry(99);
    const texs = [T.skylineTexture('#140c34', 3, 0.16), T.skylineTexture('#1a0f3c', 4, 0.1)];
    const ms = texs.map((t) => new THREE.MeshBasicMaterial({ map: t, color: 0xffffff }));
    const n = low ? 70 : 150;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.03;
      const d = 150 + r() * 130;
      const x = Math.sin(a) * d, z = Math.cos(a) * d * 1.1;
      // lower buildings right under the sun (-z) so the striped disc shows
      const towardSun = Math.max(0, -Math.cos(a));
      let h = 25 + Math.pow(r(), 1.6) * 85;
      if (towardSun > 0.95) h *= 0.3 + (1 - towardSun) * 8;
      const w = 12 + r() * 18, dd = 12 + r() * 18;
      const g = boxWalls(x - w / 2, z - dd / 2, x + w / 2, z + dd / 2, -30, h, 16, h);
      const m = ms[i % 2];
      for (const q of g) far.add(q, m);
      if (r() < 0.25) {
        // spire
        tube(far, m, x, h, z, x, h + 8 + r() * 14, z, 0.4, 4);
      }
    }
  }

  function streets() {
    // far-below street level with glowing avenues (seen through alleys and past the roof edges)
    const street = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshBasicMaterial({ color: 0x150930 }));
    street.rotation.x = -Math.PI / 2;
    street.position.y = STREET;
    scene.add(street);
    const r = mulberry(5);
    const cols = [C.pink, C.cyan, C.gold, C.magenta];
    for (let i = -8; i <= 8; i++) {
      const m = fgl(cols[(i + 8) % 4], 0.9);
      far.box(m, i * 16 + 1, STREET + 0.05, 0, 0.5, 0.1, 320);
      far.box(m, 0, STREET + 0.05, i * 16 + 2, 260, 0.1, 0.5);
      void r;
    }
    // glowing haze deep in the alleys
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(90, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb02cff).multiplyScalar(0.35), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    haze.rotation.x = -Math.PI / 2;
    haze.position.y = -12;
    scene.add(haze);
  }

  function searchlights() {
    const fade = T.fadeTexture();
    const mat = new THREE.MeshBasicMaterial({ map: fade, color: new THREE.Color(0.45, 0.3, 0.75), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    const geo = new THREE.CylinderGeometry(9, 0.7, 170, 20, 1, true);
    geo.translate(0, 85, 0);
    for (const [x, z, ph] of [[-70, -34, 0], [70, 34, 2.4], [-62, 60, 4.1], [62, -60, 1.3]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 6, z);
      const beam = new THREE.Mesh(geo, mat);
      beam.rotation.z = 0.5;
      pivot.add(beam);
      pivot.userData.dynamic = true;
      beam.userData.dynamic = true;
      scene.add(pivot);
      far.box(metalMid, x, 5, z, 3, 2, 3);
      far.add(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 12), gl(C.white, 2), m4.makeTranslation(x, 6.1, z));
      ctx.animate((_dt, t) => {
        pivot.rotation.y = t * 0.22 + ph;
        beam.rotation.z = 0.42 + Math.sin(t * 0.37 + ph) * 0.16;
      });
    }
  }

  function ufos() {
    const grp = new THREE.Group();
    const b = new Batcher(false, false);
    const hull = mats.mat(0x6b64c8);
    const r = mulberry(8);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.7;
      const d = 110 + i * 25;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = 55 + i * 12;
      const s = 3 + r() * 1.5;
      const disc = new THREE.SphereGeometry(s, 16, 8);
      disc.scale(1, 0.28, 1);
      b.add(disc, hull, m4.makeTranslation(x, y, z));
      b.add(new THREE.SphereGeometry(s * 0.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.glow(C.cyan, 1.3), m4.makeTranslation(x, y + s * 0.15, z));
      b.add(new THREE.TorusGeometry(s * 0.95, 0.18, 4, 24).rotateX(Math.PI / 2), mats.glow(i % 2 ? C.pink : C.gold, 2), m4.makeTranslation(x, y - 0.1, z));
    }
    b.flush(grp, false);
    grp.userData.dynamic = true;
    scene.add(grp);
    ctx.animate((dt) => { grp.rotation.y += dt * 0.02; });
  }
}

type BatcherLike = { add(g: THREE.BufferGeometry, m: THREE.Material, mat?: THREE.Matrix4): void };

function moon() {
  const tex = T.moonTexture();
  const m = new THREE.Mesh(new THREE.CircleGeometry(22, 40), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false, toneMapped: false, color: new THREE.Color(1.1, 1.05, 1.15) }));
  const d = new THREE.Vector3(-0.35, 0.42, 1).normalize().multiplyScalar(390);
  m.position.copy(d);
  m.lookAt(0, 0, 0);
  m.renderOrder = -6;
  return m;
}

function stars(n: number) {
  const r = mulberry(21);
  const pos: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1;
    const y = 0.12 + Math.pow(r(), 0.7) * 0.88;
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(1 - y * y);
    pos.push(Math.cos(a) * rr * 400, y * 400, Math.sin(a) * rr * 400);
    const c = new THREE.Color().setHSL(0.6 + r() * 0.3, 0.6, 0.75 + r() * 0.25);
    col.push(c.r, c.g, c.b);
    void u;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
  p.renderOrder = -5;
  p.frustumCulled = false;
  return p;
}
