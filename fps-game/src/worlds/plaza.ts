import * as THREE from 'three';
import type { WorldDef, WorldBuildContext } from './types';
import { LevelBuilder } from './builder';
import {
  skyDome, cloud, tileTexture, crateTexture, stripeTexture, facadeTexture, palmTree,
  bunting, boxVisual, rampGeometry, roundedBox, boxGeo,
} from './common';
import { canvasTexture, textTexture } from '../render/Materials';
import { mulberry } from '../core/utils';
import img from '../assets/plaza.webp';

const BLUE = 0x1f6fff;
const RED = 0xff3b3b;

function layout() {
  const L = new LevelBuilder(32, 46);
  L.floor('floor', 8);

  // ---- perimeter "houses" (tall walls with individual heights)
  const r = mulberry(42);
  const sideHouses = (x0: number, x1: number) => {
    let z = -46;
    while (z < 46) {
      const w = Math.min(46 - z, 9 + Math.floor(r() * 6));
      const h = 7 + Math.floor(r() * 5);
      L.box([x0, 0, z], [x1, h, z + w], 'house', { data: { roof: r() > 0.5 ? 'dome' : 'tile', tone: Math.floor(r() * 4) } });
      z += w;
    }
  };
  sideHouses(-35, -29);
  sideHouses(29, 35);
  // back walls (behind bases)
  for (const sgn of [1, -1]) {
    let x = -29;
    while (x < 29) {
      const w = Math.min(29 - x, 8 + Math.floor(r() * 5));
      const h = 8 + Math.floor(r() * 5);
      if (sgn > 0) L.box([x, 0, 44], [x + w, h, 50], 'house', { data: { roof: r() > 0.5 ? 'dome' : 'tile', tone: Math.floor(r() * 4), team: 0 } });
      else L.box([x, 0, -50], [x + w, h, -44], 'house', { data: { roof: r() > 0.5 ? 'dome' : 'tile', tone: Math.floor(r() * 4), team: 1 } });
      x += w;
    }
  }

  // ---- base front walls with three openings
  for (const [a, b] of [[-29, -19], [-13, -4.5], [4.5, 13], [19, 29]] as const) {
    L.mBoxC((a + b) / 2, 28.75, b - a, 1.5, 3.6, 'basewall');
  }
  // base balcony + side ramps
  L.mBoxC(0, 41.5, 20, 3, 3.2, 'balcony');
  L.mRamp(-13, 41.5, 6, 3, 'x', 1, 0, 3.2, 'stairs');
  L.mRamp(13, 41.5, 6, 3, 'x', -1, 0, 3.2, 'stairs');
  L.mBoxC(-6, 39.8, 3, 0.4, 0.9, 'railing', 3.2);
  L.mBoxC(6, 39.8, 3, 0.4, 0.9, 'railing', 3.2);
  // base clutter
  L.mBoxC(-24, 33, 2, 2, 2, 'crate');
  L.mBoxC(-22, 33.4, 1.4, 1.4, 1.4, 'crate');
  L.mBoxC(24, 36, 2, 2, 2, 'crate');
  L.mBoxC(-26.5, 26.5, 1.1, 1.1, 1.3, 'barrel');
  L.mBoxC(26.5, 26.5, 1.1, 1.1, 1.3, 'barrel');

  // ---- fountain (self-symmetric, centre)
  const rim = 0.9;
  for (const s of [1, -1]) {
    L.box([-4, 0, s > 0 ? 3.3 : -4], [-1.1, rim, s > 0 ? 4 : -3.3], 'fountain', { invisible: true });
    L.box([1.1, 0, s > 0 ? 3.3 : -4], [4, rim, s > 0 ? 4 : -3.3], 'fountain', { invisible: true });
    L.box([s > 0 ? 3.3 : -4, 0, -3.3], [s > 0 ? 4 : -3.3, rim, -1.1], 'fountain', { invisible: true });
    L.box([s > 0 ? 3.3 : -4, 0, 1.1], [s > 0 ? 4 : -3.3, rim, 3.3], 'fountain', { invisible: true });
  }
  L.box([-0.9, 0, -0.9], [0.9, 2.2, 0.9], 'plinth', { invisible: true });
  L.box([-0.45, 2.2, -0.45], [0.45, 4.6, 0.45], 'statue', { invisible: true });

  // ---- mid field cover
  L.mBoxC(-8, 12, 2, 2, 2, 'crate');
  L.mBoxC(-6, 12.2, 2, 2, 1, 'crate');
  L.mBoxC(-8.2, 14, 2, 2, 1, 'crate');
  L.mBoxC(9, 7, 2.2, 2.2, 2.2, 'crate');
  L.mBoxC(11, 7.6, 1.4, 1.4, 1.4, 'crate');
  L.mBoxC(0, 17, 6, 0.8, 1.2, 'lowwall');
  L.mBoxC(-15, 15, 5, 0.8, 1.2, 'lowwall');
  L.mBoxC(5, 24, 5, 0.8, 1.2, 'lowwall');
  L.mBoxC(-5, 24, 3, 0.8, 1.2, 'lowwall');
  // colonnade arches
  L.mBoxC(13, 3.2, 1.2, 1.2, 4.2, 'pillar');
  L.mBoxC(13, -3.2, 1.2, 1.2, 4.2, 'pillar');
  L.mBoxC(13, 0, 1.2, 7.6, 0.8, 'arch', 4.2, { ghost: true });

  // ---- market stalls (left lane on blue half)
  for (const z of [10, 16, 22]) L.mBoxC(-25, z, 2, 4, 1.1, 'stall');

  // ---- raised terrace (right lane on blue half)
  L.mBoxC(22.5, 16, 13, 12, 2.6, 'terrace');
  L.mRamp(18, 7, 4, 6, 'z', 1, 0, 2.6, 'stairs');
  L.mRamp(27, 24.5, 4, 5, 'z', -1, 0, 2.6, 'stairs');
  L.mBoxC(16.3, 16.5, 0.4, 11, 0.9, 'railing', 2.6);
  L.mBoxC(26, 19.5, 4, 4, 3, 'shed', 2.6);
  L.pad([10.5, 0, 11], [21, 2.6, 13]);

  // palm trunks
  for (const [x, z] of [[-18, 26], [18, 26], [-27, 3], [8, 30]] as const) L.mBoxC(x, z, 0.6, 0.6, 6, 'palm');

  // ---- spawns (blue; mirrored to red)
  const sp: [number, number][] = [[-22, 38], [-17, 35], [-8, 36.5], [-3, 38], [3, 38], [8, 36.5], [17, 35], [22, 38]];
  for (const [x, z] of sp) L.spawn(x, 0, z, 0);

  // ---- pickups
  L.pickup('health', -20, 0, 4);
  L.pickup('health', 24, 0, 31);
  L.pickup('health', -11, 0, 24);
  L.pickup('ammo', 6, 0, 20);
  L.pickup('ammo', -26, 0, 36);
  L.pickup('ammo', 20, 2.6, 20);
  L.pickup('boomer', 0, 0, 2.2);
  L.pickup('zapper', 24, 2.6, 13);
  L.pickup('overcharge', 25, 0, 0);

  L.flags([0, 0, 34]);
  L.zone([0, 0, 0], 7.5);
  for (const p of [[-22, 0, 16], [22, 2.6, 16], [-8, 0, 16], [9, 0, 10], [0, 0, 22], [-20, 0, 0]] as const) L.hotspot(p[0], p[1], p[2]);
  return L.build();
}

