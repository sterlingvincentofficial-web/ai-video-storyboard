import * as THREE from 'three';
import type { WorldDef, WorldBuildContext } from './types';
import type { BoxDef, LevelData } from '../world/Level';
import { LevelBuilder } from './builder';
import { rampGeometry, bunting } from './common';
import { mulberry } from '../core/utils';
import img from '../assets/toy.webp';
import {
  C, Kit, MergeBatch, bevelBox, tr, locomotive, wagon, crayon, toyCar, dart, stuckDart,
  stackingRings, toyDrum, trackLoop,
} from './toy/props';
import { blockAtlas, rugTexture, posterAtlas, atlasRectUV, POSTER, CELL, cellUV, fortSignTexture } from './toy/textures';
import { buildRoom, matteFactory, starGeo } from './toy/room';

const BLUE = 0x3a86ff;
const RED = 0xff4b5c;

// ---------------------------------------------------------------------------------------------
// Shared prop placements (blue half; everything is mirrored by 180° rotation for red)

const RING_POS: [number, number] = [0, 10.5];
const RING_TIERS = [
  { r: 2.7, y0: 0, y1: 1.3, color: C.red },
  { r: 2.25, y0: 1.3, y1: 2.5, color: C.orange },
  { r: 1.8, y0: 2.5, y1: 3.6, color: C.yellow },
  { r: 1.35, y0: 3.6, y1: 4.6, color: C.green },
];
const RING_PEG = { r: 0.8, top: 6.0 };
const DRUM = { r: 5, h: 1.2 };
const TRAIN_X = 13;
const LOCO_Z = 6.2;
const WAGON_Z = 0.7;
const TRACK = { rx: 13, straight: 9 };

interface CarDef { x: number; z: number; alongX: boolean; color: number; w: number; len: number }
const CARS: CarDef[] = [
  { x: -23, z: 6, alongX: false, color: C.yellow, w: 2.8, len: 5.0 },
  { x: -25.5, z: 40.5, alongX: true, color: C.sky, w: 2.6, len: 4.6 },
];
interface CrayonDef { x: number; z: number; axis: 'x' | 'z'; len: number; color: number; dir: 1 | -1 }
const CRAYONS: CrayonDef[] = [
  { x: -18, z: 15.5, axis: 'z', len: 9, color: C.red, dir: -1 },
  { x: -24, z: 25.2, axis: 'x', len: 8, color: C.purple, dir: 1 },
];
const CRAYON_R = 0.6;

