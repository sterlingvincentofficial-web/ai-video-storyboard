import * as THREE from 'three';
import type { MaterialKit } from '../../render/Materials';
import { mulberry } from '../../core/utils';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, Kit, bevelBox, crayon, tr } from './props';
import {
  woodFloorTexture, wallpaperTexture, starFabricTexture, windowViewTexture, bookSpinesTexture,
  atlasRectUV, POSTER, furTexture,
} from './textures';

/** Room extents (the arena is a rug in the middle of a giant kid's bedroom). */
export const ROOM = { x: 80, z: 110, h: 78 };
/** Window on the -X wall (the "sun" shines through it). */
export const WIN = { z0: -24, z1: 24, y0: 20, y1: 62 };

export type Matte = (color: number, map?: THREE.Texture | null, o?: { side?: THREE.Side; rough?: number; emissive?: number }) => THREE.Material;

/** Cached matte (fabric / paint / paper) materials that sit next to the glossy toys. */
export function matteFactory(mats: MaterialKit): Matte {
  const cache = new Map<string, THREE.Material>();
  return (color, map = null, o = {}) => {
    const key = `${color}|${map?.uuid ?? ''}|${o.side ?? 0}|${o.rough ?? ''}|${o.emissive ?? ''}`;
    let m = cache.get(key);
    if (m) return m;
    const sm = new THREE.MeshStandardMaterial({ color, map, roughness: o.rough ?? 0.9, metalness: 0, side: o.side ?? THREE.FrontSide });
    if (o.emissive !== undefined) {
      sm.emissive = new THREE.Color(o.emissive);
      sm.emissiveIntensity = 1;
    }
    if (mats.envMap) {
      sm.envMap = mats.envMap;
      sm.envMapIntensity = 0.45;
    }
    cache.set(key, sm);
    return sm;
  };
}

/** Plane with UVs scaled so a texture repeats every `tile` metres. */
function tiledPlane(w: number, h: number, tile: number, offU = 0, offV = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, offU + (uv.getX(i) * w) / tile, offV + (uv.getY(i) * h) / tile);
  return g;
}

