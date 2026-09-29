import * as THREE from 'three';
import type { WorldDef, WorldBuildContext } from './types';
import type { BoxDef, RampDef } from '../world/Level';
import { LevelBuilder } from './builder';
import { skyDome, rampGeometry, bunting } from './common';
import { cardboardTexture, canvasTexture } from '../render/Materials';
import { Batcher } from '../render/Batcher';
import { mulberry } from '../core/utils';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  patchTexture, castleTexture, kraftTexture, boxTexture, crateTexture2, bannerTexture, riverTexture,
  bankTexture, signAtlas, crownDecal, crumpleTexture, tubeTexture, fibres, markerTexture,
} from './paper/tex';
import {
  pleatCone, prism, crumpleGeo, roundRectPts, blobPts, slabFromPts, archGeo, flatPoly, bannerGeo,
  craneGeo, cloudGeo, pennantGeo, triGeo,
} from './paper/geo';
import img from '../assets/paper.webp';

// ---------------------------------------------------------------- constants
const BLUE = 0x2f5fd8;
const RED = 0xdc3b2e;
const HX = 32;
const HZ = 46;
/** River bed height (shallow trench). */
const RY = -0.45;
/** River half width (z). */
const RZ = 3;
/** Visual water surface. */
const WY = -0.2;
/** Rampart walkway height. */
const WH = 4.2;
/** Tower height (out of reach from ramparts). */
const TH = 8;
/** Central bridge deck height. */
const DECK = 1.0;

type V3 = [number, number, number];

