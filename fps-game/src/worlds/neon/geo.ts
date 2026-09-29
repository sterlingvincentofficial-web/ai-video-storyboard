import * as THREE from 'three';
import type { Batcher } from '../../render/Batcher';
import { rampHeight, type RampDef } from '../../world/Level';
import type { Atlas } from './textures';

/** Geometry helpers for the neon world (custom UVs in world units). */

function geoFrom(pos: number[], uv: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Horizontal quad facing +y, UVs = world xz / tile. */
export function topQuad(x0: number, z0: number, x1: number, z1: number, y: number, tile: number, y2?: [number, number, number, number]) {
  // corners: (x0,z1) (x1,z1) (x1,z0) (x0,z0)
  const ys = y2 ?? [y, y, y, y];
  const p = [
    [x0, ys[0], z1], [x1, ys[1], z1], [x1, ys[2], z0], [x0, ys[3], z0],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  for (const i of [0, 1, 2, 0, 2, 3]) {
    pos.push(p[i][0], p[i][1], p[i][2]);
    uv.push(p[i][0] / tile, -p[i][2] / tile);
  }
  return geoFrom(pos, uv);
}

/**
 * Vertical quad from A to B (xz), bottom yb, tops ya/yb2 at A/B. Outward normal = (-dz, 0, dx).
 * u = distance along the wall (+offset) / tile, v = 1 + (y - vTop) / tile (texture top = vTop).
 */
export function wallQuad(ax: number, az: number, bx: number, bz: number, yb: number, ytA: number, ytB: number, tile: number, vTop: number, uOff = 0) {
  const len = Math.hypot(bx - ax, bz - az);
  const pos = [
    ax, yb, az, bx, yb, bz, bx, ytB, bz,
    ax, yb, az, bx, ytB, bz, ax, ytA, az,
  ];
  const u0 = uOff / tile, u1 = (uOff + len) / tile;
  const v = (y: number) => 1 + (y - vTop) / tile;
  const uv = [
    u0, v(yb), u1, v(yb), u1, v(ytB),
    u0, v(yb), u1, v(ytB), u0, v(ytA),
  ];
  return geoFrom(pos, uv);
}

/** The four outward walls of an axis-aligned box footprint. */
export function boxWalls(x0: number, z0: number, x1: number, z1: number, yb: number, yt: number, tile: number, vTop = yt, skip: ('px' | 'nx' | 'pz' | 'nz')[] = []) {
  const out: THREE.BufferGeometry[] = [];
  if (!skip.includes('pz')) out.push(wallQuad(x0, z1, x1, z1, yb, yt, yt, tile, vTop, x0));
  if (!skip.includes('px')) out.push(wallQuad(x1, z1, x1, z0, yb, yt, yt, tile, vTop, -z1));
  if (!skip.includes('nz')) out.push(wallQuad(x1, z0, x0, z0, yb, yt, yt, tile, vTop, -x1));
  if (!skip.includes('nx')) out.push(wallQuad(x0, z0, x0, z1, yb, yt, yt, tile, vTop, z0));
  return out;
}

/** Ramp wedge pieces: sloped top and the four side walls. */
export function rampPieces(r: RampDef, tile: number) {
  const x0 = r.min[0], x1 = r.max[0], z0 = r.min[2], z1 = r.max[2], yb = r.min[1];
  const h = (x: number, z: number) => rampHeight(r, x, z);
  const top = topQuad(x0, z0, x1, z1, 0, tile, [h(x0, z1), h(x1, z1), h(x1, z0), h(x0, z0)]);
  const sides = [
    wallQuad(x0, z1, x1, z1, yb, h(x0, z1), h(x1, z1), tile, 0, x0),
    wallQuad(x1, z1, x1, z0, yb, h(x1, z1), h(x1, z0), tile, 0, -z1),
    wallQuad(x1, z0, x0, z0, yb, h(x1, z0), h(x0, z0), tile, 0, -x1),
    wallQuad(x0, z0, x0, z1, yb, h(x0, z0), h(x0, z1), tile, 0, z0),
  ];
  return { top, sides };
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);
const tubeCache = new Map<string, THREE.BufferGeometry>();

/** Cylinder between two points. */
export function tube(batch: Batcher, mat: THREE.Material, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, sides = 6) {
  _d.set(bx - ax, by - ay, bz - az);
  const len = _d.length();
  if (len < 1e-4) return;
  const key = `${r}|${sides}`;
  let g = tubeCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(r, r, 1, sides, 1, false);
    tubeCache.set(key, g);
  }
  _q.setFromUnitVectors(_up, _d.normalize());
  _m.compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(1, len, 1));
  batch.add(g, mat, _m);
}

/** Plane showing one atlas slot, facing +z. */
export function atlasPlane(atlas: Atlas, slot: string, w: number, h: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const [u0, v0, u1, v1] = atlas.uv(slot);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

export type Face = 'px' | 'nx' | 'pz' | 'nz';
export const FACE_N: Record<Face, [number, number]> = { px: [1, 0], nx: [-1, 0], pz: [0, 1], nz: [0, -1] };
export const flipFace = (f: Face): Face => ({ px: 'nx', nx: 'px', pz: 'nz', nz: 'pz' } as const)[f];

/** Matrix placing a +z-facing plane at (x,y,z) facing direction n (xz). */
export function faceMatrix(x: number, y: number, z: number, nx: number, nz: number, out = new THREE.Matrix4()) {
  return out.makeRotationY(Math.atan2(nx, nz)).setPosition(x, y, z);
}
