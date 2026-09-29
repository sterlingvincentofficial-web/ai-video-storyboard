import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialKit } from '../../render/Materials';
import type { Batcher } from '../../render/Batcher';
import { mulberry } from '../../core/utils';
import { cellUV } from './textures';

export type V3 = [number, number, number];

/** Toy palette (glossy vinyl / plastic). */
export const C = {
  blue: 0x3a86ff,
  red: 0xff4b5c,
  yellow: 0xffd23f,
  green: 0x5ccf6b,
  orange: 0xff9f43,
  sky: 0x72c8ff,
  pink: 0xff8fb8,
  purple: 0xa98bff,
  white: 0xfff6e8,
  navy: 0x27305a,
  wood: 0xe9b97f,
  gold: 0xffc933,
  glass: 0x9fe0ff,
};

// ---------------------------------------------------------------------------------------------
// Geometry helpers

const bevelCache = new Map<string, THREE.BufferGeometry>();
/**
 * Box with rounded (bevelled) edges and smooth normals: crisp flat faces with glossy
 * rounded rims. UVs are 0..1 per face (BoxGeometry orientation), so atlas cells map cleanly.
 */
export function bevelBox(w: number, h: number, d: number, r = 0.08): THREE.BufferGeometry {
  r = Math.min(r, w * 0.45, h * 0.45, d * 0.45);
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
  const hit = bevelCache.get(key);
  if (hit) return hit;
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const remap = (v: number, half: number, inner: number) => (Math.abs(v) < half * 0.5 ? Math.sign(v) * inner : v);
  const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn.fromBufferAttribute(nor, i);
    v.set(remap(v.x, w / 2, hw), remap(v.y, h / 2, hh), remap(v.z, d / 2, hd));
    c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    n.subVectors(v, c);
    if (n.lengthSq() > 1e-10) {
      n.normalize();
      v.copy(c).addScaledVector(n, r);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
    // face UV from position (0..1 across the face, BoxGeometry orientation)
    let uu: number, vv: number;
    if (Math.abs(fn.x) > 0.5) { uu = fn.x > 0 ? (-v.z + d / 2) / d : (v.z + d / 2) / d; vv = (v.y + h / 2) / h; }
    else if (Math.abs(fn.y) > 0.5) { uu = (v.x + w / 2) / w; vv = fn.y > 0 ? (-v.z + d / 2) / d : (v.z + d / 2) / d; }
    else { uu = fn.z > 0 ? (v.x + w / 2) / w : (-v.x + w / 2) / w; vv = (v.y + h / 2) / h; }
    uv.setXY(i, Math.max(0, Math.min(1, uu)), Math.max(0, Math.min(1, vv)));
  }
  bevelCache.set(key, g);
  return g;
}

const chamCache = new Map<string, THREE.BufferGeometry>();
/**
 * Cheap chamfered box (44 tris) with smooth normals across the chamfers, so edges read as
 * rounded glossy plastic. Used for the hundreds of bricks.
 */