// ---------------------------------------------------------------- layout
function layout() {
  const L = new LevelBuilder(HX, HZ);

  // floors: two banks + a shallow river trench across the middle
  L.box([-HX - 8, -2, RZ], [HX + 8, 0, HZ + 8], 'floor');
  L.box([-HX - 8, -2, -HZ - 8], [HX + 8, 0, -RZ], 'floor');
  L.box([-HX - 8, -2, -RZ], [HX + 8, RY, RZ], 'riverbed');

  // outer boundary along the field (paper fence + hills visually)
  L.box([HX - 1, RY, -26.5], [HX, 12, 26.5], 'boundary', { invisible: true });
  L.box([-HX, RY, -26.5], [-HX + 1, 12, 26.5], 'boundary', { invisible: true });

  // ================= cardboard castles (blue authored, red = 180° twin)
  L.mBoxC(0, HZ - 0.5, 2 * HX, 1, 7, 'backwall');
  L.mBoxC(HX - 0.5, 36.25, 1, 19.5, 7, 'sidewall');
  L.mBoxC(-HX + 0.5, 36.25, 1, 19.5, 7, 'sidewall');
  L.mBoxC(0, 44, 14, 2, 9, 'keep');

  // front wall: two rampart sections, gate towers, corner towers, side towers
  L.mBoxC(13.5, 28.75, 14, 3.5, WH, 'cwall');
  L.mBoxC(-13.5, 28.75, 14, 3.5, WH, 'cwall');
  for (const x of [4.5, -4.5]) L.mBoxC(x, 28.75, 4, 4.5, TH, 'tower', 0, { data: { role: 'gate' } });
  for (const x of [22.5, -22.5]) L.mBoxC(x, 28.75, 4, 4.5, TH, 'tower', 0, { data: { role: 'corner' } });
  for (const x of [30, -30]) L.mBoxC(x, 28.75, 2, 4.5, TH, 'tower', 0, { data: { role: 'side' } });
  // crenellations (merlons) on the rampart fronts — sniper cover
  for (const s of [1, -1]) for (let i = 0; i < 7; i++) L.mBoxC(s * (7.5 + i * 2), 27.3, 1, 0.6, 1, 'merlon', WH);

  // right rampart: cardboard ramp + landing
  L.mRamp(14, 31.75, 10, 2.5, 'x', -1, 0, WH, 'cramp');
  L.mBoxC(7.75, 31.75, 2.5, 2.5, WH, 'landing');
  // left rampart: stacked-box staircase (1.2 / 1.25 / 1.25 jumps) + pop-up spring
  L.mBoxC(-18.75, 31.75, 2, 2.5, 1.2, 'stair');
  L.mBoxC(-16.75, 31.75, 2, 2.5, 2.45, 'stair');
  L.mBoxC(-14.75, 31.75, 2, 2.5, 3.7, 'stair');
  L.pad([-10, 0, 36], [-10, WH, 29]);

  // courtyard clutter
  L.mBoxC(-27.5, 33.5, 2, 2, 2, 'crate', 0, { data: { style: 'wood' } });
  L.mBoxC(-27.3, 35.7, 1.4, 1.4, 1.4, 'crate', 0, { data: { style: 'box' } });
  L.mBoxC(27.8, 42.8, 2, 2, 2, 'crate', 0, { data: { style: 'box' } });
  L.mBoxC(25.6, 43.3, 1.4, 1.4, 1.2, 'crate', 0, { data: { style: 'wood' } });
  L.mBoxC(-4.8, 34.2, 3, 1, 1.2, 'boxwall');
  L.mBoxC(4.8, 34.2, 3, 1, 1.2, 'boxwall');
  L.mBoxC(-11, 43.2, 1.2, 1.2, 1.4, 'cup');
  L.mBoxC(-28.6, 42.6, 3.6, 3, 2.4, 'tent');
  L.mBoxC(29.9, 34.3, 1.4, 2, 1.25, 'ream');
  L.mBoxC(11, 43.2, 1.2, 1.2, 1.4, 'cup');

  // ================= field (blue half)
  // left lane: origami forest, cardboard-tube log, crumpled rocks
  const trees: [number, number][] = [[-30, 21], [-21.5, 23.8], [-30, 10.5], [-21.2, 15.5], [-17.5, 21], [-16.8, 10.5], [-29.6, 5.2]];
  trees.forEach(([x, z], i) => L.mBoxC(x, z, 0.9, 0.9, 6, 'tree', 0, { data: { seed: i + 1 } }));
  L.mBoxC(-25.5, 17.6, 4.4, 1.2, 1.2, 'log');
  L.mBoxC(-26, 8.2, 2.6, 2.2, 1.8, 'rock', 0, { data: { seed: 3 } });
  L.mBoxC(-13, 18.5, 2, 1.8, 1.3, 'rock', 0, { data: { seed: 8 } });

  // centre lane
  L.mBoxC(-8.5, 13, 3.4, 3, 2.6, 'crownrock', 0, { data: { seed: 5 } });
  L.mBoxC(8, 12.5, 2.2, 2.2, 2.2, 'crate', 0, { data: { style: 'wood' } });
  L.mBoxC(9.9, 13.4, 1.4, 1.4, 1.4, 'crate', 0, { data: { style: 'box' } });
  L.mBoxC(0, 20.5, 2.2, 2.2, 2.2, 'crate', 0, { data: { style: 'wood', sign: 0 } });
  L.mBoxC(-2.15, 20.8, 1.8, 1.8, 1.2, 'crate', 0, { data: { style: 'box' } });
  L.mBoxC(2.05, 20.3, 1.6, 1.6, 1.6, 'crate', 0, { data: { style: 'box' } });
  L.mBoxC(-11, 22, 4.5, 1, 1.2, 'boxwall', 0, { data: { sign: 3 } });
  L.mBoxC(5.5, 16.5, 3.2, 1, 1.2, 'boxwall');
  L.mBoxC(-3.5, 10, 3, 1, 1.2, 'boxwall');
  L.mBoxC(12.5, 24.2, 1.2, 1.2, 1.4, 'cup');
  L.mBoxC(-9, 4.4, 1.8, 0.5, 1.4, 'standee', 0, { data: { slot: 5, ry: 0 } });

  // right lane: layered contour hill (0.5 m steps — walkable) + corridor along the fence
  const hill: [number, number, number, number, number][] = [
    [12.5, 8, 24.5, 23, 0.5],
    [14, 9.5, 24.5, 21.5, 1.0],
    [15.5, 11, 24.5, 20, 1.5],
    [17, 12.5, 24, 18.5, 2.0],
    [18.5, 13.5, 23, 17.5, 2.5],
  ];
  hill.forEach(([x0, z0, x1, z1, h], i) => L.mBoxC((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, h, 'hill', 0, { data: { layer: i } }));
  L.mBoxC(28.2, 11, 2.2, 2, 1.6, 'rock', 0, { data: { seed: 11 } });
  L.mBoxC(29.6, 18.6, 0.9, 0.9, 6, 'tree', 0, { data: { seed: 21 } });

  // ================= river crossing
  L.mBoxC(-25, 0, 5, 7.2, 0.3 - RY, 'bridge', RY);
  L.boxC(0, 0, 9, 2 * RZ, DECK - RY, 'deck', RY);
  L.mRamp(0, RZ + 2, 9, 4, 'z', -1, 0, DECK, 'bramp');
  L.mBoxC(-4.25, 2, 0.5, 2, 1, 'rail', DECK);
  L.mBoxC(4.25, 2, 0.5, 2, 1, 'rail', DECK);
  L.mBoxC(-2.3, -1.25, 1.3, 1.3, 1.1, 'crate', DECK, { data: { style: 'box' } });
  L.mBoxC(-13, 0.9, 1.7, 1.5, 0.7, 'stone', RY, { data: { seed: 31 } });
  L.mBoxC(-16.2, -0.8, 1.5, 1.4, 0.6, 'stone', RY, { data: { seed: 32 } });

  // ================= gameplay points
  const sp: [number, number][] = [[-26, 39.5], [-20.5, 42], [-14, 40.5], [-8, 38], [8, 38], [14, 40.5], [20.5, 42], [26, 39.5]];
  for (const [x, z] of sp) L.spawn(x, 0, z, 0);

  L.pickup('health', -26.5, 0, 12.5);
  L.pickup('health', 11, 0, 5.5);
  L.pickup('health', 27.5, 0, 37);
  L.pickup('ammo', -9.8, 0, 17.8);
  L.pickup('ammo', 27.8, 0, 21);
  L.pickup('ammo', -24.5, 0, 37.5);
  L.pickup('zapper', 13.5, WH, 29);
  L.pickup('overcharge', 20.75, 2.5, 15.5);
  L.pickup('boomer', 0, DECK, 0);

  L.flags([0, 0, 39]);
  L.zone([0, DECK, 0], 6.5);
  L.hotspot(-24, 0, 14);
  L.hotspot(20.75, 2.5, 15.5);
  L.hotspot(-8.5, 0, 17);
  L.hotspot(0, 0, 24.5);
  L.hotspot(13.5, WH, 29);
  L.hotspot(0, DECK, 0, false);
  return L.build();
}

// ---------------------------------------------------------------- helpers
/** Tan paper path cells (blue-local coords). */
function lanePath(x: number, z: number) {
  if (z > 23.2) return true;
  if (Math.abs(x) < 2.6 && z > 6.5) return true;
  const lx = -26.75 + ((27 - z) / 24) * 1.75;
  if (Math.abs(x - lx) < 2.1) return true;
  const rx = 27.5 - ((27 - z) / 24) * 2.5;
  if (Math.abs(x - rx) < 2.1) return true;
  return false;
}

const m4 = new THREE.Matrix4();
const q4 = new THREE.Quaternion();
const e4 = new THREE.Euler();
const v4 = new THREE.Vector3();
const s4 = new THREE.Vector3(1, 1, 1);

/** Matrix for a (blue-local) placement, rotated 180° for the red team. */
function T(team: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const f = team ? -1 : 1;
  e4.set(rx, ry + (team ? Math.PI : 0), rz, 'YXZ');
  return m4.compose(v4.set(x * f, y, z * f), q4.setFromEuler(e4), s4.set(sx, sy, sz));
}

function dims(b: BoxDef) {
  return {
    cx: (b.min[0] + b.max[0]) / 2, cy: (b.min[1] + b.max[1]) / 2, cz: (b.min[2] + b.max[2]) / 2,
    sx: b.max[0] - b.min[0], sy: b.max[1] - b.min[1], sz: b.max[2] - b.min[2],
    team: ((b.data?.team as number | undefined) ?? 0),
  };
}

/** Blue-local dims of a box (red twins are rotated back). */
function loc(b: BoxDef) {
  const d = dims(b);
  if (!d.team) return { ...d, x0: b.min[0], x1: b.max[0], z0: b.min[2], z1: b.max[2] };
  return { ...d, cx: -d.cx, cz: -d.cz, x0: -b.max[0], x1: -b.min[0], z0: -b.max[2], z1: -b.min[2] };
}

/** Box geometry with 0..1 UVs on every face (for crate/box textures). */
const faceBoxCache = new Map<string, THREE.BufferGeometry>();
function faceBox(sx: number, sy: number, sz: number) {
  const k = `${sx.toFixed(2)}|${sy.toFixed(2)}|${sz.toFixed(2)}`;
  let g = faceBoxCache.get(k);
  if (!g) faceBoxCache.set(k, (g = new THREE.BoxGeometry(sx, sy, sz)));
  return g;
}

// ---------------------------------------------------------------- build
function build(ctx: WorldBuildContext) {
  const { scene, level, mats, batch } = ctx;
  const far = new Batcher(false, false);

  // ---- materials (all cached via MaterialKit, reused everywhere)
  const tCastle = castleTexture(3);
  const tTube = tubeTexture();
  const M = {
    castle: mats.mat(0xffffff, { map: tCastle }),
    castleTop: mats.mat(0xffffff, { map: kraftTexture(4, '#dcb77f') }),
    planks: mats.mat(0xffffff, { map: kraftTexture(5, '#d4a76b', 6) }),
    kraft: mats.mat(0xffffff, { map: kraftTexture(6, '#c28d55') }),
    dark: mats.mat(0x4a2f1c),
    box: mats.mat(0xffffff, { map: boxTexture() }),
    crate: mats.mat(0xffffff, { map: crateTexture2() }),
    rock: mats.mat(0xb3b6bb, { map: crumpleTexture(51) }),
    rock2: mats.mat(0x9ea3aa, { map: crumpleTexture(52) }),
    cloud: mats.mat(0xffffff, { map: crumpleTexture(53, '#fbfaf6'), emissive: 0x8d949c, emissiveIntensity: 0.55 }),
    leafA: mats.mat(0x4f9d3a),
    leafB: mats.mat(0x6dbb4a),
    leafC: mats.mat(0x3c8436),
    trunk: mats.mat(0x8b5a2b),
    bark: mats.mat(0xffffff, { map: tTube }),
    hillTop: [mats.mat(0x8cc352), mats.mat(0x74b046), mats.mat(0x9ccd5d), mats.mat(0x68a53f), mats.mat(0x84bf4f)],
    hillSide: mats.mat(0xd6aa6a, { map: cardboardTexture() }),
    hillEdge: mats.mat(0x5b9a3b, { map: cardboardTexture() }),
    team: [mats.mat(BLUE), mats.mat(RED)],
    teamLight: [mats.mat(0x86a8f0), mats.mat(0xf29a8e)],
    banner: [
      mats.mat(0xffffff, { map: bannerTexture('#2f5fd8', '#172e78'), side: THREE.DoubleSide }),
      mats.mat(0xffffff, { map: bannerTexture('#dc3b2e', '#7a1712'), side: THREE.DoubleSide }),
    ],
    pennant: [mats.mat(BLUE, { side: THREE.DoubleSide }), mats.mat(RED, { side: THREE.DoubleSide })],
    cream: mats.mat(0xf4ecd8),
    tube: mats.mat(0xffffff, { map: tTube }),
    tubeIn: mats.mat(0x6e4523, { side: THREE.BackSide }),
    white: mats.mat(0xfbf8f0),
    string: mats.mat(0xe9e3d3),
    crane: mats.mat(0xffffff, { map: chiyogamiTex(), side: THREE.DoubleSide }),
    mountain: mats.mat(0x8e9fb6),
    mountain2: mats.mat(0x7a8ea8),
    snow: mats.mat(0xf7f5ef),
    farHill: mats.mat(0x86b59a),
    farHill2: mats.mat(0x9cc3a2),
    grass: mats.mat(0x78b947, { side: THREE.DoubleSide }),
    tentRoof: [
      mats.mat(0xffffff, { map: stripeTex('#2f5fd8', '#f4ecd8'), side: THREE.DoubleSide }),
      mats.mat(0xffffff, { map: stripeTex('#dc3b2e', '#f4ecd8'), side: THREE.DoubleSide }),
    ],
    target: mats.mat(0xffffff, { map: targetTex() }),
    doodle: mats.mat(0xffffff, { map: doodleTex(), transparent: true }),
    gold: mats.mat(0xf2bf3f),
    news: mats.mat(0xffffff, { map: newsTex(), side: THREE.DoubleSide }),
    ream: mats.mat(0xfbf9f3),
    flowers: [mats.mat(0xf2584a, { side: THREE.DoubleSide }), mats.mat(0xffd23f, { side: THREE.DoubleSide }), mats.mat(0xffffff, { side: THREE.DoubleSide })],
  };

  sky(ctx, M);
  ground(ctx);
  river(ctx, M);

  // ---- level boxes
  const signs = signAtlas([
    { text: 'PAPER BEATS\nROCK!', color: '#3a2412' },
    { text: 'NO SCISSORS\nPAST THIS POINT', color: '#c0271d' },
    { text: 'FOLD HARD,\nFIGHT HARDER!', color: '#2146a8' },
    { text: 'CAUTION:\nPAPER CUTS', color: '#3a2412', bg: '#f3c64a' },
    { text: 'BRIDGE: HANDLE\nWITH CARE', color: '#3a2412' },
    { text: 'KEEP DRY!\n(SERIOUSLY)', color: '#2146a8', bg: '#e9dcc0' },
    { text: 'CRUMPLE\nZONE', color: '#c0271d', bg: '#f6efe0' },
    { text: 'THIS WAY\nUP!', color: '#3a2412' },
  ]);
  const signMat = mats.mat(0xffffff, { map: signs.tex });
  /** Sign plane (w x h) at local placement facing +Z by default. */
  const sign = (team: number, slot: number, x: number, y: number, z: number, ry: number, w = 2.2, h = 1.1, board = true) => {
    const g = new THREE.PlaneGeometry(w, h);
    const r = signs.uv(slot);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
    batch.add(g, signMat, T(team, x, y, z, ry));
    if (board) {
      const bg = new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.05).translate(0, 0, -0.035);
      batch.add(bg, M.kraft, T(team, x, y, z, ry));
    }
  };

  const hr = mulberry(77);
  for (const b of level.boxes) {
    if (b.invisible) continue;
    const { cx, cy, cz, sx, sy, sz, team } = dims(b);
    // outward (toward the enemy) sign in world z for this team's castle
    const out = team ? 1 : -1;
    switch (b.kind) {
      case 'floor':
      case 'riverbed':
        break;
      case 'cwall': {
        batch.box(M.castle, cx, (WH - 0.12) / 2, cz, sx, WH - 0.12, sz);
        batch.box(M.castleTop, cx, WH - 0.06, cz, sx + 0.14, 0.12, sz + 0.14);
        const fz = out < 0 ? b.min[2] : b.max[2];
        batch.box(M.team[team], cx, WH - 0.62, fz + out * 0.03, sx, 0.32, 0.06);
        batch.box(M.team[team], cx, WH - 0.62, (out < 0 ? b.max[2] : b.min[2]) - out * 0.03, sx, 0.32, 0.06);
        // banners hanging over the outer face
        for (const bx of [cx - sx * 0.22, cx + sx * 0.22]) {
          const bg = bannerGeo(1.7, 3.0);
          m4.compose(v4.set(bx, WH - 0.85, fz + out * 0.09), q4.setFromEuler(e4.set(0, out < 0 ? Math.PI : 0, 0)), s4.set(1, 1, 1));
          batch.add(bg, M.banner[team], m4);
          batch.box(M.trunk, bx, WH - 0.8, fz + out * 0.14, 2.0, 0.1, 0.1);
        }
        break;
      }
      case 'merlon':
        batch.box(M.castle, cx, cy, cz, sx, sy, sz);
        batch.box(M.castleTop, cx, b.max[1] + 0.04, cz, sx + 0.1, 0.08, sz + 0.1);
        break;
      case 'landing':
        batch.box(M.castle, cx, (sy - 0.12) / 2, cz, sx, sy - 0.12, sz);
        batch.box(M.castleTop, cx, sy - 0.06, cz, sx + 0.1, 0.12, sz + 0.1);
        break;
      case 'tower':
        towerVis(b);
        break;
      case 'keep':
        keepVis(b);
        break;
      case 'backwall':
      case 'sidewall':
        perimeterWall(b);
        break;
      case 'crate': {
        const style = b.data?.style as string;
        batch.add(faceBox(sx, sy, sz), style === 'wood' ? M.crate : M.box, m4.makeTranslation(cx, cy, cz));
        if (b.data?.sign !== undefined) {
          const l = loc(b);
          sign(team, b.data.sign as number, l.cx, cy + 0.1, l.z0 - 0.02, Math.PI, 1.8, 0.9, false);
        }
        break;
      }
      case 'standee': {
        const l = loc(b);
        const ry = (b.data?.ry as number) ?? 0;
        batch.add(new THREE.BoxGeometry(sx, sy - 0.1, 0.08), M.kraft, T(team, l.cx, (sy - 0.1) / 2 + 0.1, l.cz));
        sign(team, b.data!.slot as number, l.cx, sy * 0.55, l.cz + (ry ? -0.045 : 0.045), ry, sx - 0.1, sy * 0.72, false);
        for (const s of [-1, 1]) batch.add(new THREE.BoxGeometry(0.1, 0.16, sz), M.trunk, T(team, l.cx + s * (sx / 2 - 0.1), 0.08, l.cz));
        const stand = flatPoly([[0, 0], [sz / 2 - 0.05, 0], [0, sy * 0.8]], true);
        batch.add(stand, M.kraft, T(team, l.cx, 0, l.cz + (ry ? 0.04 : -0.04), (ry ? -Math.PI / 2 : Math.PI / 2)));
        break;
      }
      case 'ream': {
        const n = Math.round(sy / 0.42);
        const h = sy / n;
        for (let i = 0; i < n; i++) {
          const jx = (hr() - 0.5) * 0.12, jz = (hr() - 0.5) * 0.12, ry = (hr() - 0.5) * 0.06;
          batch.add(new THREE.BoxGeometry(sx - 0.1, h - 0.03, sz - 0.1), M.ream, m4.compose(v4.set(cx + jx, h * (i + 0.5), cz + jz), q4.setFromEuler(e4.set(0, ry, 0)), s4.set(1, 1, 1)));
          batch.add(new THREE.BoxGeometry(sx - 0.06, h - 0.02, 0.5), M.teamLight[team], m4);
        }
        break;
      }
      case 'tent': {
        const l = loc(b);
        const eave = sy * 0.5, hz = sz / 2;
        // cloth walls
        for (const s of [-1, 1]) batch.add(new THREE.BoxGeometry(sx, eave, 0.06), M.cream, T(team, l.cx, eave / 2, l.cz + s * (hz - 0.03)));
        const gable = flatPoly([[-hz, 0], [hz, 0], [hz, eave], [0, sy], [-hz, eave]], true);
        for (const s of [-1, 1]) batch.add(gable, M.cream, T(team, l.cx + s * (sx / 2 - 0.03), 0, l.cz, Math.PI / 2));
        const door = flatPoly([[-0.55, 0], [0.55, 0], [0, 1.6]]);
        batch.add(door, M.dark, T(team, l.cx + sx / 2 + 0.01, 0, l.cz, Math.PI / 2));
        // striped roof panels
        const slope = Math.hypot(hz + 0.2, sy - eave + 0.05);
        const ang = Math.atan2(sy - eave + 0.05, hz + 0.2);
        for (const s of [-1, 1]) {
          const pg = new THREE.PlaneGeometry(sx + 0.3, slope);
          batch.add(pg, M.tentRoof[team], T(team, l.cx, (sy + eave) / 2 - 0.02, l.cz + s * (hz + 0.2) / 2, 0, -Math.PI / 2 + s * ang));
        }
        batch.add(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), M.trunk, T(team, l.cx - sx / 2 + 0.15, sy + 0.45, l.cz));
        batch.add(pennantGeo(0.8, 0.45), M.pennant[team], T(team, l.cx - sx / 2 + 0.15, sy + 0.5, l.cz));
        break;
      }
      case 'stair': {
        const n = Math.round(sy / 1.2);
        const h = sy / n;
        for (let i = 0; i < n; i++) {
          const jx = (hr() - 0.5) * 0.08, jz = (hr() - 0.5) * 0.08;
          batch.add(faceBox(sx - 0.04, h - 0.02, sz - 0.04), i % 2 ? M.crate : M.box, m4.makeTranslation(cx + jx, h * (i + 0.5), cz + jz));
        }
        break;
      }
      case 'boxwall': {
        const alongX = sx >= sz;
        const len = alongX ? sx : sz, dep = alongX ? sz : sx;
        const rows = Math.round(sy / 0.6);
        const rh = sy / rows;
        for (let rI = 0; rI < rows; rI++) {
          let t = rI % 2 ? 0.35 : 0;
          const segs: number[] = [];
          if (t > 0) segs.push(t);
          while (t < len - 0.01) {
            const l = Math.min(len - t, 0.75 + hr() * 0.4);
            segs.push(l);
            t += l;
          }
          let acc = 0;
          for (const l of segs) {
            const mid = -len / 2 + acc + l / 2;
            acc += l;
            const bx = alongX ? cx + mid : cx, bz = alongX ? cz : cz + mid;
            const g = faceBox(alongX ? l - 0.03 : dep - hr() * 0.08, rh - 0.02, alongX ? dep - hr() * 0.08 : l - 0.03);
            batch.add(g, hr() > 0.3 ? M.box : M.crate, m4.makeTranslation(bx, b.min[1] + rh * (rI + 0.5), bz));
          }
        }
        if (b.data?.sign !== undefined) {
          const l = loc(b);
          sign(team, b.data.sign as number, l.cx, 0.62, l.z0 - 0.07, Math.PI, 1.8, 0.9);
        }
        break;
      }
      case 'cup': {
        const r = sx / 2;
        batch.add(new THREE.CylinderGeometry(r, r * 0.8, sy - 0.08, 14), M.white, m4.makeTranslation(cx, sy / 2 - 0.04, cz));
        batch.add(new THREE.CylinderGeometry(r * 0.97, r * 0.9, sy * 0.35, 14, 1, true), M.team[team], m4.makeTranslation(cx, sy * 0.5, cz));
        batch.add(new THREE.TorusGeometry(r * 0.98, 0.05, 5, 16).rotateX(Math.PI / 2), M.white, m4.makeTranslation(cx, sy - 0.05, cz));
        break;
      }
      case 'rock':
      case 'stone':
      case 'crownrock': {
        const seed = (b.data?.seed as number) ?? 1;
        const g = crumpleGeo(sx * 1.08, sy + 0.05, sz * 1.08, seed + team * 100, 0.14, 1, 0.55);
        if (b.kind === 'crownrock') {
          // flatten the face toward its own base for the doodle
          const p = g.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < p.count; i++) if (p.getZ(i) > sz * 0.4) p.setZ(i, sz * 0.4);
          g.computeVertexNormals();
        }
        m4.compose(v4.set(cx, b.min[1], cz), q4.setFromEuler(e4.set(0, team ? Math.PI : 0, 0)), s4.set(1, 1, 1));
        batch.add(g, seed % 2 ? M.rock : M.rock2, m4);
        if (b.kind === 'crownrock') {
          const dec = new THREE.PlaneGeometry(2.1, 2.1);
          const dm = mats.mat(0xffffff, { map: crownDecal(team ? '#c0271d' : '#2146a8'), transparent: true });
          const l = loc(b);
          batch.add(dec, dm, T(team, l.cx, sy * 0.5, l.cz + sz * 0.4 + 0.03, 0));
        }
        break;
      }
      case 'tree':
        origamiTree(batch, M, cx, 0, cz, 7.4, (b.data?.seed as number) ?? 1);
        break;
      case 'log': {
        const r = sy / 2;
        const g = new THREE.CylinderGeometry(r, r, sx, 18, 1, true).rotateZ(Math.PI / 2);
        batch.add(g, M.tube, m4.makeTranslation(cx, r, cz));
        batch.add(new THREE.CylinderGeometry(r * 0.86, r * 0.86, sx - 0.02, 18, 1, true).rotateZ(Math.PI / 2), M.tubeIn, m4.makeTranslation(cx, r, cz));
        for (const s of [-1, 1]) {
          const ring = new THREE.RingGeometry(r * 0.86, r, 18).rotateY(s * Math.PI / 2);
          batch.add(ring, M.kraft, m4.makeTranslation(cx + (s * sx) / 2, r, cz));
        }
        break;
      }
      case 'hill': {
        const layer = (b.data?.layer as number) ?? 0;
        const pts = roundRectPts(b.min[0], b.min[2], b.max[0], b.max[2], 0.6, 0.1, 40 + layer + team * 10);
        const [top, side] = slabFromPts(pts, layer === 0 ? -0.02 : sy - 0.52, sy);
        batch.add(top, M.hillTop[layer % M.hillTop.length]);
        batch.add(side, M.hillSide);
        break;
      }
      case 'bridge': {
        batch.box(M.kraft, cx, (b.min[1] + 0.18) / 2, cz, sx - 0.3, 0.18 - b.min[1], sz);
        batch.box(M.planks, cx, 0.24, cz, sx, 0.12, sz);
        for (const s of [-1, 1]) batch.box(M.trunk, cx + s * (sx / 2 - 0.08), 0.22, cz, 0.16, 0.2, sz + 0.1);
        for (const s of [-1, 1]) for (const zz of [-2.2, 0, 2.2]) batch.box(M.trunk, cx + s * (sx / 2 - 0.2), WY - 0.1, cz + zz, 0.3, 0.5, 0.3);
        break;
      }
      case 'deck': {
        batch.box(M.kraft, cx, (b.min[1] + DECK - 0.12) / 2, cz, sx, DECK - 0.12 - b.min[1], sz);
        batch.box(M.planks, cx, DECK - 0.06, cz, sx + 0.1, 0.12, sz + 0.04);
        // painted arches on the sides
        for (const s of [-1, 1]) {
          const arch = flatPoly(Array.from({ length: 13 }, (_, i) => {
            const a = Math.PI - (i / 12) * Math.PI;
            return [Math.cos(a) * 1.9, Math.sin(a) * 0.95] as [number, number];
          }));
          m4.compose(v4.set(cx + s * (sx / 2 + 0.015), WY, cz), q4.setFromEuler(e4.set(0, s * Math.PI / 2, 0)), s4.set(1, 1, 1));
          batch.add(arch, M.dark, m4);
          batch.box(M.trunk, cx + s * (sx / 2 + 0.05), DECK - 0.2, cz, 0.12, 0.22, sz + 0.2);
        }
        break;
      }
      case 'rail': {
        batch.box(M.kraft, cx, cy - 0.05, cz, sx - 0.1, sy - 0.1, sz);
        batch.box(M.trunk, cx, b.max[1] - 0.05, cz, sx + 0.04, 0.12, sz + 0.1);
        for (const s of [-1, 1]) batch.box(M.trunk, cx, cy, cz + s * (sz / 2 - 0.08), sx + 0.06, sy, 0.16);
        break;
      }
      default:
        batch.box(M.kraft, cx, cy, cz, sx, sy, sz);
    }
  }

  for (const r of level.ramps) rampVis(r);

  // ---- per-team castle extras (gate arches, keep dressing, bunting, signs)
  for (const team of [0, 1]) castleExtras(team);

  // bridge signage + central crane mobile
  sign(0, 4, 4.52, DECK + 0.5, 2, Math.PI / 2, 1.6, 0.8, false);
  sign(1, 4, 4.52, DECK + 0.5, 2, Math.PI / 2, 1.6, 0.8, false);
  sign(0, 6, -4.52, DECK + 0.5, 2, -Math.PI / 2, 1.6, 0.8, false);
  sign(1, 6, -4.52, DECK + 0.5, 2, -Math.PI / 2, 1.6, 0.8, false);
  for (const team of [0, 1]) sign(team, 1, 22.5, 3.2, 26.44, Math.PI, 2.4, 1.2);
  crane(ctx, M);
  flock(ctx, M);
  decor(ctx, M);
  backdrop(far, M, ctx);
  clouds(ctx, M);

  far.flush(scene, false);

  // ================================================================= inner helpers
  function towerVis(b: BoxDef) {
    const { cx, cz, sx, sz, team } = dims(b);
    const role = b.data?.role as string;
    const out = team ? 1 : -1;
    const h = b.max[1];
    batch.box(M.castle, cx, (h - 0.5) / 2, cz, sx, h - 0.5, sz);
    batch.box(M.castle, cx, h - 0.25, cz, sx + 0.5, 0.5, sz + 0.5);
    batch.box(M.castleTop, cx, h + 0.02, cz, sx + 0.3, 0.06, sz + 0.3);
    batch.box(M.team[team], cx, h - 0.72, cz, sx + 0.06, 0.3, sz + 0.06);
    // visual merlons on top
    const ex = (sx + 0.5) / 2, ez = (sz + 0.5) / 2;
    const nX = Math.max(2, Math.round((sx + 0.5) / 1.3)), nZ = Math.max(2, Math.round((sz + 0.5) / 1.3));
    for (let i = 0; i < nX; i++) {
      const x = cx - ex + 0.3 + (i * (2 * ex - 0.6)) / (nX - 1);
      batch.box(M.castle, x, h + 0.45, cz - ez + 0.2, 0.6, 0.9, 0.4);
      batch.box(M.castle, x, h + 0.45, cz + ez - 0.2, 0.6, 0.9, 0.4);
    }
    for (let i = 1; i < nZ - 1; i++) {
      const z = cz - ez + 0.3 + (i * (2 * ez - 0.6)) / (nZ - 1);
      batch.box(M.castle, cx - ex + 0.2, h + 0.45, z, 0.4, 0.9, 0.6);
      batch.box(M.castle, cx + ex - 0.2, h + 0.45, z, 0.4, 0.9, 0.6);
    }
    // arrow slits
    const fz = out < 0 ? b.min[2] : b.max[2];
    for (const y of [2.2, 5.2]) {
      if (role === 'side') continue;
      batch.box(M.dark, cx, y, fz + out * 0.02, 0.24, 1.1, 0.05);
      batch.box(M.dark, cx, y, (out < 0 ? b.max[2] : b.min[2]) - out * 0.02, 0.24, 1.1, 0.05);
    }
    if (role !== 'side') {
      // flag pole + pennant
      const px = cx + (role === 'gate' ? 0 : 0), pz = cz;
      batch.add(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6), M.trunk, m4.makeTranslation(px, h + 1.8, pz));
      const pg = pennantGeo(2.2, 1.0);
      const dir = cx >= 0 ? 1 : -1;
      m4.compose(v4.set(px, h + 2.5, pz), q4.setFromEuler(e4.set(0, dir > 0 ? 0 : Math.PI, 0)), s4.set(1, 1, 1));
      batch.add(pg, M.pennant[team], m4);
      // big banner on the outer face
      const bw = role === 'gate' ? 2.2 : 2.0;
      m4.compose(v4.set(cx, h - 1.3, fz + out * 0.28), q4.setFromEuler(e4.set(0, out < 0 ? Math.PI : 0, 0)), s4.set(1, 1, 1));
      batch.add(bannerGeo(bw, 3.8), M.banner[team], m4);
    }
  }

  function keepVis(b: BoxDef) {
    const { cx, cz, sx, team } = dims(b);
    const out = team ? 1 : -1;
    const fz = out < 0 ? b.min[2] : b.max[2];
    const back = fz - out * 7; // visual depth behind the arena
    const zc = (fz + back) / 2, dz = 7;
    const h = b.max[1];
    batch.box(M.castle, cx, h / 2, zc, sx, h, dz);
    batch.box(M.castleTop, cx, h + 0.03, zc, sx + 0.2, 0.06, dz + 0.2);
    batch.box(M.team[team], cx, h - 0.7, zc, sx + 0.06, 0.3, dz + 0.06);
    for (let i = 0; i < 9; i++) batch.box(M.castle, cx - sx / 2 + 0.4 + (i * (sx - 0.8)) / 8, h + 0.45, fz - out * 0.25, 0.7, 0.9, 0.5);
    // central donjon
    const tz = fz - out * 3.2;
    batch.box(M.castle, cx, h + 3, tz, 6, 6, 4.5);
    batch.box(M.castle, cx, h + 6.2, tz, 6.6, 0.5, 5.1);
    batch.box(M.team[team], cx, h + 5.6, tz, 6.06, 0.3, 4.56);
    for (let i = 0; i < 5; i++) {
      batch.box(M.castle, cx - 3 + 0.3 + i * 1.35, h + 6.9, tz - 2.3, 0.6, 0.9, 0.4);
      batch.box(M.castle, cx - 3 + 0.3 + i * 1.35, h + 6.9, tz + 2.3, 0.6, 0.9, 0.4);
    }
    batch.add(new THREE.CylinderGeometry(0.1, 0.12, 6, 6), M.trunk, m4.makeTranslation(cx, h + 9.4, tz));
    const pg = pennantGeo(3.4, 1.7);
    m4.compose(v4.set(cx, h + 10.5, tz), q4.setFromEuler(e4.set(0, team ? Math.PI : 0, 0)), s4.set(1, 1, 1));
    batch.add(pg, M.pennant[team], m4);
    // windows on the donjon
    for (const wx of [-1.5, 1.5]) batch.box(M.dark, cx + wx, h + 3.2, tz + out * 2.27, 0.5, 1.4, 0.05);
    // great banner + door
    m4.compose(v4.set(cx, h - 0.4, fz + out * 0.05), q4.setFromEuler(e4.set(0, out < 0 ? Math.PI : 0, 0)), s4.set(1, 1, 1));
    batch.add(bannerGeo(3.2, 5.4), M.banner[team], m4);
    for (const wx of [-5, 5]) {
      m4.compose(v4.set(cx + wx, h - 1, fz + out * 0.05), q4.setFromEuler(e4.set(0, out < 0 ? Math.PI : 0, 0)), s4.set(1, 1, 1));
      batch.add(bannerGeo(1.6, 3.2), M.banner[team], m4);
    }
    const door = flatPoly([[-1.3, 0], [1.3, 0], [1.3, 1.9], ...Array.from({ length: 9 }, (_, i) => {
      const a = (i / 8) * Math.PI;
      return [Math.cos(a) * 1.3, 1.9 + Math.sin(a) * 1.3] as [number, number];
    }).slice(1, 8), [-1.3, 1.9]]);
    m4.compose(v4.set(cx, 0, fz + out * 0.02), q4.setFromEuler(e4.set(0, out < 0 ? Math.PI : 0, 0)), s4.set(1, 1, 1));
    batch.add(door, M.crate, m4);
  }

  function perimeterWall(b: BoxDef) {
    const { cx, cz, sx, sz, team } = dims(b);
    const h = b.max[1];
    // thicken outward so the wall reads chunky from the courtyard and from far away
    const alongX = sx > sz;
    const thick = 2.2;
    let vx = cx, vz = cz, vsx = sx, vsz = sz;
    if (alongX) { vsz = thick; vz = cz + Math.sign(cz) * (thick - sz) / 2; }
    else { vsx = thick; vx = cx + Math.sign(cx) * (thick - sx) / 2; }
    batch.box(M.castle, vx, h / 2, vz, vsx, h, vsz);
    batch.box(M.castleTop, vx, h + 0.03, vz, vsx + 0.1, 0.06, vsz + 0.1);
    const len = alongX ? vsx : vsz;
    const n = Math.floor(len / 1.4);
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i + 0.5) * (len / n);
      const inner = alongX ? vz - Math.sign(cz) * (thick / 2 - 0.25) : vx - Math.sign(cx) * (thick / 2 - 0.25);
      if (alongX) batch.box(M.castle, vx + t, h + 0.45, inner, 0.7, 0.9, 0.5);
      else batch.box(M.castle, inner, h + 0.45, vz + t, 0.5, 0.9, 0.7);
    }
    // team trim on the courtyard face
    if (alongX) batch.box(M.team[team], vx, h - 0.6, cz - Math.sign(cz) * (sz / 2 + 0.03), vsx, 0.3, 0.06);
    else batch.box(M.team[team], cx - Math.sign(cx) * (sx / 2 + 0.03), h - 0.6, vz, 0.06, 0.3, vsz);
    // banners on the courtyard face
    const spots = alongX ? [-24, -15.5, 15.5, 24] : [-5, 4];
    for (const t of spots) {
      const bx = alongX ? t : cx - Math.sign(cx) * (sx / 2 + 0.05);
      const bz = alongX ? cz - Math.sign(cz) * (sz / 2 + 0.05) : vz + t;
      const face = alongX ? (cz > 0 ? Math.PI : 0) : (cx > 0 ? -Math.PI / 2 : Math.PI / 2);
      m4.compose(v4.set(bx, h - 0.9, bz), q4.setFromEuler(e4.set(0, face, 0)), s4.set(1, 1, 1));
      batch.add(bannerGeo(1.5, 2.8), M.banner[team], m4);
    }
  }

  function rampVis(r: RampDef) {
    const isBridge = r.kind === 'bramp';
    batch.add(rampGeometry(r), isBridge ? M.kraft : M.castle);
    // plank / tread overlay on top
    const g = rampGeometry({ ...r, h0: r.h0 + 0.03, h1: r.h1 + 0.03, min: [r.min[0] + 0.02, r.min[1], r.min[2] + 0.02], max: [r.max[0] - 0.02, r.max[1], r.max[2] - 0.02] });
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const keep: number[] = [];
    for (let i = 0; i < 6; i++) keep.push(p.getX(i), p.getY(i), p.getZ(i));
    const top = triGeo(keep, 0.25, 'xz');
    batch.add(top, isBridge ? M.planks : M.castleTop);
    // tread lines
    const len = r.axis === 'x' ? r.max[0] - r.min[0] : r.max[2] - r.min[2];
    const w = r.axis === 'x' ? r.max[2] - r.min[2] : r.max[0] - r.min[0];
    const n = Math.floor(len / 0.7);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const along = (r.axis === 'x' ? r.min[0] : r.min[2]) + t * len;
      const tt = r.dir === 1 ? t : 1 - t;
      const hh = r.h0 + (r.h1 - r.h0) * tt + 0.05;
      if (r.axis === 'x') batch.box(M.trunk, along, hh, (r.min[2] + r.max[2]) / 2, 0.08, 0.05, w - 0.1);
      else batch.box(M.trunk, (r.min[0] + r.max[0]) / 2, hh, along, w - 0.1, 0.05, 0.08);
    }
  }

  function castleExtras(team: number) {
    // gate arch lintel (visual only, above head height, out of reach)
    const gate = archGeo(5, 7, 3.3, 3.0);
    batch.add(gate, M.castle, T(team, 0, 0, 28.75));
    batch.add(new THREE.BoxGeometry(5.6, 0.5, 3.6), M.castle, T(team, 0, 7.25, 28.75));
    batch.add(new THREE.BoxGeometry(5.2, 0.3, 3.1), M.team[team], T(team, 0, 6.6, 28.75));
    for (let i = 0; i < 4; i++) batch.add(new THREE.BoxGeometry(0.7, 0.9, 0.5), M.castle, T(team, -2.1 + i * 1.4, 7.9, 27.2));
    // raised portcullis
    for (let x = -2; x <= 2.01; x += 0.5) {
      const top = 3.3 + Math.sqrt(Math.max(0, 2.5 * 2.5 - x * x)) - 0.05;
      const bot = 4.35;
      if (top - bot < 0.2) continue;
      batch.add(new THREE.BoxGeometry(0.1, top - bot, 0.1), M.dark, T(team, x, (top + bot) / 2, 28.75));
      batch.add(new THREE.ConeGeometry(0.08, 0.3, 4), M.dark, T(team, x, bot - 0.15, 28.75, 0, Math.PI));
    }
    for (const y of [4.6, 5.2]) {
      const hw = Math.sqrt(Math.max(0, 2.5 * 2.5 - (y - 3.3) ** 2));
      batch.add(new THREE.BoxGeometry(2 * hw - 0.1, 0.1, 0.1), M.dark, T(team, 0, y, 28.75));
    }
    // side passage arches
    for (const sx of [1, -1]) {
      batch.add(archGeo(4.5, 7, 3.6, 3.2), M.castle, T(team, sx * 26.75, 0, 28.75));
      batch.add(new THREE.BoxGeometry(4.5, 0.3, 3.3), M.team[team], T(team, sx * 26.75, 6.6, 28.75));
      for (let i = 0; i < 3; i++) batch.add(new THREE.BoxGeometry(0.7, 0.9, 0.5), M.castle, T(team, sx * 26.75 - 1.5 + i * 1.5, 7.45, 27.1));
    }
    // courtyard bunting (team colours)
    const f = team ? -1 : 1;
    const cols = team ? [RED, 0xffffff, 0xf2bf3f] : [BLUE, 0xffffff, 0xf2bf3f];
    bunting(scene, mats, new THREE.Vector3(-20.5 * f, 7.6, 31 * f), new THREE.Vector3(-6.5 * f, 8.8, 43 * f), cols, 1.6, 14, batch);
    bunting(scene, mats, new THREE.Vector3(20.5 * f, 7.6, 31 * f), new THREE.Vector3(6.5 * f, 8.8, 43 * f), cols, 1.6, 14, batch);
    bunting(scene, mats, new THREE.Vector3(-6.5 * f, 7.6, 31 * f), new THREE.Vector3(6.5 * f, 7.6, 31 * f), cols, 1.0, 10, batch);
    // courtyard signs & dressing
    sign(team, 2, -10.5, 1.9, 30.56, 0, 2.6, 1.3);
    sign(team, 7, -14.75, 3.0, 33.06, 0, 1.4, 0.7);
    // marker doodles on the walls
    const doodle = (slot: number, x: number, y: number, z: number, ry: number, size = 1.3) => {
      const g = new THREE.PlaneGeometry(size, size);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const u0 = (slot % 2) * 0.5, v0 = slot < 2 ? 0.5 : 0;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
      batch.add(g, M.doodle, T(team, x, y, z, ry));
    };
    doodle(0, 17, 1.6, 26.97, Math.PI, 1.6);
    doodle(2, -9, 1.3, 26.97, Math.PI, 1.1);
    doodle(1, -26, 4.6, 30.52, 0, 1.4);
    doodle(3, 16.5, 1.4, 30.52, 0, 0.9);
    doodle(0, 30.95, 1.7, 41, -Math.PI / 2, 1.5);
    // royal runner from the keep door to the gate, through the flag stand
    batch.add(new THREE.PlaneGeometry(2.5, 11.8).rotateX(-Math.PI / 2), M.team[team], T(team, 0, 0.03, 37.1));
    for (const s of [-1, 1]) batch.add(new THREE.PlaneGeometry(0.25, 11.8).rotateX(-Math.PI / 2), M.gold, T(team, s * 1.375, 0.03, 37.1));
    for (let z = 32; z < 43; z += 1.6) batch.add(new THREE.CircleGeometry(0.22, 5).rotateX(-Math.PI / 2), M.gold, T(team, 0, 0.065, z, 0.3));
    // archery targets on the side walls
    for (const [x, z] of [[-30.98, 36.5], [30.98, 34], [30.98, 38.5]] as const) {
      batch.add(new THREE.CircleGeometry(0.9, 20), M.target, T(team, x, 2.4, z, x < 0 ? Math.PI / 2 : -Math.PI / 2));
    }
    // piles of crumpled paper-ball ammo on the courtyard barricades
    for (const bx of [-4.8, 4.8]) {
      const pile: [number, number, number][] = [[-0.9, 0, 0], [0, 0, 0.05], [0.9, 0, -0.05], [-0.45, 0.62, 0], [0.45, 0.62, 0], [0, 1.2, 0]];
      pile.forEach(([dx, dy, dz], k) => batch.add(crumpleGeo(0.72, 0.68, 0.72, 300 + k, 0.18, 1, 0.9, false), M.white, T(team, bx + dx, 1.2 + dy, 34.2 + dz)));
    }
  }
}