export function buildRoom(k: Kit, scene: THREE.Object3D, mats: MaterialKit, matte: Matte, posterMat: THREE.Material, animate: (fn: (dt: number, t: number) => void) => void) {
  const { x: RX, z: RZ, h: RH } = ROOM;
  const b = k.batch;
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
    b.add(geo, mat, tr(x, y, z, ry, rx, rz, sx, sy, sz));

  // ---------------------------------------------------------------- floor (around the rug)
  const woodTex = woodFloorTexture();
  const floorMat = mats.mat(0xffffff, { map: woodTex });
  const AX = 32, AZ = 46;
  const floorPiece = (x0: number, x1: number, z0: number, z1: number) => {
    const g = tiledPlane(x1 - x0, z1 - z0, 9, x0 / 9, -z1 / 9);
    g.rotateX(-Math.PI / 2);
    put(g, floorMat, (x0 + x1) / 2, 0, (z0 + z1) / 2);
  };
  floorPiece(-RX, RX, -RZ, -AZ);
  floorPiece(-RX, RX, AZ, RZ);
  floorPiece(-RX, -AX, -AZ, AZ);
  floorPiece(AX, RX, -AZ, AZ);

  // ---------------------------------------------------------------- walls
  const wallMat = matte(0xffffff, wallpaperTexture());
  const trim = matte(0xfffaf0, null, { rough: 0.5 });
  const wallQuad = (cx: number, cy: number, cz: number, w: number, h: number, ry: number, offU = 0, offV = 0) =>
    put(tiledPlane(w, h, 14, offU, offV), wallMat, cx, cy, cz, ry);
  // -Z wall (faces +Z) and +Z wall (faces -Z)
  wallQuad(0, RH / 2, -RZ, RX * 2, RH, 0);
  wallQuad(0, RH / 2, RZ, RX * 2, RH, Math.PI);
  // +X wall (faces -X)
  wallQuad(RX, RH / 2, 0, RZ * 2, RH, -Math.PI / 2);
  // -X wall (faces +X) with a window hole
  {
    const ry = Math.PI / 2;
    const hw = (WIN.z1 - WIN.z0);
    wallQuad(-RX, WIN.y0 / 2, 0, RZ * 2, WIN.y0, ry, 0, 0);
    wallQuad(-RX, (WIN.y1 + RH) / 2, 0, RZ * 2, RH - WIN.y1, ry, 0, WIN.y1 / 14);
    const sideW = RZ - WIN.z1;
    // plane faces +X after ry=+90deg: local +x maps to world -z
    wallQuad(-RX, (WIN.y0 + WIN.y1) / 2, WIN.z1 + sideW / 2, sideW, WIN.y1 - WIN.y0, ry, 0, WIN.y0 / 14);
    wallQuad(-RX, (WIN.y0 + WIN.y1) / 2, WIN.z0 - sideW / 2, sideW, WIN.y1 - WIN.y0, ry, (sideW + hw) / 14, WIN.y0 / 14);
  }
  // ceiling
  const ceil = new THREE.PlaneGeometry(RX * 2, RZ * 2);
  ceil.rotateX(Math.PI / 2);
  put(ceil, mats.mat(0xebe3d8, { unlit: true }), 0, RH, 0);
  // skirting boards & picture rail
  for (const [x, z, w, d] of [[0, -RZ + 0.6, RX * 2, 1.2], [0, RZ - 0.6, RX * 2, 1.2], [RX - 0.6, 0, 1.2, RZ * 2], [-RX + 0.6, 0, 1.2, RZ * 2]] as const) {
    put(bevelBox(w, 3, d, 0.3), trim, x, 1.5, z);
    put(bevelBox(w, 0.8, d * 0.8, 0.2), trim, x, RH - 6, z);
  }

  // ---------------------------------------------------------------- window, daylight, curtains
  {
    const view = new THREE.PlaneGeometry(WIN.z1 - WIN.z0 + 8, WIN.y1 - WIN.y0 + 8);
    put(view, mats.mat(0xffffff, { map: windowViewTexture(), unlit: true, fog: false }), -RX - 3, (WIN.y0 + WIN.y1) / 2, 0, Math.PI / 2);
    const fr = trim;
    const wy = (WIN.y0 + WIN.y1) / 2, wh = WIN.y1 - WIN.y0, wz = WIN.z1 - WIN.z0;
    put(bevelBox(3, wh + 3, 2.2, 0.4), fr, -RX + 0.6, wy, WIN.z0 - 1.1);
    put(bevelBox(3, wh + 3, 2.2, 0.4), fr, -RX + 0.6, wy, WIN.z1 + 1.1);
    put(bevelBox(3, 2.2, wz + 4.4, 0.4), fr, -RX + 0.6, WIN.y1 + 1.1, 0);
    put(bevelBox(6, 1.6, wz + 8, 0.5), fr, -RX + 2.2, WIN.y0 - 0.6, 0); // sill
    put(bevelBox(1.2, wh, 1.2, 0.3), fr, -RX - 1.5, wy, 0);
    put(bevelBox(1.2, 1.2, wz, 0.3), fr, -RX - 1.5, wy + 2, 0);
    // curtains (wavy fabric)
    const cMat = matte(0xffffff, starFabricTexture('#4f7fe0', '#ffffff'), { side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const w = 15, h = 60;
      const g = new THREE.PlaneGeometry(w, h, 30, 1);
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i), py = pos.getY(i);
        // gathered toward the bottom (tie-back) on the window side
        const t = (py + h / 2) / h; // 0 bottom .. 1 top
        const pinch = 1 - 0.35 * Math.pow(1 - t, 2);
        pos.setXYZ(i, px * pinch, py, Math.sin(px * 1.5) * 0.9);
        uv.setXY(i, uv.getX(i) * w / 10, uv.getY(i) * h / 10);
      }
      g.computeVertexNormals();
      const cz = side < 0 ? WIN.z0 - w / 2 + 3 : WIN.z1 + w / 2 - 3;
      put(g, cMat, -RX + 3.2, WIN.y1 + 6 - h / 2, cz, Math.PI / 2);
      // tie-back
      put(new THREE.TorusGeometry(2.2, 0.35, 8, 20), matte(C.yellow), -RX + 3.4, WIN.y0 + 14, cz, Math.PI / 2, 0, 0, 1, 1.4, 1);
    }
    // curtain rod
    const rod = new THREE.CylinderGeometry(0.5, 0.5, wz + 40, 12);
    rod.rotateX(Math.PI / 2);
    put(rod, mats.mat(C.gold), -RX + 3.6, WIN.y1 + 6.5, 0);
    for (const s of [-1, 1]) put(new THREE.SphereGeometry(1.3, 14, 10), mats.mat(C.gold), -RX + 3.6, WIN.y1 + 6.5, s * (wz / 2 + 20.5));

    // sunbeams (additive light shafts from the window across the room)
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const sun = new THREE.Vector3(-0.55, 0.8, 0.14).normalize();
    const beams = new THREE.Group();
    const br = mulberry(3);
    for (let i = 0; i < 6; i++) {
      const z = WIN.z0 + 4 + (i / 5) * (wz - 8) + (br() - 0.5) * 3;
      const y = WIN.y0 + 6 + br() * (wh - 14);
      const len = y / sun.y + 10;
      const w = 3 + br() * 5;
      const g = new THREE.PlaneGeometry(w, len);
      g.translate(0, -len / 2, 0);
      const m = new THREE.Mesh(g, beamMat);
      m.position.set(-RX + 1, y, z);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sun.clone().negate());
      m.rotateY(br() * Math.PI);
      m.renderOrder = 5;
      beams.add(m);
      const m2 = m.clone();
      m2.rotateY(Math.PI / 2);
      beams.add(m2);
    }
    const bb = new THREE.Mesh(mergeGroup(beams), beamMat);
    bb.renderOrder = 5;
    bb.castShadow = false;
    scene.add(bb);
    // dust motes drifting in the light
    const moteGeo = new THREE.BufferGeometry();
    const mp: number[] = [];
    for (let i = 0; i < 160; i++) {
      const t = br();
      const y = WIN.y0 + br() * (wh);
      const d = (y / sun.y) * t;
      mp.push(-RX + 2 - sun.x * d * -1 + (br() - 0.5) * 4, y - sun.y * d, WIN.z0 + br() * wz + sun.z * -d);
    }
    moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3));
    const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xfff6d8, size: 0.35, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    motes.userData.dynamic = true;
    scene.add(motes);
    animate((_dt, t) => {
      motes.position.y = Math.sin(t * 0.3) * 0.8;
      motes.position.z = Math.sin(t * 0.17) * 1.2;
    });
  }

  // ---------------------------------------------------------------- bed (-X/-Z corner)
  const woodMat = mats.mat(0xf2c38c);
  const white = mats.mat(C.white);
  {
    const x0 = -RX + 2, x1 = -46, z0 = -RZ + 3, z1 = -48;
    const cx = (x0 + x1) / 2, w = x1 - x0, len = z1 - z0;
    const blanket = matte(0xffffff, starFabricTexture('#3f6fd8', '#ffffff'));
    for (const [lx, lz] of [[x0 + 2, z0 + 2], [x1 - 2, z0 + 2], [x0 + 2, z1 - 2], [x1 - 2, z1 - 2]]) put(bevelBox(3, 7, 3, 0.5), woodMat, lx, 3.5, lz);
    put(bevelBox(w, 4, len, 0.8), woodMat, cx, 7, (z0 + z1) / 2);
    put(bevelBox(w - 1.5, 5.5, len - 1.5, 2), white, cx, 11.5, (z0 + z1) / 2);
    // blanket: top + drapes
    const bz0 = z0 + 16;
    put(bevelBox(w + 0.6, 1.6, z1 - bz0 + 0.8, 0.7), blanket, cx, 14.6, (bz0 + z1) / 2 + 0.4);
    put(bevelBox(1.0, 8, z1 - bz0 + 0.8, 0.4), blanket, x1 + 0.2, 10.8, (bz0 + z1) / 2 + 0.4);
    put(bevelBox(w + 0.6, 8, 1.0, 0.4), blanket, cx, 10.8, z1 + 0.6);
    // folded top edge of the blanket
    put(bevelBox(w + 0.8, 2.2, 4, 1.0), matte(0xfff6e8), cx, 15.4, bz0 + 1.5);
    // pillow
    put(bevelBox(w - 8, 4, 9, 1.9), matte(0xfff1c9), cx, 16, z0 + 7.5);
    // headboard + footboard with rounded tops
    put(bevelBox(w, 24, 2.4, 0.8), woodMat, cx, 12, z0 - 1);
    const arc = new THREE.CylinderGeometry(w / 2, w / 2, 2.4, 40, 1, false, -Math.PI / 2, Math.PI);
    arc.rotateX(Math.PI / 2);
    put(arc, woodMat, cx, 24, z0 - 1, 0, 0, 0, 1, 0.35, 1);
    put(bevelBox(w, 15, 2.2, 0.8), woodMat, cx, 7.5, z1 + 1.8);
    // stars on the headboard
    const starShape = starGeo(2.4, 1.1);
    for (let i = 0; i < 3; i++) put(starShape, mats.mat(C.yellow), cx + (i - 1) * 8, 22 + (i === 1 ? 5 : 0), z0 + 0.3);
    // plush bunny on the bed
    const bunny = matte(0xfbe3ef);
    put(new THREE.SphereGeometry(3.2, 16, 12), bunny, cx + 4, 18.4, z1 - 10);
    put(new THREE.SphereGeometry(2.4, 16, 12), bunny, cx + 4, 22.6, z1 - 10);
    for (const s of [-1, 1]) put(new THREE.CapsuleGeometry(0.7, 3.2, 4, 10), bunny, cx + 4 + s * 1.1, 26, z1 - 10, 0, 0, s * 0.25);
    put(new THREE.SphereGeometry(0.35, 8, 6), mats.mat(C.navy), cx + 5.9, 23.2, z1 - 10.9);
    put(new THREE.SphereGeometry(0.35, 8, 6), mats.mat(C.navy), cx + 5.9, 23.2, z1 - 9.1);
  }

  // ---------------------------------------------------------------- nightstand + lamp
  {
    const nx = -37, nz = -RZ + 8;
    put(bevelBox(14, 16, 12, 0.8), white, nx, 8, nz);
    for (const y of [5, 11]) {
      put(bevelBox(12, 0.3, 0.3, 0.1), mats.mat(0xf0e2cc), nx, y + 2.6, nz + 6.05);
      put(new THREE.SphereGeometry(0.7, 10, 8), mats.mat(C.gold), nx, y, nz + 6.2);
    }
    put(new THREE.SphereGeometry(2.8, 20, 14), mats.mat(C.sky), nx, 18.2, nz);
    put(new THREE.CylinderGeometry(0.45, 0.45, 8, 10), mats.mat(C.gold), nx, 24, nz);
    const shade = new THREE.CylinderGeometry(3.4, 5.6, 7, 28, 1, true);
    put(shade, matte(0xfff0c8, null, { side: THREE.DoubleSide, emissive: 0x6a5530 }), nx, 30.5, nz);
    put(new THREE.SphereGeometry(1.6, 12, 10), mats.glow(0xfff2cc, 1.4), nx, 28.5, nz);
    // books + alarm clock on the nightstand
    put(bevelBox(8, 1.4, 6, 0.3), mats.mat(C.red), nx - 1, 16.7, nz + 1);
    put(bevelBox(7, 1.2, 5.4, 0.3), mats.mat(C.green), nx - 1.4, 18, nz + 1.3, 0.2);
  }

  // ---------------------------------------------------------------- teddy bear under the window
  teddy(b, mats, matte, -57, 0, 4, Math.PI / 2 - 0.25);

  // ---------------------------------------------------------------- bookshelf (+X wall, -Z end)
  {
    const x0 = RX - 17, x1 = RX, z0 = -RZ + 6, z1 = -52;
    const sw = 1.8;
    const shelfMat = mats.mat(0xfff0dc);
    const cz = (z0 + z1) / 2, L = z1 - z0;
    const H = 58;
    put(bevelBox(x1 - x0, H, sw, 0.4), shelfMat, (x0 + x1) / 2, H / 2, z0 + sw / 2);
    put(bevelBox(x1 - x0, H, sw, 0.4), shelfMat, (x0 + x1) / 2, H / 2, z1 - sw / 2);
    put(bevelBox(1, H, L, 0.2), mats.mat(0xbfe3ff), x1 - 0.5, H / 2, cz);
    const spines = bookSpinesTexture();
    const bookMat = mats.mat(0xffffff, { map: spines });
    const levels = [0, 14.5, 29, 43.5];
    levels.forEach((y, li) => {
      put(bevelBox(x1 - x0, 1.6, L, 0.3), shelfMat, (x0 + x1) / 2, y + 0.8, cz);
      // books: a spine strip facing -X plus a coloured block behind
      const segs = li === 1 ? [[z0 + 2, cz - 4], [cz + 8, z1 - 2]] : li === 2 ? [[z0 + 2, cz + 6]] : [[z0 + 2, z1 - 2]];
      for (const [a, c] of segs) {
        const len = c - a;
        const bh = 10.5;
        const face = new THREE.PlaneGeometry(len, bh);
        const uv = face.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 12 + li * 0.37, uv.getY(i));
        put(face, bookMat, x0 + 1.2, y + 1.6 + bh / 2, (a + c) / 2, -Math.PI / 2);
        put(bevelBox(x1 - x0 - 3, bh - 0.8, len, 0.2), mats.mat(0x6b4a2e), (x0 + x1) / 2 + 0.6, y + 1.6 + (bh - 0.8) / 2, (a + c) / 2);
      }
    });
    put(bevelBox(x1 - x0, 1.6, L, 0.3), shelfMat, (x0 + x1) / 2, H - 0.8, cz);
    // toys on shelves
    put(new THREE.SphereGeometry(4.2, 20, 14), mats.mat(C.red), x0 + 6, 14.5 + 1.6 + 4.2, cz + 2);
    for (let i = 0; i < 3; i++) k.block(x0 + 6, 29 + 1.6 + i * 3.4, z1 - 8 - (i % 2) * 0.6, 3.4, [i + 3, i + 4, 9 + i, 21, i, i + 1], i * 0.3);
    // little toy robot on top
    const rx = x0 + 7, rz = cz - 6;
    put(bevelBox(5, 6, 4, 0.6), mats.mat(C.sky), rx, H + 3, rz);
    put(bevelBox(4, 3.6, 3.6, 0.6), mats.mat(0xd8e4f0), rx, H + 7.8, rz);
    for (const s of [-1, 1]) put(new THREE.SphereGeometry(0.6, 10, 8), mats.glow(0x9ff5ff, 1.2), rx - 1.8, H + 8.1, rz + s * 0.9);
    put(new THREE.CylinderGeometry(0.15, 0.15, 2, 6), mats.mat(C.navy), rx, H + 10.5, rz);
    put(new THREE.SphereGeometry(0.5, 10, 8), mats.mat(C.red), rx, H + 11.6, rz);
    // potted plant
    put(new THREE.CylinderGeometry(2.6, 2, 4, 16), mats.mat(C.orange), x0 + 6, 43.5 + 1.6 + 2, cz + 12);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      put(new THREE.SphereGeometry(1.8, 12, 8), mats.mat(C.green), x0 + 6 + Math.cos(a) * 1.4, 43.5 + 8.2 + (i % 2) * 1.2, cz + 12 + Math.sin(a) * 1.4, 0, 0, 0, 1, 1.4, 1);
    }
  }

  // ---------------------------------------------------------------- crayon cup (floor, near the bookshelf)
  {
    const cx = 47, cz = -70;
    const cup = new THREE.CylinderGeometry(6, 5.4, 12, 32, 1, true);
    put(cup, mats.mat(C.blue, { side: THREE.DoubleSide }), cx, 6, cz);
    put(new THREE.CylinderGeometry(5.4, 5.4, 0.4, 32), mats.mat(C.blue), cx, 0.2, cz);
    put(new THREE.TorusGeometry(6, 0.45, 10, 40).rotateX(Math.PI / 2), mats.mat(C.sky), cx, 12, cz);
    // stars on the cup facing the arena
    const sg = starGeo(2.6, 1.2);
    for (const a of [-0.6, 0.35, 1.3, 2.4]) {
      const ang = Math.PI + a;
      put(sg, mats.mat(C.yellow), cx + Math.cos(ang) * 5.95, 6.5 + (a > 1 ? -1 : 1), cz - Math.sin(ang) * 5.95, ang - Math.PI / 2 + Math.PI, 0, 0);
    }
    const cols = [C.red, C.yellow, C.green, C.purple, C.orange, C.blue, C.pink, 0x2fb8a0];
    cols.forEach((col, i) => {
      const a = (i / cols.length) * Math.PI * 2;
      const G = new THREE.Group();
      const r = 0.95, len = 19 + (i % 3) * 1.5;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len - 2.5, 16), mats.mat(col));
      body.position.y = (len - 2.5) / 2;
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, len * 0.5, 16), mats.mat(col));
      wrap.position.y = len * 0.35;
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.25, r, 2.5, 16), mats.mat(col));
      tip.position.y = len - 1.25;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.08, 0.25, 16), mats.mat(C.navy));
      band.position.y = len * 0.55;
      G.add(body, wrap, tip, band);
      G.position.set(cx + Math.cos(a) * 3, 0.5, cz + Math.sin(a) * 3);
      G.rotation.set(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22);
      b.addMesh(G);
    });
    crayon(k, cx - 12, cz + 10, 'x', 18, C.green, -1, 0.95);
    crayon(k, cx - 6, cz + 16, 'z', 18, C.orange, 1, 0.95);
  }

  // ---------------------------------------------------------------- posters
  const poster = (rect: readonly [number, number, number, number], w: number, x: number, y: number, z: number, ry: number) => {
    const ar = (rect[3] - rect[1]) / (rect[2] - rect[0]);
    const g = atlasRectUV(new THREE.PlaneGeometry(w, w * ar), rect);
    put(g, posterMat, x, y, z, ry);
    // tape corners
    return w * ar;
  };
  poster(POSTER.dream, 24, 10, 44, -RZ + 0.15, 0);
  poster(POSTER.kind, 22, -36, 52, -RZ + 0.15, 0);
  poster(POSTER.stars, 22, -12, 44, RZ - 0.15, Math.PI);
  poster(POSTER.kind, 20, RX - 0.15, 50, 26, -Math.PI / 2);

  // ---------------------------------------------------------------- door (+Z wall)
  {
    const dx = 40, dw = 26, dh = 60;
    put(bevelBox(dw + 4, dh + 2, 1.2, 0.4), trim, dx, (dh + 2) / 2, RZ - 0.5);
    put(bevelBox(dw, dh, 1.6, 0.4), matte(0xfff3df, null, { rough: 0.6 }), dx, dh / 2, RZ - 0.9);
    for (const [py, ph] of [[14, 20], [42, 26]] as const)
      for (const px of [-6, 6]) put(bevelBox(9, ph, 0.6, 0.4), matte(0xf8e8cf, null, { rough: 0.6 }), dx + px, py, RZ - 1.8);
    put(new THREE.SphereGeometry(1.4, 14, 10), mats.mat(C.gold), dx - dw / 2 + 3, 28, RZ - 2.6);
  }

  // ---------------------------------------------------------------- desk with lamp & globe (+X wall, +Z end)
  {
    const dx0 = RX - 18, dz = 40, dl = 40;
    const deskMat = mats.mat(0xfff0dc);
    put(bevelBox(18, 2, dl, 0.5), deskMat, dx0 + 9, 22, dz);
    for (const s of [-1, 1]) put(bevelBox(16, 21, 2, 0.4), deskMat, dx0 + 9, 10.5, dz + s * (dl / 2 - 1));
    put(bevelBox(1, 12, dl - 4, 0.3), mats.mat(C.sky), dx0 + 17, 16, dz);
    // globe
    put(new THREE.CylinderGeometry(2.2, 3, 1.2, 16), mats.mat(C.navy), dx0 + 8, 23.6, dz - 10);
    put(new THREE.CylinderGeometry(0.3, 0.3, 4, 8), mats.mat(C.gold), dx0 + 8, 25.5, dz - 10);
    put(new THREE.SphereGeometry(4.6, 24, 16), mats.mat(0x5bb8ff), dx0 + 8, 30.5, dz - 10);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      put(new THREE.SphereGeometry(1.6 + (i % 2), 10, 8), mats.mat(C.green), dx0 + 8 + Math.cos(a) * 3.9, 30.5 + Math.sin(i * 2.1) * 2.2, dz - 10 + Math.sin(a) * 3.9, 0, 0, 0, 1, 0.6, 1);
    }
    // desk lamp
    put(new THREE.CylinderGeometry(2.6, 3, 0.8, 18), mats.mat(C.red), dx0 + 9, 23.4, dz + 10);
    put(new THREE.CylinderGeometry(0.35, 0.35, 10, 8), mats.mat(C.red), dx0 + 9, 28.5, dz + 10, 0, 0, 0.35);
    put(new THREE.ConeGeometry(3.2, 4, 20, 1, true), mats.mat(C.red, { side: THREE.DoubleSide }), dx0 + 6.2, 34, dz + 10, 0, 0, 0.9);
    put(new THREE.SphereGeometry(1.1, 10, 8), mats.glow(0xfff2cc, 1.3), dx0 + 5.4, 33, dz + 10);
    // pencil pot
    put(new THREE.CylinderGeometry(2, 2, 5, 14), mats.mat(C.yellow), dx0 + 8, 25.5, dz + 1);
  }

  // ---------------------------------------------------------------- floor toys around the rug
  {
    // beach ball
    const bx = 56, bz = 80, r = 8;
    const cols = [C.red, C.white, C.blue, C.white, C.yellow, C.white];
    cols.forEach((col, i) => {
      const g = new THREE.SphereGeometry(r, 8, 16, (i / 6) * Math.PI * 2, Math.PI / 3);
      put(g, mats.mat(col), bx, r, bz, 0, 0.35, 0.2);
    });
    // stacked picture books on the floor (-X, +Z)
    const books: [number, number, number, number][] = [[C.green, 20, 14, 0], [C.orange, 18, 13, 0.15], [C.purple, 19, 12, -0.1], [C.sky, 16, 11, 0.25]];
    books.forEach(([col, w, d, rot], i) => {
      put(bevelBox(w, 2.2, d, 0.5), mats.mat(col), -56, 1.1 + i * 2.2, 72, rot);
      put(bevelBox(w - 0.8, 1.8, d - 0.2, 0.2), mats.mat(0xfff8ea), -56 + 0.5, 1.1 + i * 2.2, 72, rot);
    });
    // spinning top (one vertex-coloured mesh, animated)
    {
      const parts: [THREE.BufferGeometry, number][] = [];
      const cone = new THREE.ConeGeometry(4, 5, 24);
      cone.rotateX(Math.PI);
      cone.translate(0, 2.6, 0);
      parts.push([cone, C.pink]);
      const band = new THREE.CylinderGeometry(4, 4, 1.4, 24);
      band.translate(0, 5.8, 0);
      parts.push([band, C.purple]);
      const cap = new THREE.CylinderGeometry(3.2, 4, 0.9, 24);
      cap.translate(0, 6.9, 0);
      parts.push([cap, C.sky]);
      const stick = new THREE.CylinderGeometry(0.4, 0.4, 4, 8);
      stick.translate(0, 8.8, 0);
      parts.push([stick, C.yellow]);
      const geos = parts.map(([g, col]) => {
        const ng = g.toNonIndexed();
        const n = ng.getAttribute('position').count;
        const c = new THREE.Color(col);
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
        ng.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
        return ng;
      });
      const merged = mergeGeometries(geos, false)!;
      const top = new THREE.Mesh(merged, mats.mat(0xffffff, { vertexColors: true }));
      top.position.set(60, 0, -18);
      top.userData.dynamic = true;
      scene.add(top);
      animate((dt, t) => {
        top.rotation.y += dt * 3.2;
        top.rotation.z = Math.sin(t * 1.3) * 0.06;
        top.rotation.x = Math.cos(t * 1.3) * 0.06;
      });
    }
    // xylophone near the -X/+Z corner
    const xc = [C.red, C.orange, C.yellow, C.green, C.sky, C.blue, C.purple];
    put(bevelBox(20, 1.6, 2, 0.4), mats.mat(0x2fb8a0), -40, 1.6, 90);
    put(bevelBox(20, 1.6, 2, 0.4), mats.mat(0x2fb8a0), -40, 1.6, 98);
    xc.forEach((col, i) => put(bevelBox(2.2, 0.8, 9 + (6 - i) * 0.6, 0.3), mats.mat(col), -48 + i * 2.7, 2.8, 94));
  }

  // ---------------------------------------------------------------- ceiling glow stars + lamp
  {
    const sr = mulberry(99);
    // everything on the ceiling faces down only, so the top-down overview stays clear
    const sg = flatStar(1.6);
    sg.rotateX(Math.PI / 2);
    const glow = mats.glow(0xfff4b8, 1.1);
    for (let i = 0; i < 40; i++) put(sg, glow, (sr() - 0.5) * RX * 1.8, RH - 0.2, (sr() - 0.5) * RZ * 1.8, sr() * 6);
    const disc = new THREE.CircleGeometry(9.5, 32);
    disc.rotateX(Math.PI / 2);
    put(disc, mats.glow(0xfff6e0, 1.2), 0, RH - 1.2, 0);
    const ring = new THREE.RingGeometry(9.5, 11, 32);
    ring.rotateX(Math.PI / 2);
    put(ring, trim, 0, RH - 1.25, 0);
  }

  // clock on the -Z wall
  {
    const cx = -8, cy = 64, z = -RZ + 0.6;
    const face = new THREE.CylinderGeometry(6, 6, 1, 32);
    face.rotateX(Math.PI / 2);
    put(face, mats.mat(0xfffaf0), cx, cy, z + 0.2);
    const rim = new THREE.TorusGeometry(6, 0.8, 10, 36);
    put(rim, mats.mat(C.red), cx, cy, z + 0.6);
    put(bevelBox(0.5, 4, 0.3, 0.1), mats.mat(C.navy), cx, cy + 1.6, z + 0.9);
    put(bevelBox(3, 0.5, 0.3, 0.1), mats.mat(C.navy), cx + 1.3, cy, z + 0.9);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      put(new THREE.SphereGeometry(0.35, 6, 4), mats.mat(C.navy), cx + Math.cos(a) * 4.8, cy + Math.sin(a) * 4.8, z + 0.8);
    }
  }
}