export function chamferBox(w: number, h: number, d: number, r = 0.1): THREE.BufferGeometry {
  r = Math.min(r, w * 0.45, h * 0.45, d * 0.45);
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
  const hit = chamCache.get(key);
  if (hit) return hit;
  const iw = w / 2 - r, ih = h / 2 - r, id = d / 2 - r;
  const pos: number[] = [], nor: number[] = [];
  const P = (n: number[], sx: number, sy: number, sz: number) => [sx * iw + n[0] * r, sy * ih + n[1] * r, sz * id + n[2] * r];
  const tri = (a: number[], na: number[], b: number[], nb: number[], c: number[], nc: number[]) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const ce = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
    if (cr[0] * ce[0] + cr[1] * ce[1] + cr[2] * ce[2] < 0) { [b, c] = [c, b]; [nb, nc] = [nc, nb]; }
    pos.push(...a, ...b, ...c);
    nor.push(...na, ...nb, ...nc);
  };
  const quad = (a: number[], na: number[], b: number[], nb: number[], c: number[], nc: number[], dd: number[], nd: number[]) => {
    tri(a, na, b, nb, c, nc);
    tri(a, na, c, nc, dd, nd);
  };
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const ns: number[][] = [];
  for (const a of axes) { ns.push(a); ns.push(a.map((v) => -v)); }
  // faces
  for (const n of ns) {
    const ai = n.findIndex((v) => v !== 0);
    const o = [0, 1, 2].filter((i) => i !== ai);
    const corner = (s1: number, s2: number) => {
      const sg = [0, 0, 0];
      sg[ai] = n[ai]; sg[o[0]] = s1; sg[o[1]] = s2;
      return P(n, sg[0], sg[1], sg[2]);
    };
    quad(corner(-1, -1), n, corner(1, -1), n, corner(1, 1), n, corner(-1, 1), n);
  }
  // edges
  for (let i = 0; i < 6; i++)
    for (let j = i + 1; j < 6; j++) {
      const n1 = ns[i], n2 = ns[j];
      const a1 = n1.findIndex((v) => v !== 0), a2 = n2.findIndex((v) => v !== 0);
      if (a1 === a2) continue;
      const e = 3 - a1 - a2;
      const pt = (n: number[], s: number) => {
        const sg = [0, 0, 0];
        sg[a1] = n1[a1]; sg[a2] = n2[a2]; sg[e] = s;
        return P(n, sg[0], sg[1], sg[2]);
      };
      quad(pt(n1, -1), n1, pt(n1, 1), n1, pt(n2, 1), n2, pt(n2, -1), n2);
    }
  // corners
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const nx = [sx, 0, 0], ny = [0, sy, 0], nz = [0, 0, sz];
    tri(P(nx, sx, sy, sz), nx, P(ny, sx, sy, sz), ny, P(nz, sx, sy, sz), nz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  chamCache.set(key, g);
  return g;
}

/**
 * Atlas-mapped bevel box: faces = cell indices for [+x, -x, +y, -y, +z, -z].
 */
export function atlasBox(w: number, h: number, d: number, faces: number[], r = 0.1) {
  const base = bevelBox(w, h, d, r);
  const g = base.clone();
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const idx = g.index!;
  for (let f = 0; f < 6; f++) {
    const grp = g.groups[f];
    const [u0, v0, u1, v1] = cellUV(faces[f]);
    const seen = new Set<number>();
    for (let k = grp.start; k < grp.start + grp.count; k++) {
      const vi = idx.getX(k);
      if (seen.has(vi)) continue;
      seen.add(vi);
      uv.setXY(vi, u0 + uv.getX(vi) * (u1 - u0), v0 + uv.getY(vi) * (v1 - v0));
    }
  }
  return g;
}

const studCache = new Map<string, THREE.BufferGeometry>();
/** Grid of studs centred on the origin (base at y=0). */
export function studGrid(nx: number, nz: number, pitch = 1.6, r = 0.44, h = 0.2) {
  const key = `${nx}|${nz}|${pitch}|${r}|${h}`;
  const hit = studCache.get(key);
  if (hit) return hit;
  const one = new THREE.CylinderGeometry(r, r, h, 10, 1, true);
  one.translate(0, h / 2, 0);
  const cap = new THREE.CircleGeometry(r, 10);
  cap.rotateX(-Math.PI / 2);
  cap.translate(0, h, 0);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      for (const src of [one, cap]) {
        const g = src.clone().toNonIndexed();
        g.translate((i - (nx - 1) / 2) * pitch, 0, (j - (nz - 1) / 2) * pitch);
        parts.push(g);
      }
    }
  const m = mergeGeometries(parts, false)!;
  studCache.set(key, m);
  return m;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
/** Transform matrix (Euler order YXZ). */
export function tr(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Minimal batch interface (engine Batcher or MergeBatch). */
export interface BatchLike {
  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix?: THREE.Matrix4): void;
  addMesh(obj: THREE.Object3D): void;
}