function stripeTex(a: string, b: string) {
  return canvasTexture(128, 128, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect((i * w) / 8, 0, w / 8 + 1, h);
    }
    fibres(g, w, h, 4, 300, 0.15);
  });
}

/** Newsprint for paper boats. */
function newsTex() {
  return markerTexture(256, 256, (g, w, h) => {
    const r = mulberry(5);
    g.fillStyle = '#efeadc';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b2b2b';
    g.font = `bold 30px Georgia, serif`;
    g.textAlign = 'center';
    g.fillText('PAPER TIMES', w / 2, 36);
    g.fillRect(12, 46, w - 24, 3);
    for (let c = 0; c < 3; c++) {
      for (let y = 62; y < h - 8; y += 9) {
        const lw = (w - 48) / 3 - (r() < 0.15 ? 20 : 0);
        g.fillStyle = `rgba(40,40,40,${0.35 + r() * 0.25})`;
        g.fillRect(12 + c * ((w - 24) / 3 + 0), y, lw, 4);
      }
    }
    g.fillStyle = 'rgba(40,40,40,0.5)';
    g.fillRect(96, 70, 70, 50);
  }, { repeat: true });
}

/** Patterned origami paper (gold with red waves and white dots). */
function chiyogamiTex() {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = mulberry(88);
    g.fillStyle = '#f2b93b';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d2432f';
    g.lineWidth = 5;
    for (let y = 16; y < h + 32; y += 32) {
      for (let x = (y / 32) % 2 ? 0 : 16; x < w + 32; x += 32) {
        g.beginPath();
        g.arc(x, y, 12, Math.PI, 0);
        g.stroke();
      }
    }
    g.fillStyle = '#fff6e0';
    for (let i = 0; i < 60; i++) {
      g.beginPath();
      g.arc(r() * w, r() * h, 2 + r() * 2.5, 0, Math.PI * 2);
      g.fill();
    }
    fibres(g, w, h, 12, 400, 0.14);
  }, { repeat: true });
}