function build(ctx: WorldBuildContext) {
  const { scene, level, mats, batch } = ctx;
  const T = level;

  // sky
  scene.add(skyDome({ top: 0x2f8cff, horizon: 0xbfe6ff, bottom: 0xf3e2c0, sunColor: 0xfff6c8, sunDir: [0.4, 0.55, -0.7], sunSize: 0.07 }));
  const clouds = new THREE.Group();
  const cr = mulberry(9);
  for (let i = 0; i < 14; i++) {
    const c = cloud(mats, 0xffffff, i + 1, 1.3 + cr() * 1.2);
    const a = cr() * Math.PI * 2, d = 90 + cr() * 120;
    c.position.set(Math.cos(a) * d, 38 + cr() * 30, Math.sin(a) * d);
    c.rotation.y = cr() * 6;
    clouds.add(c);
  }
  clouds.userData.dynamic = true;
  scene.add(clouds);
  ctx.animate((dt) => { clouds.rotation.y += dt * 0.004; });

  // floor
  const floorTex = tileTexture('#f2c894', '#e8b67a', '#c98f55', 4, 512, 0.08);
  floorTex.repeat.set(26, 36);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(104, 144), mats.mat(0xffffff, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // lane paths: darker cobbled strips
  const pathTex = tileTexture('#e0a970', '#d99c60', '#a8703e', 6, 256, 0.1, 8);
  pathTex.repeat.set(2, 20);
  for (const x of [-22, 22]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(6, 80), mats.mat(0xffffff, { map: pathTex }));
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.01, 0);
    p.receiveShadow = true;
    scene.add(p);
  }

  const tones = ['#ffd66b', '#ffb36b', '#ff9d8a', '#fce7b0'];
  const facadeMats = tones.map((t, i) => mats.mat(0xffffff, { map: facadeTexture(t, '#3b6fd8', '#fff4dc', 3, 2, 10 + i, '#ffffff') }));
  const roofTile = mats.mat(0xe4572e);
  const domeMat = mats.mat(0xff6f3c);
  const trim = mats.mat(0xfff4dc);
  const crateTex = crateTexture();
  const crateMat = mats.mat(0xffffff, { map: crateTex });
  const stucco = mats.mat(0xfbe3b8);
  const stone = mats.mat(0xe9cf9f);
  const wood = mats.mat(0xb07a45);
  const railing = mats.mat(0xfff4dc);
  const awningA = mats.mat(0xffffff, { map: stripeTexture('#ffffff', '#ff5a4f', 6), side: THREE.DoubleSide });
  const awningB = mats.mat(0xffffff, { map: stripeTexture('#ffffff', '#2d8cff', 6), side: THREE.DoubleSide });
  const awningC = mats.mat(0xffffff, { map: stripeTexture('#ffffff', '#ffb000', 6), side: THREE.DoubleSide });
  const teamMat = [mats.mat(BLUE), mats.mat(RED)];

  const m4 = new THREE.Matrix4();
  const hr = mulberry(77);

  for (const b of T.boxes) {
    if (b.invisible) continue;
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
    const team = (b.data?.team as number | undefined) ?? 0;
    switch (b.kind) {
      case 'floor':
        break;
      case 'house': {
        const tone = (b.data?.tone as number) ?? 0;
        batch.add(boxGeo(sx, sy, sz, 0.25), facadeMats[tone], m4.makeTranslation(cx, cy, cz));
        batch.box(trim, cx, b.max[1] + 0.15, cz, sx + 0.4, 0.3, sz + 0.4);
        if (b.data?.roof === 'dome') {
          const rad = Math.min(sx, sz) * 0.38;
          const dome = new THREE.SphereGeometry(rad, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
          batch.add(new THREE.CylinderGeometry(rad * 1.02, rad * 1.02, 1.2, 16), trim, m4.makeTranslation(cx, b.max[1] + 0.9, cz));
          batch.add(dome, domeMat, m4.makeTranslation(cx, b.max[1] + 1.5, cz));
          batch.add(new THREE.ConeGeometry(0.25, 1.2, 6), trim, m4.makeTranslation(cx, b.max[1] + 1.5 + rad + 0.5, cz));
        } else {
          const roof = new THREE.ConeGeometry(Math.max(sx, sz) * 0.62, 2.8, 4);
          roof.rotateY(Math.PI / 4);
          roof.scale(sx / Math.max(sx, sz), 1, sz / Math.max(sx, sz));
          batch.add(roof, roofTile, m4.makeTranslation(cx, b.max[1] + 1.7, cz));
        }
        // awnings on the side facing the arena
        const inward = new THREE.Vector3(-Math.sign(cx) * (Math.abs(cx) > 28 ? 1 : 0), 0, Math.abs(cx) > 28 ? 0 : -Math.sign(cz));
        if (hr() > 0.35) {
          const aw = new THREE.PlaneGeometry(Math.min(Math.max(sx, sz) * 0.6, 7), 2);
          const mesh2 = new THREE.Mesh(aw, [awningA, awningB, awningC][Math.floor(hr() * 3)]);
          const fx = inward.x !== 0 ? (inward.x > 0 ? b.max[0] : b.min[0]) : cx;
          const fz = inward.z !== 0 ? (inward.z > 0 ? b.max[2] : b.min[2]) : cz;
          mesh2.position.set(fx + inward.x * 0.9, 3.2, fz + inward.z * 0.9);
          mesh2.rotation.y = Math.atan2(inward.x, inward.z);
          mesh2.rotateX(-1.0);
          mesh2.castShadow = true;
          scene.add(mesh2);
        }
        break;
      }
      case 'basewall': {
        boxVisual(batch, stucco, b);
        batch.box(teamMat[team], cx, b.max[1] - 0.35, cz, sx + 0.06, 0.35, sz + 0.06);
        batch.box(trim, cx, b.max[1] + 0.12, cz, sx + 0.3, 0.24, sz + 0.3);
        // crenellations
        const n = Math.floor(sx / 1.6);
        for (let i = 0; i < n; i++) batch.box(stucco, b.min[0] + (i + 0.5) * (sx / n), b.max[1] + 0.5, cz, 0.7, 0.6, sz * 0.8);
        break;
      }
      case 'balcony': {
        boxVisual(batch, stone, b);
        batch.box(trim, cx, b.max[1] + 0.1, cz, sx + 0.3, 0.2, sz + 0.3);
        // arches under the balcony
        for (let i = 0; i < 5; i++) {
          const ax = b.min[0] + (i + 0.5) * (sx / 5);
          const face = team === 0 ? b.min[2] - 0.02 : b.max[2] + 0.02;
          const arch = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16, 0, Math.PI), mats.mat(0x6b3a1e));
          arch.position.set(ax, 1.6, face);
          arch.rotation.y = team === 0 ? Math.PI : 0;
          batch.addMesh(arch);
          const rect = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), mats.mat(0x6b3a1e));
          rect.position.set(ax, 0.8, face);
          rect.rotation.y = team === 0 ? Math.PI : 0;
          batch.addMesh(rect);
        }
        break;
      }
      case 'railing': {
        batch.box(railing, cx, b.max[1] - 0.08, cz, sx, 0.16, sz);
        const along = sx > sz ? 'x' : 'z';
        const len = Math.max(sx, sz);
        const n = Math.floor(len / 0.5);
        for (let i = 0; i <= n; i++) {
          const t = -len / 2 + (i / n) * len;
          batch.add(new THREE.CylinderGeometry(0.07, 0.09, sy - 0.16, 6), railing,
            m4.makeTranslation(along === 'x' ? cx + t : cx, b.min[1] + (sy - 0.16) / 2, along === 'z' ? cz + t : cz));
        }
        break;
      }
      case 'crate':
        batch.add(roundedBox(sx, sy, sz, 0.06, 1), crateMat, m4.makeTranslation(cx, cy, cz));
        break;
      case 'barrel': {
        batch.add(new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 12), mats.mat(team ? RED : BLUE), m4.makeTranslation(cx, cy, cz));
        batch.add(new THREE.TorusGeometry(sx / 2, 0.05, 4, 16).rotateX(Math.PI / 2), mats.mat(0x444444), m4.makeTranslation(cx, cy + sy * 0.3, cz));
        batch.add(new THREE.TorusGeometry(sx / 2, 0.05, 4, 16).rotateX(Math.PI / 2), mats.mat(0x444444), m4.makeTranslation(cx, cy - sy * 0.3, cz));
        break;
      }
      case 'lowwall':
        batch.add(roundedBox(sx, sy, sz, 0.12, 1), stone, m4.makeTranslation(cx, cy, cz));
        batch.box(trim, cx, b.max[1] + 0.06, cz, sx + 0.1, 0.12, sz + 0.1);
        break;
      case 'pillar':
        batch.add(new THREE.CylinderGeometry(sx * 0.42, sx * 0.48, sy - 0.6, 10), trim, m4.makeTranslation(cx, cy, cz));
        batch.box(stone, cx, b.min[1] + 0.3, cz, sx, 0.6, sz);
        batch.box(stone, cx, b.max[1] - 0.3, cz, sx, 0.6, sz);
        break;
      case 'arch': {
        batch.box(stucco, cx, cy + 0.3, cz, sx, sy + 0.6, sz);
        batch.box(teamMat[0], cx, cy + 0.3, cz, sx + 0.05, 0.3, sz * 0.3);
        break;
      }
      case 'stall': {
        batch.box(wood, cx, cy, cz, sx, sy, sz);
        batch.box(mats.mat(0xfff0d0), cx, b.max[1] + 0.05, cz, sx + 0.2, 0.1, sz + 0.2);
        const inward = Math.sign(-cx) || 1;
        for (const dz of [-sz / 2, sz / 2]) {
          for (const dx of [-inward * sx / 2, inward * (sx / 2 + 1.4)]) {
            batch.add(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 5), wood, m4.makeTranslation(cx + dx, 1.4, cz + dz));
          }
        }
        const canopy = new THREE.Mesh(new THREE.PlaneGeometry(sx + 2, sz + 0.6), [awningA, awningB, awningC][Math.floor(hr() * 3)]);
        canopy.rotation.x = -Math.PI / 2;
        canopy.rotation.y = 0;
        canopy.position.set(cx + inward * 0.6, 2.85, cz);
        canopy.rotateY(inward * 0.25);
        canopy.castShadow = true;
        scene.add(canopy);
        // fruit
        const fruitColors = [0xff4b3e, 0xffc83d, 0x7ed957, 0xff8a2b];
        for (let i = 0; i < 10; i++) {
          batch.add(new THREE.IcosahedronGeometry(0.16, 1), mats.mat(fruitColors[i % 4]),
            m4.makeTranslation(cx + (hr() - 0.5) * sx * 0.7, b.max[1] + 0.2, cz + (hr() - 0.5) * sz * 0.8));
        }
        break;
      }
      case 'terrace': {
        const tex = facadeTexture('#f6d49a', '#6b3a1e', '#fff4dc', 4, 1, 3);
        tex.repeat.set(3, 1);
        batch.box(mats.mat(0xffffff, { map: tex }), cx, cy, cz, sx, sy, sz);
        batch.box(trim, cx, b.max[1] + 0.06, cz, sx + 0.3, 0.12, sz + 0.3);
        break;
      }
      case 'shed': {
        batch.box(mats.mat(0xffe1a8), cx, cy, cz, sx, sy, sz);
        const roof = new THREE.ConeGeometry(sx * 0.8, 1.6, 4);
        roof.rotateY(Math.PI / 4);
        batch.add(roof, roofTile, m4.makeTranslation(cx, b.max[1] + 0.8, cz));
        break;
      }
      case 'palm':
        palmTree(batch, mats, cx, 0, cz, 6.5, Math.floor(cx * 7 + cz), 0xa0703c, 0x36b24a);
        break;
      default:
        boxVisual(batch, stucco, b);
    }
  }

  for (const rdef of T.ramps) {
    batch.add(rampGeometry(rdef), stone);
    // step stripes
    const len = rdef.axis === 'x' ? rdef.max[0] - rdef.min[0] : rdef.max[2] - rdef.min[2];
    const n = Math.floor(len / 0.6);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const along = (rdef.axis === 'x' ? rdef.min[0] : rdef.min[2]) + t * len;
      const tt = rdef.dir === 1 ? t : 1 - t;
      const h = rdef.h0 + (rdef.h1 - rdef.h0) * tt;
      const w = rdef.axis === 'x' ? rdef.max[2] - rdef.min[2] : rdef.max[0] - rdef.min[0];
      if (rdef.axis === 'x') batch.box(trim, along, h + 0.01, (rdef.min[2] + rdef.max[2]) / 2, 0.08, 0.04, w);
      else batch.box(trim, (rdef.min[0] + rdef.max[0]) / 2, h + 0.01, along, w, 0.04, 0.08);
    }
  }

  // ---- fountain
  const basinPts = [new THREE.Vector2(3.4, 0), new THREE.Vector2(4.1, 0), new THREE.Vector2(4.2, 0.8), new THREE.Vector2(3.95, 0.95), new THREE.Vector2(3.6, 0.85), new THREE.Vector2(3.5, 0.2)];
  const basin = new THREE.Mesh(new THREE.LatheGeometry(basinPts, 32), mats.mat(0xd9d4cc));
  basin.castShadow = basin.receiveShadow = true;
  scene.add(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.5, 32), mats.mat(0x4fc3ff, { emissive: 0x1a6fb0, emissiveIntensity: 0.35 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.25;
  scene.add(water);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 2.2, 16), mats.mat(0xd9d4cc));
  plinth.position.y = 1.1;
  plinth.castShadow = true;
  scene.add(plinth);
  const bowl = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.2, 0), new THREE.Vector2(1.8, 0.4), new THREE.Vector2(1.9, 0.6), new THREE.Vector2(0.4, 0.3)], 24), mats.mat(0xd9d4cc));
  bowl.position.y = 1.7;
  scene.add(bowl);
  scene.add(statue(mats));
  // water jets
  const jetMat = mats.mat(0x9fe3ff, { transparent: true, opacity: 0.75, emissive: 0x2a8fd0, emissiveIntensity: 0.4 });
  const jets: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.6, 8, 1, true), jetMat);
    jet.position.set(Math.cos(a) * 1.7, 2.6, Math.sin(a) * 1.7);
    jet.rotation.z = Math.cos(a) * 0.5;
    jet.rotation.x = -Math.sin(a) * 0.5;
    jet.userData.dynamic = true;
    scene.add(jet);
    jets.push(jet);
  }
  ctx.animate((_dt, t) => {
    jets.forEach((j, i) => { j.scale.y = 0.85 + Math.sin(t * 6 + i) * 0.15; });
  });

  // ---- bunting & banners
  const bcol = [0xff5a4f, 0xffc83d, 0x2d8cff, 0x7ed957, 0xff8a2b];
  for (const z of [-30, -14, 0, 14, 30]) bunting(scene, mats, new THREE.Vector3(-29, 7.5, z), new THREE.Vector3(29, 7.5, z + 4), bcol, 1.8, 30, batch);
  const bannerTex = [emblemBanner('#1f6fff'), emblemBanner('#ff3b3b')];
  for (const [x, z, t] of [[-28.9, 34, 0], [28.9, 20, 0], [-28.9, 10, 0], [28.9, -34, 1], [-28.9, -20, 1], [28.9, -10, 1]] as const) {
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4), mats.mat(0xffffff, { map: bannerTex[t], side: THREE.DoubleSide }));
    bn.position.set(x + (x > 0 ? -0.05 : 0.05), 5.5, z);
    bn.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(bn);
  }
  // slogans painted on base walls / houses
  const slogans = ['BIGGER SPLATS\nBRIGHTER DAYS!', 'SPLAT MAKES\nFRIENDS!', 'STAY FRESH,\nSTAY SPLATTY'];
  slogans.forEach((s, i) => {
    const tex = textTexture(s, { w: 512, h: 256, fg: i === 1 ? '#1f6fff' : '#ff3b3b', stroke: '#ffffff', strokeWidth: 16 });
    for (const sgn of [1, -1]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), mats.mat(0xffffff, { map: tex, transparent: true }));
      const z = [8, -2, 24][i] * sgn;
      pl.position.set(28.95 * -sgn, 4.2, z);
      pl.rotation.y = sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(pl);
    }
  });

  // distant skyline for depth
  const far = mulberry(3);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const d = 75 + far() * 30;
    const h = 10 + far() * 16;
    const w = 8 + far() * 8;
    const col = [0xffc27a, 0xffb0a0, 0xffe09a, 0xf6c6ff][i % 4];
    batch.box(mats.mat(col), Math.cos(a) * d, h / 2, Math.sin(a) * d * 1.2, w, h, w);
    if (far() > 0.5) batch.add(new THREE.SphereGeometry(w * 0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), domeMat, m4.makeTranslation(Math.cos(a) * d, h, Math.sin(a) * d * 1.2));
    else {
      const roof = new THREE.ConeGeometry(w * 0.7, 3, 4);
      roof.rotateY(Math.PI / 4);
      batch.add(roof, roofTile, m4.makeTranslation(Math.cos(a) * d, h + 1.5, Math.sin(a) * d * 1.2));
    }
  }

  // decorative potted plants near walls
  for (const [x, z] of [[-27.5, 30.5], [27.5, 30.5], [-27.5, 12], [12, 27], [-12, 27]] as const) {
    for (const s of [1, -1]) {
      batch.add(new THREE.CylinderGeometry(0.45, 0.32, 0.7, 8), mats.mat(0xd9653b), m4.makeTranslation(x * s, 0.35, z * s));
      batch.add(new THREE.IcosahedronGeometry(0.6, 1), mats.mat(0x3fae4f), m4.makeTranslation(x * s, 1.0, z * s));
    }
  }
}