/**
 * Accumulates transformed geometry per material and merges it into ONE geometry per material,
 * so the engine Batcher (which chunks at 400 pieces) emits a single mesh per material.
 */
export class MergeBatch implements BatchLike {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix?: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.morphAttributes = {};
    g.clearGroups();
    if (matrix) g.applyMatrix4(matrix);
    let arr = this.groups.get(mat);
    if (!arr) this.groups.set(mat, (arr = []));
    arr.push(g);
  }
  addMesh(obj: THREE.Object3D) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      this.add(m.geometry, Array.isArray(m.material) ? m.material[0] : m.material, m.matrixWorld);
    });
  }
  static debug = false;
  private merged(): [THREE.Material, THREE.BufferGeometry][] {
    const out: [THREE.Material, THREE.BufferGeometry][] = [];
    if (MergeBatch.debug) {
      const rows: string[] = [];
      let tot = 0;
      this.groups.forEach((geos, mat) => {
        const t = geos.reduce((a, g) => a + g.getAttribute('position').count / 3, 0);
        tot += t;
        rows.push(`${(mat as THREE.MeshStandardMaterial).color?.getHexString()} ${((mat as THREE.MeshStandardMaterial).map ? 'map' : '')} n=${geos.length} tris=${t}`);
      });
      console.log('MB total', tot, '\n' + rows.join('\n'));
    }
    this.groups.forEach((geos, mat) => {
      const m = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (m) out.push([mat, m]);
    });
    this.groups.clear();
    return out;
  }
  /** Hand everything to the engine batcher (one entry per material). */
  flushInto(b: Batcher) {
    for (const [mat, g] of this.merged()) b.add(g, mat);
  }
  /** Create meshes directly (e.g. non-shadow-casting backdrop). */
  flushTo(parent: THREE.Object3D, cast = false, receive = false) {
    for (const [mat, g] of this.merged()) {
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
    }
  }
  get count() {
    let n = 0;
    this.groups.forEach((g) => (n += g.length));
    return n;
  }
}

/** Small toolbox bound to a batch + material kit. */
export class Kit {
  rng = mulberry(1234);
  /** Non-shadow-casting batch for small details (studs, darts, grooves). Defaults to the main batch. */
  detail: BatchLike;
  constructor(public mats: MaterialKit, public batch: BatchLike, public atlas: THREE.Material, detail?: BatchLike) {
    this.detail = detail ?? batch;
  }

  m(color: number) {
    return this.mats.mat(color);
  }

  add(geo: THREE.BufferGeometry, color: number | THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const mat = typeof color === 'number' ? this.m(color) : color;
    this.batch.add(geo, mat, tr(x, y, z, ry, rx, rz, sx, sy, sz));
  }

  /** Bevelled box centred at x,y,z. */
  bbox(color: number | THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, r = 0.08, ry = 0) {
    this.add(bevelBox(w, h, d, r), color, x, y, z, ry);
  }

  /** Alphabet / star / dice block (faces: +x,-x,+y,-y,+z,-z cells). Centre-bottom at x,y,z. */
  block(x: number, y: number, z: number, size: number, faces: number[], ry = 0, h = size, d = size) {
    this.batch.add(atlasBox(size, h, d, faces, Math.min(size, h) * 0.07), this.atlas, tr(x, y + h / 2, z, ry));
  }

  /** Studs on top of a rect (top at y). */
  studs(color: number | THREE.Material, cx: number, y: number, cz: number, sx: number, sz: number, pitch = 1.6) {
    const nx = Math.max(1, Math.round(sx / pitch)), nz = Math.max(1, Math.round(sz / pitch));
    const mat = typeof color === 'number' ? this.m(color) : color;
    this.detail.add(studGrid(nx, nz, Math.min(pitch, sx / nx, sz / nz)), mat, tr(cx, y, cz));
  }