/** 2x2 atlas of marker doodles on a transparent background. */
function doodleTex() {
  return canvasTexture(512, 512, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const ink = 'rgba(45,28,14,0.85)';
    // 0: stick knight with sword + shield
    g.save(); g.translate(128, 128);
    g.strokeStyle = ink; g.lineWidth = 7;
    g.beginPath(); g.arc(0, -62, 22, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-22, -70); g.lineTo(22, -70); g.lineTo(18, -88); g.lineTo(-18, -88); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(0, -40); g.lineTo(0, 30); g.moveTo(0, 30); g.lineTo(-26, 90); g.moveTo(0, 30); g.lineTo(26, 90);
    g.moveTo(0, -20); g.lineTo(-40, 5); g.moveTo(0, -20); g.lineTo(44, -30); g.stroke();
    g.beginPath(); g.moveTo(44, -30); g.lineTo(92, -92); g.moveTo(34, -44); g.lineTo(56, -22); g.stroke();
    g.beginPath(); g.ellipse(-44, 12, 22, 30, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
    // 1: smiley sun
    g.save(); g.translate(384, 128);
    g.strokeStyle = '#e8a21f'; g.lineWidth = 8;
    g.beginPath(); g.arc(0, 0, 48, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 64, Math.sin(a) * 64); g.lineTo(Math.cos(a) * 92, Math.sin(a) * 92); g.stroke(); }
    g.strokeStyle = ink; g.lineWidth = 7;
    g.beginPath(); g.arc(0, 6, 26, 0.2, Math.PI - 0.2); g.stroke();
    g.fillStyle = ink; g.beginPath(); g.arc(-16, -12, 6, 0, 7); g.arc(16, -12, 6, 0, 7); g.fill();
    g.restore();
    // 2: tally marks
    g.save(); g.translate(128, 384);
    g.strokeStyle = ink; g.lineWidth = 8;
    for (let k = 0; k < 2; k++) {
      const ox = -80 + k * 100;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(ox + i * 16, -40); g.lineTo(ox + i * 16 + 3, 40); g.stroke(); }
      g.beginPath(); g.moveTo(ox - 10, 30); g.lineTo(ox + 60, -30); g.stroke();
    }
    g.restore();
    // 3: heart
    g.save(); g.translate(384, 384);
    g.strokeStyle = '#d23a2e'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(0, 60); g.bezierCurveTo(-110, -10, -50, -90, 0, -30); g.bezierCurveTo(50, -90, 110, -10, 0, 60); g.stroke();
    g.restore();
  });
}