function mergeGroup(g: THREE.Group) {
  const geos: THREE.BufferGeometry[] = [];
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const gg = m.geometry.clone();
    gg.applyMatrix4(m.matrixWorld);
    geos.push(gg.index ? gg.toNonIndexed() : gg);
  });
  const out = new THREE.BufferGeometry();
  let n = 0;
  geos.forEach((x) => (n += x.getAttribute('position').count));
  const pos = new Float32Array(n * 3);
  let o = 0;
  geos.forEach((x) => {
    pos.set(x.getAttribute('position').array as Float32Array, o);
    o += x.getAttribute('position').count * 3;
  });
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return out;
}

/** Flat (single-sided) star facing +Z. */
function flatStar(r: number, inner = 0.45) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new THREE.ShapeGeometry(s);
}

/** Flat star (extruded slightly) facing +Z. */
export function starGeo(r: number, depth = 0.3, inner = 0.45) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: depth * 0.4, bevelThickness: depth * 0.4, bevelSegments: 1 });
  return g;
}

/** Giant sitting teddy bear (background landmark). Faces local +Z, rotated by ry. */
function teddy(b: Kit['batch'], mats: MaterialKit, matte: Matte, x: number, y: number, z: number, ry: number) {
  const fur = matte(0xffffff, furTexture('#c98b55'));
  const light = matte(0xffffff, furTexture('#f0c894'));
  const dark = mats.mat(0x3b2418);
  const bow = mats.mat(0xff4b5c);
  const G = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, s: V3 = [1, 1, 1], r: V3 = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.scale.set(...s);
    m.rotation.set(...r);
    G.add(m);
  };
  const sph = (r: number) => new THREE.SphereGeometry(r, 24, 18);
  add(sph(6.8), fur, 0, 7.2, 0, [1, 1.12, 0.95]);
  add(sph(4.6), light, 0, 6.6, 3.4, [1, 1.05, 0.55]);
  add(sph(5.4), fur, 0, 17.4, 0.4);
  add(sph(2.3), light, 0, 16.0, 4.9, [1.15, 0.85, 0.8]);
  add(sph(0.85), dark, 0, 16.9, 6.7, [1.35, 0.9, 0.8]);
  add(new THREE.TorusGeometry(0.9, 0.18, 6, 12, Math.PI), dark, 0, 15.2, 6.55, [1, 1, 1], [0, 0, Math.PI]);
  for (const s of [-1, 1]) {
    add(sph(0.62), dark, s * 1.9, 18.6, 4.6);
    add(sph(0.2), mats.mat(0xffffff), s * 1.9 + 0.2, 18.85, 5.15);
    add(sph(2.1), fur, s * 4.0, 21.4, -0.3, [1, 1, 0.6]);
    add(sph(1.25), light, s * 4.0, 21.3, 0.5, [1, 1, 0.4]);
    // arms
    add(new THREE.CapsuleGeometry(1.9, 5.2, 6, 14), fur, s * 6.3, 8.8, 1.8, [1, 1, 1], [0.5, 0, s * 0.55]);
    // legs (sitting, pointing forward)
    add(new THREE.CapsuleGeometry(2.4, 4.2, 6, 14), fur, s * 3.6, 2.5, 4.4, [1, 1, 1], [Math.PI / 2 - 0.1, 0, 0]);
    add(sph(2.0), light, s * 3.6, 2.6, 7.6, [1, 1, 0.35]);
    // bow loops
    add(sph(1.5), bow, s * 2.1, 12.4, 4.3, [1.4, 1, 0.55], [0, 0, s * 0.3]);
  }
  add(sph(0.95), bow, 0, 12.4, 4.7);
  G.position.set(x, y, z);
  G.rotation.y = ry;
  G.scale.setScalar(1.35);
  b.addMesh(G);
}

type V3 = [number, number, number];