  /** One interlocking brick: min corner + size, with studs on top if requested. */
  brick(color: number, x0: number, y0: number, z0: number, sx: number, sy: number, sz: number, studs: boolean, gap = 0.035) {
    const cx = x0 + sx / 2, cy = y0 + sy / 2, cz = z0 + sz / 2;
    this.add(chamferBox(sx - gap * 2, sy - gap * 2, sz - gap * 2, 0.11), color, cx, cy, cz);
    if (studs) this.studs(color, cx, y0 + sy - gap, cz, sx, sz);
  }

  /**
   * Fill an AABB with a running bond of giant interlocking bricks.
   * Thin boxes are solid brick walls; thick boxes get a brick shell + studded top plate.
   */
  brickFill(min: V3, max: V3, palette: number[], o: { course?: number; studs?: boolean; top?: number; seed?: number; pitch?: number; long?: boolean } = {}) {
    const rng = mulberry(o.seed ?? Math.floor(min[0] * 13 + min[2] * 7 + max[1] * 3 + 999));
    const pick = () => palette[Math.floor(rng() * palette.length)];
    const P = o.pitch ?? 1.6;
    const sx = max[0] - min[0], sy = max[1] - min[1], sz = max[2] - min[2];
    const n = Math.max(1, Math.round(sy / (o.course ?? 1.25)));
    const ch = sy / n;
    const studs = o.studs ?? true;
    const thick = Math.min(sx, sz);
    const alongX = sx >= sz;
    const len = alongX ? sx : sz;
    const runRow = (a0: number, a1: number, y0: number, h: number, t0: number, t1: number, course: number, studTop: boolean, forceColor?: number) => {
      // bricks along the long axis between a0..a1, thickness range t0..t1
      let a = a0;
      let first = true;
      while (a < a1 - 0.05) {
        let bl = P * (o.long ? 2 + Math.floor(rng() * 3) : rng() < 0.5 ? 2 : 3);
        if (first && course % 2 === 1) bl = P * (o.long ? 2 : 1);
        first = false;
        if (a + bl > a1 - P * 0.6) bl = a1 - a;
        const col = forceColor ?? pick();
        if (alongX) this.brick(col, a, y0, t0, bl, h, t1 - t0, studTop);
        else this.brick(col, t0, y0, a, t1 - t0, h, bl, studTop);
        a += bl;
      }
    };
    if (thick <= 4.2) {
      const t0 = alongX ? min[2] : min[0], t1 = alongX ? max[2] : max[0];
      const a0 = alongX ? min[0] : min[2];
      for (let c = 0; c < n; c++) runRow(a0, a0 + len, min[1] + c * ch, ch, t0, t1, c, studs && c === n - 1);
      return;
    }
    // thick: shell of bricks + studded top plate
    const top = o.top ?? pick();
    const skin = 1.0;
    this.bbox(top, (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2, sx - 0.1, sy - 0.04, sz - 0.1, 0.05);
    for (let c = 0; c < n; c++) {
      const y0 = min[1] + c * ch;
      // x-running faces (at min z / max z)
      const saveAlong = alongX;
      const fill = (ax: boolean, a0: number, a1: number, t0: number, t1: number) => {
        let a = a0;
        let first = true;
        while (a < a1 - 0.05) {
          let bl = P * (rng() < 0.5 ? 2 : 3);
          if (first && c % 2 === 1) bl = P;
          first = false;
          if (a + bl > a1 - P * 0.6) bl = a1 - a;
          const col = pick();
          if (ax) this.brick(col, a, y0, t0, bl, ch, t1 - t0, false);
          else this.brick(col, t0, y0, a, t1 - t0, ch, bl, false);
          a += bl;
        }
      };
      void saveAlong;
      fill(true, min[0], max[0], min[2], min[2] + skin);
      fill(true, min[0], max[0], max[2] - skin, max[2]);
      fill(false, min[2] + skin, max[2] - skin, min[0], min[0] + skin);
      fill(false, min[2] + skin, max[2] - skin, max[0] - skin, max[0]);
    }
    if (studs) this.studs(top, (min[0] + max[0]) / 2, max[1] - 0.02, (min[2] + max[2]) / 2, sx - 0.4, sz - 0.4);
  }
}

// ---------------------------------------------------------------------------------------------
// Composite toy props, built in a local frame (+z forward) and baked through a Group.

function g3(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: V3 = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(...s);
  parent.add(m);
  return m;
}

/** Toy steam locomotive. Local frame: length along z (front at -z), base y=0. */
export function locomotive(k: Kit, x: number, z: number, ry: number, body: number, trim: number) {
  const G = new THREE.Group();
  const mb = k.m(body), mt = k.m(trim), mn = k.m(C.navy), mg = k.m(C.gold), my = k.m(C.yellow), mw = k.m(C.white), mgl = k.m(C.glass);
  // chassis
  g3(G, bevelBox(2.3, 0.5, 5.4, 0.1), mn, 0, 0.55, 0);
  // boiler
  const boiler = new THREE.CylinderGeometry(0.95, 0.95, 3.4, 20, 1);
  boiler.rotateX(Math.PI / 2);
  g3(G, boiler, mb, 0, 1.75, -0.9);
  // boiler bands
  const band = new THREE.CylinderGeometry(1.0, 1.0, 0.16, 20, 1);
  band.rotateX(Math.PI / 2);
  for (const bz of [-2.3, -1.2, -0.1, 0.7]) g3(G, band, mg, 0, 1.75, bz);
  // smoke box front face
  const face = new THREE.CylinderGeometry(0.9, 0.9, 0.2, 20, 1);
  face.rotateX(Math.PI / 2);
  g3(G, face, mn, 0, 1.75, -2.65);
  g3(G, new THREE.SphereGeometry(0.22, 10, 8), my, 0, 1.95, -2.8);
  // chimney
  g3(G, new THREE.CylinderGeometry(0.34, 0.26, 1.0, 14), mn, 0, 3.0, -2.0);
  g3(G, new THREE.CylinderGeometry(0.52, 0.34, 0.4, 14), mt, 0, 3.6, -2.0);
  // dome
  g3(G, new THREE.SphereGeometry(0.45, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mg, 0, 2.6, -0.5);
  // cab
  g3(G, bevelBox(2.3, 2.1, 1.9, 0.12), mt, 0, 1.85, 1.75);
  g3(G, bevelBox(2.6, 0.28, 2.3, 0.1), mb, 0, 3.05, 1.75);
  // cab windows
  for (const sx of [-1, 1]) g3(G, bevelBox(0.06, 0.7, 0.9, 0.02), mgl, sx * 1.16, 2.25, 1.7);
  g3(G, bevelBox(1.4, 0.6, 0.06, 0.02), mgl, 0, 2.3, 0.79);
  // wheels
  const wheel = new THREE.CylinderGeometry(0.62, 0.62, 0.3, 18, 1);
  wheel.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.34, 10, 1);
  hub.rotateZ(Math.PI / 2);
  for (const wz of [-1.9, -0.5, 1.4]) for (const sx of [-1, 1]) {
    const r = wz === 1.4 ? 0.62 : 0.72;
    g3(G, wheel, my, sx * 1.12, r, wz, 0, 0, 0, [1, r / 0.62, r / 0.62]);
    g3(G, hub, mn, sx * 1.14, r, wz);
  }
  // connecting rods
  for (const sx of [-1, 1]) g3(G, bevelBox(0.08, 0.14, 1.6, 0.03), mw, sx * 1.3, 0.72, -1.2);
  // cow catcher
  const cc = new THREE.CylinderGeometry(0.01, 1.15, 0.8, 4, 1);
  cc.rotateY(Math.PI / 4);
  cc.rotateX(-Math.PI / 2);
  g3(G, cc, mt, 0, 0.55, -3.0, 0, 0, 0, [1, 0.6, 1]);
  G.position.set(x, 0, z);
  G.rotation.y = ry;
  k.batch.addMesh(G);
}

/** Toy train wagon full of blocks. Local length along z. */
export function wagon(k: Kit, x: number, z: number, ry: number, body: number, len = 4.2) {
  const G = new THREE.Group();
  const mb = k.m(body), mn = k.m(C.navy), my = k.m(C.yellow);
  g3(G, bevelBox(2.3, 0.5, len, 0.1), mn, 0, 0.55, 0);
  // tub walls
  g3(G, bevelBox(2.3, 1.0, len - 0.2, 0.14), mb, 0, 1.3, 0);
  g3(G, bevelBox(2.45, 0.16, len - 0.05, 0.06), k.m(C.white), 0, 1.84, 0);
  const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16, 1);
  wheel.rotateZ(Math.PI / 2);
  for (const wz of [-len / 2 + 0.8, len / 2 - 0.8]) for (const sx of [-1, 1]) g3(G, wheel, my, sx * 1.12, 0.52, wz);
  G.position.set(x, 0, z);
  G.rotation.y = ry;
  k.batch.addMesh(G);
  // cargo: little alphabet blocks & balls sticking out
  const cos = Math.cos(ry), sin = Math.sin(ry);
  const loc = (lx: number, lz: number): [number, number] => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
  const cargo: [number, number, number, number][] = [[-0.5, -1.1, 0.9, 0], [0.45, -0.9, 0.8, 1], [0, 0.3, 0.95, 2], [-0.4, 1.3, 0.8, 3], [0.5, 1.2, 0.7, 4]];
  cargo.forEach(([lx, lz, s, i]) => {
    const [wx, wz] = loc(lx, lz);
    k.block(wx, 1.35, wz, s, [i, i + 1, 9 + (i % 4), 21, i + 2, i + 3], ry + i * 0.4);
  });
  const [bx, bz] = loc(0.1, -0.2);
  k.add(new THREE.SphereGeometry(0.5, 16, 12), C.red, bx, 1.95, bz);
}