function targetTex() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#f4ecd8';
    g.fillRect(0, 0, w, h);
    ['#dc3b2e', '#f4ecd8', '#dc3b2e', '#f4ecd8', '#f2bf3f'].forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(w / 2, h / 2, (w / 2) * (1 - i * 0.19), 0, Math.PI * 2);
      g.fill();
    });
    g.strokeStyle = 'rgba(60,30,10,0.7)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(w * 0.62, h * 0.4); g.lineTo(w * 0.95, h * 0.1);
    g.stroke();
    fibres(g, w, h, 6, 200, 0.15);
  });
}

// ---------------------------------------------------------------- pieces
type Mats = Record<string, any>;

function origamiTree(batch: Batcher, M: Mats, x: number, y: number, z: number, h: number, seed: number, scale = 1) {
  const r = mulberry(seed * 7 + 3);
  const s = scale * (0.9 + r() * 0.25);
  batch.add(prism(0.47, 2.4 * s, 6, 0.82, r()), M.bark, m4.makeTranslation(x, y, z));
  const layers = 3;
  const leaf = [M.leafA, M.leafB, M.leafC];
  const off = Math.floor(r() * 3);
  for (let i = 0; i < layers; i++) {
    const rad = (2.35 - i * 0.55) * s;
    const ch = (2.9 - i * 0.25) * s;
    const g = pleatCone(rad, ch, 6 + (i === 0 ? 1 : 0), 0.7, r() * 2);
    batch.add(g, leaf[(i + off) % 3], m4.makeTranslation(x, y + (1.95 + i * 1.45) * s, z));
  }
  void h;
}