function statue(mats: WorldBuildContext['mats']) {
  const g = new THREE.Group();
  const stone = mats.mat(0xc9c4bb);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.6, 4, 12), stone);
  body.position.y = 3.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), stone);
  head.position.y = 4.05;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.14, 16), stone);
  hat.position.y = 4.35;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.3, 16), stone);
  brim.position.y = 4.5;
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.35, 3, 8), stone);
  legL.position.set(-0.18, 2.45, 0);
  const legR = legL.clone();
  legR.position.x = 0.18;
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 3, 8), stone);
  arm.position.set(0.5, 3.6, 0.2);
  arm.rotation.z = -1.1;
  const gun = new THREE.Mesh(roundedBox(0.3, 0.3, 0.9, 0.08), stone);
  gun.position.set(0.85, 3.95, 0.25);
  gun.rotation.x = -0.6;
  g.add(body, head, hat, brim, legL, legR, arm, gun);
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  g.rotation.y = 0.6;
  return g;
}

function emblemBanner(color: string) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w / 2, h * 0.85); g.lineTo(0, h); g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    // paint splat emblem
    g.beginPath();
    g.arc(w / 2, h * 0.38, 28, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(w / 2 + Math.cos(a) * 36, h * 0.38 + Math.sin(a) * 36, 7 + (i % 2) * 5, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h * 0.7);
  });
}