/** Crayon lying on the floor along the given axis. */
export function crayon(k: Kit, x: number, z: number, axis: 'x' | 'z', len: number, color: number, dir: 1 | -1 = 1, r = 0.6) {
  const G = new THREE.Group();
  const mc = k.m(color);
  const body = len - 1.5;
  const cyl = new THREE.CylinderGeometry(r, r, body, 18, 1);
  cyl.rotateZ(Math.PI / 2);
  g3(G, cyl, mc, -0.75, 0, 0);
  // paper wrapper (slightly bigger, darker bands)
  const wrap = new THREE.CylinderGeometry(r * 1.04, r * 1.04, body * 0.62, 18, 1);
  wrap.rotateZ(Math.PI / 2);
  g3(G, wrap, mc, -0.75 - body * 0.05, 0, 0);
  const ring = new THREE.CylinderGeometry(r * 1.07, r * 1.07, 0.14, 18, 1);
  ring.rotateZ(Math.PI / 2);
  for (const rx of [-body * 0.3, body * 0.2]) g3(G, ring, k.m(C.navy), rx - 0.75, 0, 0);
  // tip
  const tip = new THREE.CylinderGeometry(0.18, r, 1.5, 18, 1);
  tip.rotateZ(-Math.PI / 2);
  g3(G, tip, mc, len / 2 - 0.75, 0, 0);
  G.position.set(x, r, z);
  G.rotation.y = (axis === 'x' ? 0 : -Math.PI / 2) + (dir === 1 ? 0 : Math.PI);
  k.batch.addMesh(G);
}