function layout(): LevelData {
  const L = new LevelBuilder(32, 46);
  L.floor('floor', 8);
  type Data = Record<string, unknown>;
  const mB = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, kind: string, data: Data = {}, extra: Partial<BoxDef> = {}) =>
    L.mBoxC((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, y1 - y0, kind, y0, { ...extra, data });
  const sB = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, kind: string, data: Data = {}, extra: Partial<BoxDef> = {}) =>
    L.box([x0, y0, z0], [x1, y1, z1], kind, { ...extra, data });
  /** Round thing approximated by a plus-shaped cluster of boxes (invisible; custom visual). */
  const disc = (cx: number, cz: number, r: number, y0: number, y1: number, kind: string, mirror: boolean) => {
    for (const [a, c] of [[0.93, 0.5], [0.5, 0.93], [0.76, 0.76]]) {
      (mirror ? mB : sB)(cx - a * r, cx + a * r, cz - c * r, cz + c * r, y0, y1, kind, {}, { invisible: true });
    }
  };
  let blockSeed = 0;
  const faceSets = [
    [CELL.A, CELL.B, CELL.starYellow, CELL.plainYellow, CELL.C, CELL.starBlue],
    [CELL.T, CELL.O, CELL.starRed, CELL.plainRed, CELL.Y, CELL.N1],
    [CELL.N2, CELL.N3, CELL.starGreen, CELL.plainGreen, CELL.heart, CELL.moon],
    [CELL.starBlue, CELL.A, CELL.starYellow, CELL.plainBlue, CELL.B, CELL.starRed],
    [CELL.moon, CELL.C, CELL.heart, CELL.plainYellow, CELL.starGreen, CELL.T],
  ];
  const aB = (cx: number, cz: number, s: number, y0 = 0, faces?: number[]) =>
    mB(cx - s / 2, cx + s / 2, cz - s / 2, cz + s / 2, y0, y0 + s, 'alpha', { faces: faces ?? faceSets[blockSeed++ % faceSets.length] });

  // ------------------------------------------------------------------ perimeter (walls of giant bricks)
  for (const [z0, z1, h] of [[0, 10, 8], [10, 18, 7.2], [18, 30, 8.6], [30, 46, 9.6]]) mB(-32, -30, z0, z1, 0, h, 'wall');
  for (const [z0, z1, h] of [[0, 8, 7.6], [8, 22, 10.2], [22, 32, 8], [32, 46, 9]]) mB(30, 32, z0, z1, 0, h, 'wall');
  mB(-30, -11, 44, 46, 0, 8.4, 'wall');
  mB(11, 30, 44, 46, 0, 8, 'wall');
  mB(-11, 11, 42, 46, 0, 7.2, 'chest');

  // ------------------------------------------------------------------ team castle (base)
  for (const [x0, x1] of [[-30, -19], [-12, -4.5], [4.5, 12], [19, 30]]) mB(x0, x1, 28.4, 30, 0, 3.2, 'basewall');
  for (const [x0, x1] of [[-8.2, -4.5], [4.5, 8.2]]) mB(x0, x1, 27.6, 30.8, 0, 6.4, 'tower');
  mB(-9, 9, 38, 42, 0, 3.0, 'keep');
  for (let i = 0; i < 6; i++) {
    const h = 0.5 * (i + 1);
    mB(-15 + i, -14 + i, 38.4, 42, 0, h, 'step', { i });
    mB(14 - i, 15 - i, 38.4, 42, 0, h, 'step', { i });
  }
  for (const x of [-7, -3.2, 3.2, 7]) mB(x - 0.8, x + 0.8, 38, 38.6, 3.0, 4.0, 'merlon', { tm: 1 });
  for (const [x0, x1] of [[-6.6, -4.6], [4.6, 6.6]]) mB(x0, x1, 40, 42, 3.0, 6.2, 'turret');
  // base cover
  aB(-16, 33.5, 1.8);
  aB(16.5, 35.5, 1.8);
  aB(17.2, 33.6, 1.2, 0, [CELL.d3, CELL.d4, CELL.d1, CELL.d6, CELL.d2, CELL.d5]);

  // ------------------------------------------------------------------ centre: toy drum hill + stacking ring towers
  disc(0, 0, DRUM.r, 0, DRUM.h, 'drum', false);
  mB(-6.3, -4.5, -1.3, 1.3, 0, 0.6, 'step', { i: 2 });
  for (const t of RING_TIERS) disc(RING_POS[0], RING_POS[1], t.r, t.y0, t.y1, 'rings', true);
  mB(RING_POS[0] - 0.75, RING_POS[0] + 0.75, RING_POS[1] - 0.75, RING_POS[1] + 0.75, 4.6, 7.7, 'rings', {}, { invisible: true });

  // ------------------------------------------------------------------ toy train (static cover on the track)
  mB(TRAIN_X - 1.3, TRAIN_X + 1.3, LOCO_Z - 3.3, LOCO_Z + 0.8, 0, 2.7, 'train', {}, { invisible: true });
  mB(TRAIN_X - 1.3, TRAIN_X + 1.3, LOCO_Z + 0.8, LOCO_Z + 2.9, 0, 3.2, 'train', {}, { invisible: true });
  mB(TRAIN_X - 1.25, TRAIN_X + 1.25, WAGON_Z - 2.1, WAGON_Z + 2.1, 0, 1.95, 'train', {}, { invisible: true });

  // ------------------------------------------------------------------ centre lane cover
  aB(-6.9, 17, 1.8);
  aB(-5.1, 17, 1.8);
  aB(-6.0, 17, 1.8, 1.8);
  aB(7.5, 15.5, 2.0);
  mB(1.5, 6.5, 24, 25.2, 0, 1.2, 'lowwall');
  aB(14.2, 23, 1.8);
  mB(-14.6, -13.4, 20.9, 22.1, 0, 1.2, 'dice', { faces: [CELL.d1, CELL.d6, CELL.d2, CELL.d5, CELL.d3, CELL.d4] });
  // alphabet block stacks against the left wall
  aB(-28.7, 20.6, 2.4, 0, [CELL.starRed, CELL.O, CELL.moon, CELL.plainRed, CELL.T, CELL.Y]);
  aB(-28.7, 20.6, 2.4, 2.4, [CELL.A, CELL.N2, CELL.starYellow, CELL.plainBlue, CELL.B, CELL.C]);
  aB(-28.7, 23.0, 2.4, 0, [CELL.heart, CELL.N3, CELL.starGreen, CELL.plainGreen, CELL.N1, CELL.starBlue]);
  mB(-9.9, -8.1, 5.6, 7.4, 0, 1.8, 'dice', { faces: [CELL.d2, CELL.d5, CELL.d1, CELL.d6, CELL.d3, CELL.d4] });
  mB(-8.1, -6.9, 4.4, 5.6, 0, 1.2, 'dice', { faces: [CELL.d6, CELL.d1, CELL.d5, CELL.d2, CELL.d4, CELL.d3] });

  // ------------------------------------------------------------------ left lane (blue half): lookout, car, crayons
  mB(-30, -25, 14, 19, 0, 3.0, 'lookout');
  [[13, 14, 2.5], [12, 13, 2.0], [11, 12, 1.5], [10, 11, 1.0], [9, 10, 0.5]].forEach(([z0, z1, h], i) => mB(-30, -26.5, z0, z1, 0, h, 'step', { i: 5 - i }));
  mB(-25.6, -25, 14.4, 15.6, 3.0, 4.0, 'merlon', {});
  mB(-25.6, -25, 17.4, 18.6, 3.0, 4.0, 'merlon', {});
  for (const c of CARS) {
    const w = c.alongX ? c.len : c.w, d = c.alongX ? c.w : c.len;
    mB(c.x - w / 2, c.x + w / 2, c.z - d / 2, c.z + d / 2, 0, 1.4, 'car', {}, { invisible: true });
    const cw = c.alongX ? c.len * 0.5 : c.w * 0.84, cd = c.alongX ? c.w * 0.84 : c.len * 0.5;
    mB(c.x - cw / 2, c.x + cw / 2, c.z - cd / 2, c.z + cd / 2, 1.4, 2.08, 'car', {}, { invisible: true });
  }
  for (const c of CRAYONS) {
    const w = c.axis === 'x' ? c.len : CRAYON_R * 2, d = c.axis === 'z' ? c.len : CRAYON_R * 2;
    mB(c.x - w / 2, c.x + w / 2, c.z - d / 2, c.z + d / 2, 0, CRAYON_R * 2, 'crayon', {}, { invisible: true });
  }

  // ------------------------------------------------------------------ right lane (blue half): brick plateau + zapper perch
  mB(17, 30, 8, 22, 0, 2.4, 'plateau');
  [[3.6, 4.7, 0.48], [4.7, 5.8, 0.96], [5.8, 6.9, 1.44], [6.9, 8, 1.92]].forEach(([z0, z1, h], i) => mB(18, 22, z0, z1, 0, h, 'step', { i }));
  [[22, 23.1, 1.92], [23.1, 24.2, 1.44], [24.2, 25.3, 0.96], [25.3, 26.4, 0.48]].forEach(([z0, z1, h], i) => mB(25, 29, z0, z1, 0, h, 'step', { i: 3 - i }));
  mB(25, 30, 14, 20, 2.4, 4.8, 'perch');
  [[21, 22, 2.88], [22, 23, 3.36], [23, 24, 3.84], [24, 25, 4.32]].forEach(([x0, x1, h], i) => mB(x0, x1, 15, 19, 2.4, h, 'step', { i: i + 3 }));
  mB(25.4, 26.6, 14, 14.6, 4.8, 5.8, 'merlon', {});
  mB(27.8, 29.0, 14, 14.6, 4.8, 5.8, 'merlon', {});
  for (const [z0, z1] of [[9, 10.4], [12.6, 14], [16.2, 17.6], [19.8, 21.2]]) mB(17, 17.6, z0, z1, 2.4, 3.4, 'merlon', {});
  // giant picture books (stair-stepped pile)
  mB(24.5, 30, 0.5, 6.5, 0, 1.2, 'book', { col: C.green });
  mB(26, 30, 1.5, 5.5, 1.2, 2.4, 'book', { col: C.orange });
  L.pad([12.5, 0, 17.5], [20.5, 2.4, 14.5]);

  // ------------------------------------------------------------------ spawns / objectives / pickups
  for (const [x, z] of [[-26, 34], [-21, 37], [-11.5, 35], [-4.5, 36], [4.5, 36], [11.5, 35], [21, 37], [26, 34]] as const) L.spawn(x, 0, z, 0);
  L.flags([0, 0, 34]);
  L.zone([0, DRUM.h, 0], DRUM.r - 0.4);
  L.pickup('health', -10, 0, 24.5);
  L.pickup('health', -20, 0, 32);
  L.pickup('health', 20.5, 2.4, 20.5);
  L.pickup('ammo', 20, 0, 32);
  L.pickup('ammo', -27.5, 3.0, 16.5);
  L.pickup('ammo', 9.5, 0, 11);
  L.pickup('boomer', 0, DRUM.h, 0);
  L.pickup('zapper', 27.5, 4.8, 17.2);
  L.pickup('overcharge', -22.5, 0, 0);
  for (const p of [[-22, 0, 12], [21, 2.4, 12], [0, 0, 19], [9, 0, 4.5], [-27.5, 3.0, 16.5], [27.5, 4.8, 17]] as const) L.hotspot(p[0], p[1], p[2]);
  return L.build();
}