export const plaza: WorldDef = {
  theme: {
    id: 'plaza',
    name: 'Splat Plaza',
    tagline: 'Sunny paint-splat mayhem in a cel-shaded town square.',
    image: img,
    teams: [
      { name: 'Blue', primary: BLUE, secondary: 0x0d3fa6, dark: 0x0a2a70, light: 0x8fc2ff },
      { name: 'Red', primary: RED, secondary: 0xa61d1d, dark: 0x6e1010, light: 0xffa0a0 },
    ],
    style: {
      outlineColor: 0x14102a,
      outlineWidth: 1.6,
      outlineStrength: 1,
      outlineSensitivity: 1,
      neonEdges: 0,
      saturation: 1.18,
      contrast: 1.04,
      brightness: 0.01,
      tint: 0xffffff,
      halftone: 0,
      halftoneScale: 5,
      paper: 0,
      grain: 0,
      vignette: 0.25,
      posterize: 0,
      bloom: null,
      exposure: 1,
    },
    material: 'toon',
    hudClass: 'hud-plaza',
    impact: 'paint',
    character: { hat: 'cap', skin: 0xffd2a8, glove: 0xffffff, shoe: 0x223055, backpack: true, emblem: 'splat' },
    botNames: [
      ['TurboTaco', 'PixelPanda', 'BlastBro', 'SplashJack', 'DoodleDan', 'BubbleBee'],
      ['RivalRex', 'SplatSally', 'CrimsonCat', 'BoomBunny', 'RedRocket', 'PepperPop'],
    ],
    background: 0xbfe6ff,
    fog: { color: 0xcfe9ff, near: 70, far: 220 },
    sun: { color: 0xfff1d6, intensity: 2.6, dir: [0.45, 1, 0.3] },
    hemi: { sky: 0xbfe0ff, ground: 0xf0c890, intensity: 1.35 },
    hitWords: ['SPLAT!', 'SPLOOSH!', 'BLAM!', 'POP!'],
    weaponNames: { blaster: 'Splat Blaster', scatter: 'Splash Scatter', boomer: 'Bubble Boomer', zapper: 'Squirt Sniper' },
    accent: 0xffc83d,
  },
  level: layout,
  build,
};