/** Toy car (local length along z, front at -z). */
export function toyCar(k: Kit, x: number, z: number, ry: number, body: number, w = 2.7, len = 4.8) {
  const G = new THREE.Group();
  const mb = k.m(body), mn = k.m(C.navy), mw = k.m(C.white), mgl = k.m(C.glass), my = k.m(C.yellow);
  g3(G, bevelBox(w, 0.9, len, 0.35), mb, 0, 0.95, 0);
  g3(G, bevelBox(w * 0.84, 0.75, len * 0.5, 0.3), mb, 0, 1.7, len * 0.05);
  // windows
  g3(G, bevelBox(w * 0.86, 0.5, len * 0.46, 0.2), mgl, 0, 1.72, len * 0.05, 0, 0, 0, [1, 1, 1]);
  const wheel = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 18, 1);
  wheel.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12, 1);
  hub.rotateZ(Math.PI / 2);
  for (const wz of [-len * 0.32, len * 0.32]) for (const sx of [-1, 1]) {
    g3(G, wheel, mn, sx * (w / 2 - 0.12), 0.55, wz);
    g3(G, hub, mw, sx * (w / 2 - 0.1), 0.55, wz);
  }
  // lights & bumper
  for (const sx of [-1, 1]) g3(G, new THREE.SphereGeometry(0.2, 10, 8), my, sx * w * 0.3, 1.05, -len / 2 + 0.05);
  g3(G, bevelBox(w * 0.9, 0.22, 0.25, 0.08), mw, 0, 0.6, -len / 2 + 0.05);
  g3(G, bevelBox(w * 0.9, 0.22, 0.25, 0.08), mw, 0, 0.6, len / 2 - 0.05);
  // racing number disc on the roof
  g3(G, new THREE.CylinderGeometry(0.45, 0.45, 0.05, 16), mw, 0, 2.09, len * 0.05);
  G.position.set(x, 0, z);
  G.rotation.y = ry;
  k.batch.addMesh(G);
}