function sky(ctx: WorldBuildContext, M: Mats) {
  const { scene } = ctx;
  scene.add(skyDome({ top: 0x2c72da, horizon: 0xcfe7f6, bottom: 0xefe2c4, sunColor: 0xfff8e0, sunDir: [0.45, 0.6, 0.35], sunSize: 0.045 }));
  void M;
}

/** Patchwork paper ground (vertex coloured squares) + outer meadow. */
function ground(ctx: WorldBuildContext) {
  const { scene, mats } = ctx;
  const pos: number[] = [], col: number[] = [], uv: number[] = [];
  const C = (h: number) => new THREE.Color(h);
  const G = [C(0x8fc653), C(0x6fab41), C(0xa2d062), C(0x5f9a38)];
  const P = [C(0xe0c592), C(0xd2b27c), C(0xe9d6aa)];
  const Y = [C(0xe8d3a8), C(0xd6bd90)];
  const OUT = C(0x7fb54b);
  const r = mulberry(5);
  const quad = (x0: number, z0: number, x1: number, z1: number, c: THREE.Color, team: number, rot: number, us = 1, vs = us) => {
    const f = team ? -1 : 1;
    const P4: [number, number][] = [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]];
    const U: [number, number][] = [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]];
    for (let i = 0; i < 6; i++) {
      pos.push(P4[i][0] * f, 0, P4[i][1] * f);
      let [u, v] = U[i];
      for (let k = 0; k < rot; k++) [u, v] = [v, 1 - u];
      uv.push(u * us, v * vs);
      col.push(c.r, c.g, c.b);
    }
  };
  const cs = 2;
  for (const team of [0, 1]) {
    const rr = mulberry(9);
    for (let iz = 0; iz < 22; iz++) {
      for (let ix = 0; ix < 32; ix++) {
        const x0 = -HX + ix * cs, z0 = RZ + iz * cs;
        const cx = x0 + cs / 2, cz = z0 + cs / 2;
        let c: THREE.Color;
        const k = rr();
        if (cz > 30.5) c = Y[(ix + iz) & 1];
        else if (lanePath(cx, cz) || (k < 0.05 && cz > 5)) c = P[Math.floor(rr() * 3)];
        else {
          c = G[(ix + iz) & 1];
          if (k > 0.9) c = G[2];
          else if (k > 0.84) c = G[3];
        }
        c = c.clone().multiplyScalar(0.94 + rr() * 0.1);
        quad(x0, z0, x0 + cs, z0 + cs, c, team, Math.floor(rr() * 4));
      }
    }
    // outer meadow (coarse cells, one colour) around the arena
    const strips: [number, number, number, number][] = [[-300, RZ, -HX, 300], [HX, RZ, 300, 300], [-HX, RZ + 44, HX, 300]];
    for (const [a0, b0, a1, b1] of strips) quad(a0, b0, a1, b1, OUT.clone().multiplyScalar(0.96 + r() * 0.05), team, 0, (a1 - a0) / 6, (b1 - b0) / 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mats.mat(0xffffff, { map: patchTexture(), vertexColors: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function river(ctx: WorldBuildContext, M: Mats) {
  const { scene, mats, batch } = ctx;
  const tex = riverTexture();
  const g = new THREE.PlaneGeometry(600, 2 * RZ);
  g.rotateX(-Math.PI / 2);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 600 / 10, uv.getY(i));
  const water = new THREE.Mesh(g, mats.mat(0xffffff, { map: tex }));
  water.position.y = WY;
  water.receiveShadow = true;
  scene.add(water);
  ctx.animate((dt) => { tex.offset.x = (tex.offset.x + dt * 0.035) % 1; });
  // banks: layered paper edge
  const bankMat = mats.mat(0xffffff, { map: bankTexture() });
  for (const s of [1, -1]) {
    const b = new THREE.PlaneGeometry(600, -RY);
    const bu = b.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < bu.count; i++) bu.setX(i, bu.getX(i) * 600 / 3);
    const m = new THREE.Mesh(b, bankMat);
    m.position.set(0, RY / 2, s * RZ);
    m.rotation.y = s > 0 ? Math.PI : 0;
    batch.addMesh(m);
  }
  // torn grass lip + floating paper foam
  const r = mulberry(71);
  for (const team of [0, 1]) {
    for (let x = -HX - 20; x < HX + 20; x += 1.1 + r() * 0.8) {
      const w = 0.8 + r() * 1.2, d = 0.12 + r() * 0.22;
      const g2 = flatPoly([[0, 0], [w, 0], [w * 0.8, d], [w * 0.35, d * 0.6], [w * 0.1, d * 1.1]]);
      g2.rotateX(-Math.PI / 2);
      batch.add(g2, M.leafB, T(team, x, 0.012, RZ + 0.01, 0, 0, 0));
    }
    for (let i = 0; i < 26; i++) {
      const x = -HX + r() * 2 * HX, z = (r() - 0.5) * (2 * RZ - 1.2);
      const w = 0.4 + r() * 0.8;
      const fg = flatPoly([[0, 0], [w, 0.05], [w * 0.7, 0.18], [w * 0.2, 0.15]]);
      fg.rotateX(-Math.PI / 2);
      batch.add(fg, M.white, T(team, x, WY + 0.015, z, r() * 3));
    }
  }
}

function crane(ctx: WorldBuildContext, M: Mats) {
  const g = new THREE.Group();
  const geo = mergeGeometries([craneGeo(), new THREE.CylinderGeometry(0.03, 0.03, 36, 4).translate(0, 18.5, 0).toNonIndexed()])!;
  const body = new THREE.Mesh(geo, M.crane);
  body.castShadow = true;
  body.scale.setScalar(1.7);
  g.add(body);
  g.position.set(0, 12.5, 0);
  g.userData.dynamic = true;
  g.traverse((o) => (o.userData.dynamic = true));
  ctx.scene.add(g);
  ctx.animate((_dt, t) => {
    g.rotation.y = t * 0.12;
    g.position.y = 12.5 + Math.sin(t * 0.7) * 0.35;
    body.rotation.z = Math.sin(t * 0.9) * 0.05;
  });
}

function clouds(ctx: WorldBuildContext, M: Mats) {
  const r = mulberry(13);
  const spots: [number, number, number, number][] = [
    [-18, 24, -26, 1.2], [20, 27, 8, 1.0], [-24, 30, 30, 1.1], [14, 22, -34, 0.9], [26, 33, -10, 1.3],
    [-30, 26, 4, 1.0], [0, 36, -60, 1.6], [8, 38, 62, 1.5], [-55, 34, -30, 1.7], [58, 32, 26, 1.6], [-50, 40, 48, 1.8], [48, 42, -52, 1.8],
  ];
  const groups: THREE.BufferGeometry[][] = [[], [], []];
  spots.forEach(([x, y, z, s], i) => {
    const parts = [cloudGeo(i + 3, s)];
    for (const sx of [-1.6 * s, 1.6 * s]) parts.push(new THREE.CylinderGeometry(0.055, 0.055, 90, 4).translate(sx, 45, 0).toNonIndexed());
    const g = mergeGeometries(parts)!;
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(-x, -z) + (r() - 0.5) * 0.6, (r() - 0.5) * 0.05)), new THREE.Vector3(1, 1, 1)));
    groups[i % 3].push(g);
  });
  const meshes = groups.map((gs) => {
    const m = new THREE.Mesh(mergeGeometries(gs)!, M.cloud);
    m.userData.dynamic = true;
    m.frustumCulled = false;
    ctx.scene.add(m);
    return m;
  });
  ctx.animate((_dt, t) => {
    meshes.forEach((m, i) => {
      m.position.y = Math.sin(t * 0.45 + i * 2.1) * 0.45;
      m.rotation.y = Math.sin(t * 0.02 + i) * 0.015;
    });
  });
}