// ---------------------------------------------------------------------------------------------

const NEUTRAL_BLUE = [C.sky, C.yellow, C.green, C.white, C.blue, C.purple];
const NEUTRAL_RED = [C.pink, C.yellow, C.orange, C.white, C.red, C.purple];
const TEAM_PAL = [[BLUE, BLUE, C.sky, C.white], [RED, RED, C.pink, C.white]];
const STEP_COLS = [C.red, C.orange, C.yellow, C.green, C.sky, C.blue, C.purple];

function rugMaterial(tex: THREE.Texture, env: THREE.Texture | null) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 });
  if (env) {
    m.envMap = env;
    m.envMapIntensity = 0.4;
  }
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRugW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRugW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRugW;
float rugH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rugN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rugH(i), rugH(i + vec2(1.0, 0.0)), f.x), mix(rugH(i + vec2(0.0, 1.0)), rugH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec2 p = vRugW.xz;
  float fw = length(fwidth(p));
  float hi = 1.0 - smoothstep(0.03, 0.12, fw);
  float n = rugN(p * 2.1) * 0.35 + mix(0.5, rugN(p * 9.0), hi) * 0.4 + mix(0.5, rugN(p * 27.0 + 7.0), hi) * 0.25;
  diffuseColor.rgb *= 0.74 + 0.44 * n;
}`);
  };
  m.customProgramCacheKey = () => 'toy-rug';
  return m;
}

function build(ctx: WorldBuildContext) {
  const { scene, level, mats } = ctx;
  const matte = matteFactory(mats);
  const atlasMat = mats.mat(0xffffff, { map: blockAtlas() });
  const posterMat = matte(0xffffff, posterAtlas(), { rough: 0.7 });
  const main = new MergeBatch();
  const detail = new MergeBatch();
  const k = new Kit(mats, main, atlasMat, detail);

  // ---- rug (the arena floor)
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(64, 92), rugMaterial(rugTexture(), mats.envMap));
  rug.rotation.x = -Math.PI / 2;
  rug.receiveShadow = true;
  scene.add(rug);

  const rnd = mulberry(7);
  for (const b of level.boxes) {
    if (b.invisible || b.kind === 'floor') continue;
    const team = ((b.data?.team as number | undefined) ?? 0) as 0 | 1;
    const mir = !!b.data?.mirrored;
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
    switch (b.kind) {
      case 'wall':
        k.brickFill(b.min, b.max, team ? NEUTRAL_RED : NEUTRAL_BLUE, { course: 1.9, long: true });
        break;
      case 'chest':
        toyChest(k, posterMat, b, team);
        break;
      case 'basewall': {
        k.brickFill(b.min, b.max, TEAM_PAL[team], { course: 1.07, studs: false });
        // crenellations: studded 2x1 bricks along the top
        const n = Math.floor(sx / 2.2);
        for (let i = 0; i < n; i++) {
          const x = b.min[0] + (i + 0.5) * (sx / n);
          k.brick(i % 2 ? C.white : TEAM_PAL[team][0], x - 0.8, b.max[1], cz - 0.6, 1.6, 0.8, 1.2, true);
        }
        break;
      }
      case 'tower': {
        k.brickFill(b.min, b.max, TEAM_PAL[team], { course: 1.07, studs: false });
        const half = Math.max(sx, sz) / 2;
        const roof = new THREE.ConeGeometry(half * 1.5, 3.6, 4);
        roof.rotateY(Math.PI / 4);
        k.add(roof, team ? RED : BLUE, cx, b.max[1] + 1.8, cz);
        k.add(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), C.white, cx, b.max[1] + 4.6, cz);
        const tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.6, -0.45, 0, 0, -0.9, 0, 0, 0, 0, 0, -0.9, 0, 1.6, -0.45, 0], 3));
        tri.computeVertexNormals();
        k.add(tri, team ? RED : BLUE, cx + 0.05, b.max[1] + 5.7, cz, rnd() * 3);
        k.add(new THREE.SphereGeometry(0.18, 8, 6), C.gold, cx, b.max[1] + 5.85, cz);
        break;
      }
      case 'turret': {
        k.brickFill(b.min, b.max, TEAM_PAL[team], { course: 0.8, studs: false, seed: Math.floor(cx * 5) + team });
        const roof = new THREE.ConeGeometry(Math.max(sx, sz) * 0.85, 2.6, 4);
        roof.rotateY(Math.PI / 4);
        k.add(roof, C.white, cx, b.max[1] + 1.3, cz);
        k.add(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), C.gold, cx, b.max[1] + 3.2, cz);
        k.add(new THREE.SphereGeometry(0.22, 10, 8), team ? RED : BLUE, cx, b.max[1] + 4.0, cz);
        break;
      }
      case 'keep': {
        k.brickFill(b.min, b.max, TEAM_PAL[team], { course: 1.0, studs: true, top: team ? RED : BLUE });
        // big team star shield + door on the front face (facing the arena)
        const fz = team ? b.max[2] + 0.03 : b.min[2] - 0.03;
        const ry = team ? 0 : Math.PI;
        const shield = atlasRectUVCell(new THREE.PlaneGeometry(2.2, 2.2), team ? CELL.starRed : CELL.starBlue);
        k.add(shield, atlasMat, cx - 4.8, 1.6, fz, ry);
        k.add(shield, atlasMat, cx + 4.8, 1.6, fz, ry);
        const door = new THREE.Shape();
        door.moveTo(-1.1, 0); door.lineTo(1.1, 0); door.lineTo(1.1, 1.5); door.absarc(0, 1.5, 1.1, 0, Math.PI, false); door.lineTo(-1.1, 0);
        k.add(new THREE.ShapeGeometry(door, 12), C.navy, cx, 0, fz, ry);
        break;
      }
      case 'step': {
        const i = (b.data?.i as number) ?? 0;
        k.brickFill(b.min, b.max, [STEP_COLS[i % STEP_COLS.length]], { course: Math.min(0.62, sy), seed: i * 31 + Math.floor(cx * 3 + cz) });
        break;
      }
      case 'merlon':
        k.brick(b.data?.tm ? TEAM_PAL[team][0] : [C.yellow, C.sky, C.pink, C.green][Math.floor(rnd() * 4)], b.min[0], b.min[1], b.min[2], sx, sy, sz, true);
        break;
      case 'lowwall':
        k.brickFill(b.min, b.max, team ? NEUTRAL_RED : NEUTRAL_BLUE, { course: 0.6 });
        break;
      case 'plateau':
        k.brickFill(b.min, b.max, team ? NEUTRAL_RED : NEUTRAL_BLUE, { course: 1.2, top: C.green });
        break;
      case 'perch':
        k.brickFill(b.min, b.max, TEAM_PAL[team], { course: 1.2, top: C.yellow });
        break;
      case 'lookout':
        k.brickFill(b.min, b.max, team ? NEUTRAL_RED : NEUTRAL_BLUE, { course: 1.0, top: C.sky });
        break;
      case 'alpha':
        k.block(cx, b.min[1], cz, sx, b.data!.faces as number[], mir ? Math.PI : 0, sy, sz);
        break;
      case 'dice':
        main.add(diceGeo(sx, b.data!.faces as number[]), atlasMat, tr(cx, cy, cz, mir ? Math.PI : 0));
        break;
      case 'book':
        giantBook(k, b, b.data!.col as number, mir);
        break;
      default:
        k.bbox(C.white, cx, cy, cz, sx, sy, sz);
    }
  }
  for (const r of level.ramps) main.add(rampGeometry(r), mats.mat(C.yellow));

  // ---- composite props (authored for blue, mirrored for red)
  const mirror = (x: number, z: number) => [-x, -z] as const;
  toyDrum(k, 0, 0, DRUM.r, DRUM.h);
  for (const s of [1, -1]) {
    stackingRings(k, RING_POS[0] * s, RING_POS[1] * s, RING_TIERS, RING_PEG, s > 0 ? C.purple : C.pink);
  }
  locomotive(k, TRAIN_X, LOCO_Z, 0, C.red, C.green);
  wagon(k, TRAIN_X, WAGON_Z, 0, C.yellow);
  locomotive(k, -TRAIN_X, -LOCO_Z, Math.PI, C.blue, C.yellow);
  wagon(k, -TRAIN_X, -WAGON_Z, Math.PI, C.green);
  for (const c of CARS) {
    toyCar(k, c.x, c.z, c.alongX ? Math.PI / 2 : 0, c.color, c.w, c.len);
    const [mx, mz] = mirror(c.x, c.z);
    toyCar(k, mx, mz, (c.alongX ? Math.PI / 2 : 0) + Math.PI, c.color === C.yellow ? C.orange : C.pink, c.w, c.len);
  }
  for (const c of CRAYONS) {
    crayon(k, c.x, c.z, c.axis, c.len, c.color, c.dir, CRAYON_R);
    const [mx, mz] = mirror(c.x, c.z);
    crayon(k, mx, mz, c.axis, c.len, c.color === C.red ? C.blue : C.green, (c.dir * -1) as 1 | -1, CRAYON_R);
  }
  // wooden track (stadium loop)
  const pts: THREE.Vector2[] = [];
  const seg = 14;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    pts.push(new THREE.Vector2(Math.cos(a) * TRACK.rx, TRACK.straight + Math.sin(a) * TRACK.rx));
  }
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI + (i / seg) * Math.PI;
    pts.push(new THREE.Vector2(Math.cos(a) * TRACK.rx, -TRACK.straight + Math.sin(a) * TRACK.rx));
  }
  trackLoop(k, pts);

  // ---- foam darts scattered on the rug (avoid solids)
  const solids = level.boxes.filter((b) => b.kind !== 'floor' && !b.ghost);
  const free = (x: number, z: number, m = 0.8) => !solids.some((b) => x > b.min[0] - m && x < b.max[0] + m && z > b.min[2] - m && z < b.max[2] + m);
  const dr = mulberry(55);
  const dartCols = [C.blue, C.sky, C.green, C.yellow, C.pink, C.purple];
  let placed = 0;
  for (let i = 0; i < 400 && placed < 34; i++) {
    const x = (dr() - 0.5) * 58, z = dr() * 42;
    if (!free(x, z)) continue;
    const col = dartCols[Math.floor(dr() * dartCols.length)];
    const ry = dr() * Math.PI * 2;
    dart(k, x, z, ry, col);
    dart(k, -x, -z, ry + Math.PI, col);
    placed++;
  }
  // suction darts stuck on walls & blocks
  const sd = mulberry(66);
  const stuck: [number, number, number, number, number][] = [
    [-29.99, 3.2, 8, 1, 0], [-29.99, 4.1, 8.6, 1, 0], [29.99, 2.8, 26, -1, 0], [-18, 2.2, 27.6, 0, 1],
    [6, 2.6, 27.59, 0, -1], [-4.6, 1.2, 36, 1, 0], [-24.99, 2.1, 16.5, 1, 0], [16.99, 1.4, 12, -1, 0],
  ];
  for (const [x, y, z, nx, nz] of stuck) {
    const tilt = (sd() - 0.5) * 0.5;
    const col = dartCols[Math.floor(sd() * dartCols.length)];
    stuckDart(k, x, y, z, nx, nz, col, tilt);
    stuckDart(k, -x, y, -z, -nx, -nz, col, -tilt);
  }

  // ---- team decor: fort signs over the gates, banners on the walls, bunting across the bases
  const signMat = mats.mat(0xffffff, { map: fortSignTexture() });
  for (const t of [0, 1] as const) {
    const s = t ? -1 : 1;
    const sg = new THREE.PlaneGeometry(8.6, 2.15);
    const uv = sg.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (t ? 0 : 0.5) + uv.getY(i) * 0.5);
    k.add(sg, signMat, 0, 5.3, (29.2 - 0.26) * s, t ? 0 : Math.PI);
    k.add(sg, signMat, 0, 5.3, (29.2 + 0.26) * s, t ? Math.PI : 0);
    k.add(bevelBox(8.9, 2.2, 0.5, 0.12), t ? RED : BLUE, 0, 5.3, 29.2 * s);
    k.add(bevelBox(9.2, 0.35, 0.7, 0.12), C.gold, 0, 6.5, 29.2 * s);
    const cell = t ? CELL.starRed : CELL.starBlue;
    const banner = bannerGeo(cell);
    for (const [x, z, ry] of [[-29.95, 36, Math.PI / 2], [29.95, 38, -Math.PI / 2], [-20, 43.95, Math.PI], [20, 43.95, Math.PI]] as const) {
      k.add(banner, atlasMat, x * s, 5.4, z * s, ry + (t ? Math.PI : 0));
    }
    const cols = t ? [RED, C.white, C.pink, C.yellow] : [BLUE, C.white, C.sky, C.yellow];
    bunting(scene, mats, new THREE.Vector3(-29.5 * s, 7.2, 30.5 * s), new THREE.Vector3(-8.2 * s, 6.2, 29.2 * s), cols, 1.4, 12, main as never);
    bunting(scene, mats, new THREE.Vector3(8.2 * s, 6.2, 29.2 * s), new THREE.Vector3(29.5 * s, 7.2, 30.5 * s), cols, 1.4, 12, main as never);
  }

  // ---- toy trampolines around the jump pads (open frame so the engine's pad marker stays visible)
  for (const p of level.pads) {
    const ring = new THREE.TorusGeometry(1.55, 0.2, 8, 28);
    ring.rotateX(Math.PI / 2);
    k.add(ring, C.red, p.pos[0], 0.32, p.pos[2]);
    const ring2 = new THREE.TorusGeometry(1.55, 0.09, 6, 28);
    ring2.rotateX(Math.PI / 2);
    k.add(ring2, C.yellow, p.pos[0], 0.52, p.pos[2]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.add(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 6), C.navy, p.pos[0] + Math.cos(a) * 1.55, 0.15, p.pos[2] + Math.sin(a) * 1.55);
      k.add(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 4), C.white, p.pos[0] + Math.cos(a + 0.5) * 1.55, 0.42, p.pos[2] + Math.sin(a + 0.5) * 1.55);
    }
  }

  // ---- chimney smoke puffs (one instanced mesh, animated)
  {
    const puffs = 6;
    const chimneys = [new THREE.Vector3(TRAIN_X, 3.9, LOCO_Z - 2), new THREE.Vector3(-TRAIN_X, 3.9, -LOCO_Z + 2)];
    const inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1), matte(0xffffff, null, { rough: 0.6 }), puffs * chimneys.length);
    inst.userData.dynamic = true;
    inst.frustumCulled = false;
    scene.add(inst);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    ctx.animate((_dt, time) => {
      chimneys.forEach((c, ci) => {
        for (let i = 0; i < puffs; i++) {
          const ph = (time * 0.35 + i / puffs + ci * 0.37) % 1;
          const s = Math.sin(ph * Math.PI) * (0.5 + ph * 0.9);
          p.set(c.x + Math.sin(ph * 5 + i) * 0.25 + ph * 0.8, c.y + ph * 3.2, c.z + Math.cos(ph * 4 + i) * 0.25);
          m4.compose(p, q, sc.set(s, s * 0.85, s));
          inst.setMatrixAt(ci * puffs + i, m4);
        }
      });
      inst.instanceMatrix.needsUpdate = true;
    });
  }

  main.flushInto(ctx.batch);
  detail.flushTo(scene, false, true);

  // ---- the giant bedroom around the rug (no shadow casting: cheap, and it keeps the light in)
  const bg = new MergeBatch();
  const kb = new Kit(mats, bg, atlasMat);
  buildRoom(kb, scene, mats, matte, posterMat, ctx.animate);
  bg.flushTo(scene, false, false);
}

/** Plane mapped onto one atlas cell. */
function atlasRectUVCell(g: THREE.BufferGeometry, cell: number) {
  const [u0, v0, u1, v1] = cellUV(cell);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

/** Hanging team banner (swallow-tail) using an atlas star cell. */
function bannerGeo(cell: number) {
  const g = new THREE.PlaneGeometry(2.6, 3.6, 2, 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  // pull the bottom-middle vertex up to make a swallow tail
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i)) < 0.01 && pos.getY(i) < -1.7) pos.setY(i, -1.0);
  return atlasRectUVCell(g, cell);
}

/** Rounded dice geometry with pips from the atlas. */
function diceGeo(s: number, faces: number[]) {
  const base = bevelBox(s, s, s, s * 0.14);
  const g = base.clone();
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const idx = g.index!;
  for (let f = 0; f < 6; f++) {
    const grp = g.groups[f];
    const [u0, v0, u1, v1] = cellUV(faces[f]);
    const seen = new Set<number>();
    for (let q = grp.start; q < grp.start + grp.count; q++) {
      const vi = idx.getX(q);
      if (seen.has(vi)) continue;
      seen.add(vi);
      uv.setXY(vi, u0 + uv.getX(vi) * (u1 - u0), v0 + uv.getY(vi) * (v1 - v0));
    }
  }
  return g;
}

/** Giant picture book lying flat (covers, spine, cream pages). */
function giantBook(k: Kit, b: BoxDef, col: number, mir: boolean) {
  const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const ct = 0.16;
  // spine on the wall side (+x for blue, -x for red)
  const sp = mir ? -1 : 1;
  k.bbox(col, cx, b.min[1] + ct / 2 + 0.01, cz, sx, ct, sz, 0.06);
  k.bbox(col, cx, b.max[1] - ct / 2 - 0.01, cz, sx, ct, sz, 0.06);
  k.bbox(col, cx + sp * (sx / 2 - 0.12), (b.min[1] + b.max[1]) / 2, cz, 0.24, sy - 0.02, sz, 0.08);
  k.bbox(0xfff4de, cx - sp * 0.1, (b.min[1] + b.max[1]) / 2, cz, sx - 0.35, sy - ct * 2, sz - 0.3, 0.04);
  // page lines
  for (let i = 1; i < 4; i++) k.bbox(0xead8b8, cx - sp * 0.1, b.min[1] + ct + (i / 4) * (sy - ct * 2), cz, sx - 0.3, 0.03, sz - 0.25, 0.01);
  // title band on the cover
  k.bbox(C.white, cx, b.max[1] - 0.005, cz, sx * 0.55, 0.02, sz * 0.3, 0.01);
}

/** Toy chest in team colour with a TOYS label, open lid and toys peeking out. */
function toyChest(k: Kit, posterMat: THREE.Material, b: BoxDef, team: 0 | 1) {
  const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const col = team ? RED : BLUE;
  const G = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    G.add(m);
  };
  const body = k.m(col), trim = k.m(C.white), gold = k.m(C.gold);
  // local frame: front faces -z
  add(bevelBox(sx, sy, sz, 0.35), body, 0, sy / 2, 0);
  add(bevelBox(sx + 0.3, 0.5, sz + 0.3, 0.2), trim, 0, 0.25, 0);
  add(bevelBox(sx + 0.3, 0.45, sz + 0.3, 0.2), trim, 0, sy - 0.2, 0);
  for (const x of [-sx / 2 + 0.5, sx / 2 - 0.5]) add(bevelBox(0.5, sy, sz + 0.2, 0.15), trim, x, sy / 2, 0);
  const label = atlasRectUV(new THREE.PlaneGeometry(6.6, 4.1), POSTER.toys);
  add(label, posterMat, 0, sy - 2.25, -sz / 2 - 0.02, 0, Math.PI, 0);
  const star = starGeo(1.1, 0.2);
  for (const x of [-7.2, 7.2]) add(star, k.m(C.yellow), x, sy - 2.3, -sz / 2 - 0.05, 0, Math.PI, 0);
  // lid, open and leaning back
  add(bevelBox(sx, 0.6, sz + 0.4, 0.25), body, 0, sy + sz * 0.5, sz / 2 + 0.6, -Math.PI / 2 + 0.35, 0, 0);
  // toys peeking out
  add(new THREE.SphereGeometry(1.4, 18, 12), k.m(C.yellow), -5, sy + 0.4, 0.2);
  add(new THREE.SphereGeometry(1.0, 16, 10), k.m(C.green), 6.5, sy + 0.2, 0.6);
  add(new THREE.ConeGeometry(0.7, 2.2, 12), k.m(C.red), 2.5, sy + 1.4, 0.6, 0.2, 0, -0.3);
  add(new THREE.CylinderGeometry(0.7, 0.7, 2.4, 12), k.m(C.white), 2.9, sy + 0.1, 0.8, 0.2, 0, -0.3);
  G.position.set(cx, b.min[1], cz);
  G.rotation.y = team ? Math.PI : 0;
  k.batch.addMesh(G);
  // little alphabet blocks sticking out of the chest
  const s = team ? -1 : 1;
  k.block(cx - 1.5 * s, sy - 0.4, cz + 0.4 * s, 1.3, [CELL.T, CELL.O, CELL.Y, CELL.plainYellow, CELL.A, CELL.B], 0.4);
  k.block(cx + 4.8 * s, sy - 0.5, cz + 0.1 * s, 1.2, [CELL.starBlue, CELL.C, CELL.N1, CELL.plainRed, CELL.heart, CELL.moon], -0.3);
}

export const toy: WorldDef = {
  theme: {
    id: 'toy',
    name: 'Toy Box',
    tagline: 'Tiny toy soldiers wage foam-dart war across a giant bedroom rug.',
    image: img,
    teams: [
      { name: 'Blue', primary: BLUE, secondary: 0x1f5fd6, dark: 0x163a8a, light: 0xa8cdff },
      { name: 'Red', primary: RED, secondary: 0xd62839, dark: 0x8a1624, light: 0xffb3bb },
    ],
    style: {
      outlineColor: 0x1b2250,
      outlineWidth: 1.2,
      outlineStrength: 0.42,
      outlineSensitivity: 1,
      neonEdges: 0,
      saturation: 1.2,
      contrast: 1.1,
      brightness: 0.0,
      tint: 0xffffff,
      halftone: 0,
      halftoneScale: 5,
      paper: 0,
      grain: 0,
      vignette: 0.12,
      posterize: 0,
      bloom: null,
      exposure: 0.93,
    },
    material: 'glossy',
    hudClass: 'hud-toy',
    impact: 'dart',
    character: { hat: 'army', skin: 0xffcfa6, glove: 0xfff6e8, shoe: 0x27305a, backpack: true, emblem: 'star', material: 'glossy' },
    botNames: [
      ['SgtSprinkle', 'PvtPudding', 'CplCrayon', 'MajMarbles', 'CaptCuddles', 'LtLollipop'],
      ['GenGumdrop', 'SgtSnapper', 'PvtPogo', 'CplKazoo', 'MajMayhem', 'CaptCupcake'],
    ],
    background: 0xf6ead6,
    fog: { color: 0xfbefdc, near: 70, far: 330 },
    sun: { color: 0xffeccc, intensity: 2.1, dir: [-0.55, 0.8, 0.14] },
    hemi: { sky: 0xf4f1ff, ground: 0xe8c79a, intensity: 0.9 },
    hitWords: ['POP!', 'BOING!', 'THWIP!', 'SQUEAK!', 'FWUMP!'],
    weaponNames: { blaster: 'Foam Blaster', scatter: 'Dart Scatter', boomer: 'Bouncy Boomer', zapper: 'Suction Sniper' },
    accent: 0xffd23f,
  },
  level: layout,
  build,
};