/** Foam dart lying on the floor. */
export function dart(k: Kit, x: number, z: number, ry: number, body: number, y = 0.16, len = 1.2) {
  const G = new THREE.Group();
  const cyl = new THREE.CylinderGeometry(0.15, 0.15, len, 8, 1, true);
  cyl.rotateZ(Math.PI / 2);
  g3(G, cyl, k.m(body), 0, 0, 0);
  const tip = new THREE.SphereGeometry(0.17, 8, 5);
  g3(G, tip, k.m(C.orange), len / 2 + 0.04, 0, 0, 0, 0, 0, [1.1, 1, 1]);
  const back = new THREE.CircleGeometry(0.15, 8);
  back.rotateY(-Math.PI / 2);
  g3(G, back, k.m(body), -len / 2, 0, 0);
  G.position.set(x, y, z);
  G.rotation.y = ry;
  k.detail.addMesh(G);
}

/** Suction-cup dart stuck to a wall face (pointing along outward normal nx,nz). */
export function stuckDart(k: Kit, x: number, y: number, z: number, nx: number, nz: number, body: number, tilt = 0) {
  const G = new THREE.Group();
  const len = 1.1;
  const cyl = new THREE.CylinderGeometry(0.14, 0.14, len, 10, 1);
  cyl.rotateZ(Math.PI / 2);
  g3(G, cyl, k.m(body), -len / 2 - 0.1, 0, 0);
  const cup = new THREE.CylinderGeometry(0.1, 0.26, 0.14, 12, 1);
  cup.rotateZ(Math.PI / 2);
  g3(G, cup, k.m(C.orange), -0.05, 0, 0);
  G.position.set(x, y, z);
  // local +x should point into the wall (-normal)
  G.rotation.set(0, Math.atan2(nz, -nx), tilt);
  k.detail.addMesh(G);
}