/** A few small origami cranes gliding in a slow circle high above the arena, plus paper boats bobbing on the river. */
function flock(ctx: WorldBuildContext, M: Mats) {
  const parts: THREE.BufferGeometry[] = [];
  const base = craneGeo();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const R = 34 + (i % 2) * 9;
    const g = base.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * R, 19 + (i % 3) * 3.5, Math.sin(a) * R),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 - a, (i % 2 ? 0.2 : -0.15))),
      new THREE.Vector3(0.55, 0.55, 0.55)));
    parts.push(g);
  }
  const birds = new THREE.Mesh(mergeGeometries(parts)!, M.crane);
  birds.userData.dynamic = true;
  birds.frustumCulled = false;
  ctx.scene.add(birds);
  // paper boats (newsprint)
  const boat: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => boat.push(...a, ...b, ...c);
  const L = 0.62, W = 0.2, H = 0.3, B = 0.32;
  for (const s of [1, -1]) {
    tri([-B, 0, 0], [B, 0, 0], [L, H, W * s]);
    tri([-B, 0, 0], [L, H, W * s], [-L, H, W * s]);
    tri([-L, H, W * s], [-B, 0, 0], [-L, H, 0]);
    tri([L, H, W * s], [B, 0, 0], [L, H, 0]);
    tri([-0.34, H, 0.03 * s], [0.34, H, 0.03 * s], [0, 0.8, 0]);
  }
  const bg = triGeo(boat, 0.9, 'xy');
  const bparts: THREE.BufferGeometry[] = [];
  for (const [x, z, ry, sc] of [[-19.5, 1.3, 0.3, 1.2], [19.5, -1.3, 2.9, 1.2], [-7.5, -1.6, 1.4, 0.9], [8.2, 1.7, -1.2, 0.9]]) {
    const g = bg.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, WY - 0.02, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sc, sc, sc)));
    bparts.push(g);
  }
  const boats = new THREE.Mesh(mergeGeometries(bparts)!, M.news);
  boats.userData.dynamic = true;
  boats.castShadow = true;
  ctx.scene.add(boats);
  ctx.animate((_dt, t) => {
    birds.rotation.y = t * 0.05;
    birds.position.y = Math.sin(t * 0.6) * 0.6;
    boats.position.y = Math.sin(t * 1.3) * 0.025;
    boats.rotation.z = Math.sin(t * 0.9) * 0.004;
  });
}