/** Stacking ring toy centred at x,z. Tiers must match collision (radii, heights). */
export function stackingRings(k: Kit, x: number, z: number, tiers: { r: number; y0: number; y1: number; color: number }[], peg: { r: number; top: number }, ball: number) {
  const baseMat = k.m(C.white);
  // base disc
  k.add(new THREE.CylinderGeometry(tiers[0].r + 0.15, tiers[0].r + 0.25, 0.3, 36), baseMat, x, 0.15, z);
  for (const t of tiers) {
    const h = t.y1 - t.y0;
    const tube = h / 2;
    const R = t.r - tube;
    const tor = new THREE.TorusGeometry(R, tube * 1.02, 16, 40);
    tor.rotateX(Math.PI / 2);
    // flatten slightly into a chunky donut that fills its tier height
    k.add(tor, t.color, x, t.y0 + h / 2, z, 0, 0, 0, 1, 1, 1);
    // fill the donut hole so it looks stacked (visible from above only through the gap)
    k.add(new THREE.CylinderGeometry(R, R, h * 0.9, 24, 1, true), t.color, x, t.y0 + h / 2, z);
  }
  k.add(new THREE.CylinderGeometry(peg.r * 0.7, peg.r, peg.top - tiers[tiers.length - 1].y1 + 0.2, 20), C.wood, x, (peg.top + tiers[tiers.length - 1].y1) / 2, z);
  k.add(new THREE.SphereGeometry(peg.r * 1.25, 24, 16), ball, x, peg.top + peg.r * 0.9, z);
}

/** Toy drum (centre hill): cylinder with zig-zag cords and rims. */
export function toyDrum(k: Kit, x: number, z: number, r: number, h: number) {
  const segs = 40;
  k.add(new THREE.CylinderGeometry(r - 0.1, r - 0.1, h - 0.3, segs, 1, true), C.red, x, h / 2, z);
  // rims
  const rim = new THREE.TorusGeometry(r - 0.02, 0.16, 10, 48);
  rim.rotateX(Math.PI / 2);
  k.add(rim, C.yellow, x, 0.17, z);
  k.add(rim, C.yellow, x, h - 0.15, z);
  // drumhead
  k.add(new THREE.CylinderGeometry(r - 0.05, r - 0.05, 0.12, segs), 0xf3e2c4, x, h - 0.08, z);
  // zig-zag cords
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2;
    const p0 = new THREE.Vector3(Math.cos(a0) * r, 0.3, Math.sin(a0) * r);
    const p1 = new THREE.Vector3(Math.cos(a1) * r, h - 0.3, Math.sin(a1) * r);
    const p2 = new THREE.Vector3(Math.cos(a1 + Math.PI / n) * r, 0.3, Math.sin(a1 + Math.PI / n) * r);
    for (const [a, b] of [[p0, p1], [p1, p2]] as const) {
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const dir = b.clone().sub(a);
      const L = dir.length();
      const cyl = new THREE.CylinderGeometry(0.07, 0.07, L, 6, 1);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      const m4 = new THREE.Matrix4().compose(mid.add(new THREE.Vector3(x, 0, z)).add(new THREE.Vector3(Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)).multiplyScalar(0.04)), q, new THREE.Vector3(1, 1, 1));
      k.batch.add(cyl, k.m(C.white), m4);
    }
  }
  // star on top
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.22 : r * 0.5;
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    if (i === 0) star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const sg = new THREE.ShapeGeometry(star);
  sg.rotateX(-Math.PI / 2);
  k.add(sg, C.yellow, x, h + 0.005, z);
}

/** Wooden train track following a closed polyline in XZ (visual only). */
export function trackLoop(k: Kit, pts: THREE.Vector2[], width = 2.0) {
  const wood = k.m(C.wood);
  const groove = k.m(0xc9925a);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dz = b.y - a.y;
    const L = Math.hypot(dx, dz);
    const ry = Math.atan2(dx, dz);
    const cx = (a.x + b.x) / 2, cz = (a.y + b.y) / 2;
    k.detail.add(chamferBox(width, 0.14, L + 0.06, 0.04), wood, tr(cx, 0.07, cz, ry));
    // two grooves
    const px = Math.cos(ry), pz = -Math.sin(ry);
    for (const s of [-0.45, 0.45]) {
      const gr = new THREE.PlaneGeometry(0.2, L + 0.06);
      gr.rotateX(-Math.PI / 2);
      k.detail.add(gr, groove, tr(cx + px * s, 0.143, cz + pz * s, ry));
    }
  }
}