/** Grass tufts, flowers, pebbles and the boundary fence. */
function decor(ctx: WorldBuildContext, M: Mats) {
  const { batch, level } = ctx;
  const low = ctx.quality === 'low';
  const r = mulberry(99);
  const blocked = (x: number, z: number, pad = 0.6) => {
    for (const b of level.boxes) {
      if (b.kind === 'floor' || b.kind === 'riverbed' || b.kind === 'boundary') continue;
      if (x > b.min[0] - pad && x < b.max[0] + pad && z > b.min[2] - pad && z < b.max[2] + pad) return true;
    }
    for (const rp of level.ramps) if (x > rp.min[0] - pad && x < rp.max[0] + pad && z > rp.min[2] - pad && z < rp.max[2] + pad) return true;
    return false;
  };
  const tuft = new THREE.BufferGeometry();
  {
    const p: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI + 0.3;
      const c = Math.cos(a) * 0.14, s = Math.sin(a) * 0.14;
      const lean = (i % 2 ? 0.12 : -0.1);
      p.push(-c, 0, -s, c, 0, s, lean * Math.cos(a + 1.57), 0.42 + (i % 2) * 0.14, lean * Math.sin(a + 1.57));
    }
    tuft.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    tuft.computeVertexNormals();
  }
  const flower = flatPoly(Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const rr = i % 2 ? 0.08 : 0.2;
    return [Math.cos(a) * rr, Math.sin(a) * rr] as [number, number];
  }), true);
  for (const team of [0, 1]) {
    let n = 0;
    for (let tries = 0; tries < 900 && n < (low ? 70 : 170); tries++) {
      const x = -HX + 1.5 + r() * (2 * HX - 3), z = RZ + 0.8 + r() * 27;
      if (blocked(x, z)) continue;
      if (lanePath(Math.floor((x + HX) / 2) * 2 - HX + 1, Math.floor((z - RZ) / 2) * 2 + RZ + 1)) continue;
      const f = team ? -1 : 1;
      batch.add(tuft, M.grass, T(team, x, 0, z, r() * 6, 0, 0, 1, 0.8 + r() * 0.6, 1));
      if (r() < 0.22) {
        const fm = M.flowers[Math.floor(r() * 3)];
        batch.add(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 3), M.grass, T(team, x + 0.2, 0.22, z + 0.1));
        batch.add(flower, fm, T(team, x + 0.2, 0.46, z + 0.1, r() * 6, -1.2));
      }
      void f;
      n++;
    }
    // paper confetti scraps
    for (let i = 0; i < (low ? 30 : 90); i++) {
      const x = -HX + 1 + r() * (2 * HX - 2), z = RZ + 0.5 + r() * 40;
      if (blocked(x, z, 0.2)) continue;
      const w = 0.12 + r() * 0.14;
      const cg = flatPoly([[0, 0], [w, r() * 0.05], [w * r(), w * (0.6 + r() * 0.5)]]);
      cg.rotateX(-Math.PI / 2);
      const cm = [M.flowers[0], M.flowers[1], M.flowers[2], M.teamLight[0], M.teamLight[1]][Math.floor(r() * 5)];
      batch.add(cg, cm, T(team, x, 0.03, z, r() * 6));
    }
    // pop-up cutout bushes hugging the castle wall bases (field side)
    const bush = (w: number, h: number, seed: number) => {
      const rr = mulberry(seed);
      const pts: [number, number][] = [[-w / 2, 0]];
      const lobes = 3 + Math.floor(rr() * 2);
      for (let k = 0; k <= lobes * 4; k++) {
        const t = k / (lobes * 4);
        const x = -w / 2 + t * w;
        const bump = Math.abs(Math.sin(t * Math.PI * lobes)) * 0.25 + 0.75;
        pts.push([x, h * bump * Math.sin(Math.PI * (0.08 + t * 0.84))]);
      }
      pts.push([w / 2, 0]);
      return flatPoly(pts, true);
    };
    const bushSpots: [number, number, number][] = [[-18.5, 26.75, 1.6], [-9.5, 26.75, 1.3], [10, 26.75, 1.5], [17.5, 26.75, 1.2], [-25.5, 26.2, 1.1], [20.2, 26.2, 1.0]];
    bushSpots.forEach(([x, z, w], k) => {
      batch.add(bush(w * 1.3, w * 0.75, 700 + k), k % 2 ? M.leafA : M.leafC, T(team, x, 0, z, 0));
      batch.add(bush(w, w * 0.55, 720 + k), M.leafB, T(team, x + 0.5, 0, z - 0.12, 0));
    });
    // small crumpled pebbles
    for (let i = 0; i < 16; i++) {
      const x = -HX + 2 + r() * (2 * HX - 4), z = RZ + 1 + r() * 21;
      if (blocked(x, z, 0.3)) continue;
      const sz = 0.25 + r() * 0.3;
      batch.add(crumpleGeo(sz * 1.3, sz * 0.7, sz, 800 + i, 0.2, 0, 0.8), i % 2 ? M.rock : M.rock2, T(team, x, 0, z, r() * 6));
    }
    // boundary fence: cream paper pickets along the field edges
    const picket = flatPoly([[-0.17, 0], [0.17, 0], [0.17, 0.95], [0, 1.18], [-0.17, 0.95]], true);
    for (const sx of [1, -1]) {
      for (let z = RZ + 0.3; z < 26.5; z += 0.5) batch.add(picket, M.cream, T(team, sx * (HX - 0.85), 0, z, Math.PI / 2));
      for (const y of [0.35, 0.8]) batch.add(new THREE.BoxGeometry(0.08, 0.1, 26.5 - RZ), M.cream, T(team, sx * (HX - 0.9), y, (26.5 + RZ) / 2));
      // little sluice grate where the river leaves the arena
      for (let z = -RZ + 0.25; z < RZ; z += 0.55) if (team === 0) batch.box(M.kraft, sx * (HX - 0.85), 0.25, z, 0.12, 1.4, 0.12);
      if (team === 0) batch.box(M.kraft, sx * (HX - 0.85), 0.9, 0, 0.16, 0.14, 2 * RZ + 0.4);
    }
  }
}

/** Layered paper hills beyond the fence, cut-out mountains, far forests. */
function backdrop(far: Batcher, M: Mats, ctx: WorldBuildContext) {
  const { batch } = ctx;
  const low = ctx.quality === 'low';
  const r = mulberry(1234);
  const hillMats = [M.hillTop[0], M.hillTop[1], M.hillTop[2], M.hillTop[3]];
  const mound = (bt: Batcher, cx: number, cz: number, rx: number, rz: number, layers: number, lh: number, seed: number, mats = hillMats, side = M.hillEdge) => {
    for (let i = 0; i < layers; i++) {
      const k = 1 - i / (layers + 0.4);
      const pts = blobPts(cx + (r() - 0.5) * rx * 0.15 * i, cz + (r() - 0.5) * rz * 0.15 * i, rx * k, rz * k, 0.18, seed + i);
      const [top, sides] = slabFromPts(pts, i * lh - 0.05, (i + 1) * lh);
      bt.add(top, mats[(i + seed) % mats.length]);
      bt.add(sides, side);
    }
  };
  // near ring: along both field sides (both halves: author +z, mirror)
  for (const team of [0, 1]) {
    const f = team ? -1 : 1;
    const near: [number, number, number, number, number, number][] = [
      [44, 13, 9, 8, 4, 1.3], [47, 24, 11, 9, 5, 1.4], [42, 34, 7, 7, 3, 1.3], [53, 42, 12, 11, 6, 1.6],
      [-44, 14, 9, 9, 4, 1.3], [-47, 25, 10, 9, 5, 1.4], [-42, 35, 7, 7, 3, 1.3], [-53, 43, 12, 11, 6, 1.6],
      [-18, 58, 14, 8, 5, 1.6], [16, 60, 15, 9, 5, 1.6], [0, 70, 20, 10, 6, 1.8], [40, 62, 12, 10, 5, 1.7], [-42, 64, 12, 10, 5, 1.7],
    ];
    near.forEach(([x, z, rx, rz, n, lh], i) => mound(batch, x * f, z * f, rx, rz, n, lh, i * 7 + team * 50 + 3));
    // forests on the hills
    for (let i = 0; i < (low ? 24 : 46); i++) {
      const side = r() > 0.5 ? 1 : -1;
      let x: number, z: number;
      if (i < 30) { x = side * (34.5 + r() * 18); z = 4 + r() * 50; }
      else { x = (r() - 0.5) * 70; z = 50 + r() * 22; }
      const hgt = 0;
      origamiTree(batch, M, x * f, hgt, z * f, 7, 500 + i + team * 100, 1 + r() * 0.5);
    }
  }
  // mid ring: bigger bluish mounds
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.2;
    const d = 95 + r() * 25;
    const x = Math.cos(a) * d * 0.85, z = Math.sin(a) * d * 1.1;
    mound(far, x, z, 22 + r() * 14, 14 + r() * 8, 5, 2.6 + r() * 1.2, 900 + i, [M.farHill, M.farHill2], M.farHill2);
  }
  // far ring: faceted origami mountains with snow caps
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + r() * 0.15;
    const d = 165 + r() * 45;
    const h = 38 + r() * 42;
    const rad = 30 + r() * 22;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const rot = r() * 3;
    far.add(pleatCone(rad, h, 5, 0.78, rot, 0.0, 0.03), i % 2 ? M.mountain : M.mountain2, m4.makeTranslation(x, -2, z));
    const k = 0.3;
    far.add(pleatCone(rad * k * 1.04, h * k + 0.2, 5, 0.78, rot, 0.0, 0.03), M.snow, m4.makeTranslation(x, -2 + h * (1 - k), z));
  }
}

// ---------------------------------------------------------------- theme
export const paper: WorldDef = {
  theme: {
    id: 'paper',
    name: 'Paper Fort',
    tagline: 'Cut, fold and conquer on a pop-up papercraft battlefield.',
    image: img,
    teams: [
      { name: 'Blue', primary: BLUE, secondary: 0x1d3f9e, dark: 0x122a6b, light: 0x9db8f5 },
      { name: 'Red', primary: RED, secondary: 0xa3241b, dark: 0x6b130f, light: 0xf7aaa0 },
    ],
    style: {
      outlineColor: 0x3b2413,
      outlineWidth: 1.5,
      outlineStrength: 0.85,
      outlineSensitivity: 0.9,
      neonEdges: 0,
      saturation: 1.06,
      contrast: 1.03,
      brightness: 0.015,
      tint: 0xfff4e2,
      halftone: 0,
      halftoneScale: 5,
      paper: 0.7,
      grain: 0.03,
      vignette: 0.3,
      posterize: 0,
      bloom: null,
      exposure: 1,
    },
    material: 'paper',
    hudClass: 'hud-paper',
    impact: 'paper',
    character: { hat: 'army', skin: 0xf3cf9f, glove: 0xe9dcc0, shoe: 0x5a3a1e, flat: true, backpack: true, emblem: 'crown' },
    botNames: [
      ['Sgt Staples', 'Pvt Papercut', 'Cpl Crease', 'Origami Otto', 'Major Foldsworth', 'Cpt Cardstock'],
      ['General Glue', 'Lady Confetti', 'Baron Crumple', 'Pvt Pulp', 'Sgt Snips', 'Duke Doodle'],
    ],
    background: 0xd6ebf5,
    fog: { color: 0xdcebf2, near: 75, far: 260 },
    sun: { color: 0xfff0d6, intensity: 2.5, dir: [0.45, 1, 0.35] },
    hemi: { sky: 0xd4e8ff, ground: 0xd9c49a, intensity: 1.35 },
    hitWords: ['RIP!', 'CRUMPLE!', 'SNIP!', 'PAPERCUT!', 'FWUMP!', 'TEAR!'],
    weaponNames: { blaster: 'Spitball Rifle', scatter: 'Confetti Scatter', boomer: 'Crumple Cannon', zapper: 'Rubber-Band Sniper' },
    accent: 0xf2bf3f,
  },
  level: layout,
  build,
};

export type { V3 };
