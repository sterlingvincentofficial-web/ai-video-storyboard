import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry } from '../../core/utils';

/** Build a non-indexed flat-shaded geometry from a triangle list (with planar UVs). */
export function triGeo(pos: number[], uvScale = 0.25, uvAxis: 'xz' | 'xy' | 'auto' = 'auto') {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let mode = uvAxis;
    if (mode === 'auto') {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      mode = ay > ax && ay > az ? 'xz' : 'xy';
      if (mode === 'xy' && ax > az) {
        uv[i * 2] = z * uvScale;
        uv[i * 2 + 1] = y * uvScale;
        continue;
      }
    }
    if (mode === 'xz') {
      uv[i * 2] = x * uvScale;
      uv[i * 2 + 1] = z * uvScale;
    } else {
      uv[i * 2] = x * uvScale;
      uv[i * 2 + 1] = y * uvScale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Origami "pleated" cone: a ring of alternating outer/inner points gives folded
 * facets. Base at y=0 (outer points), apex at y=h. Flat shaded.
 */
export function pleatCone(r: number, h: number, pleats = 6, inner = 0.72, rot = 0, under = 0.22, innerLift = 0.08) {
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i < pleats * 2; i++) {
    const a = rot + (i / (pleats * 2)) * Math.PI * 2;
    const odd = i % 2 === 1;
    const rr = odd ? r * inner : r;
    ring.push(new THREE.Vector3(Math.cos(a) * rr, odd ? h * innerLift : 0, Math.sin(a) * rr));
  }
  const pos: number[] = [];
  const apex = [0, h, 0];
  const bot = [0, h * under, 0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    pos.push(apex[0], apex[1], apex[2], b.x, b.y, b.z, a.x, a.y, a.z);
    pos.push(bot[0], bot[1], bot[2], a.x, a.y, a.z, b.x, b.y, b.z);
  }
  return triGeo(pos, 0.35);
}

/** Simple n-sided prism (tree trunks, posts). */
export function prism(r: number, h: number, sides = 4, taper = 0.85, rot = Math.PI / 4) {
  const g = new THREE.CylinderGeometry(r * taper, r, h, sides, 1);
  g.rotateY(rot);
  g.translate(0, h / 2, 0);
  return g.toNonIndexed();
}

function hash3(x: number, y: number, z: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Crumpled paper lump filling (roughly) a box sx*sy*sz with its base at y=0.
 * `boxy` (<1) pushes the shape toward the box corners so it matches collision.
 */
export function crumpleGeo(sx: number, sy: number, sz: number, seed = 1, amp = 0.16, detail = 1, boxy = 0.6, flatBottom = true) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const rot = seed * 1.37;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = [Math.round(v.x * 1000), Math.round(v.y * 1000), Math.round(v.z * 1000)];
    const n = hash3(key[0], key[1], key[2], seed);
    // rotate the noise pattern per seed around y
    const c = Math.cos(rot), s = Math.sin(rot);
    const x = v.x * c - v.z * s, z = v.x * s + v.z * c;
    v.set(x, v.y, z);
    v.set(Math.sign(v.x) * Math.pow(Math.abs(v.x), boxy), Math.sign(v.y) * Math.pow(Math.abs(v.y), boxy), Math.sign(v.z) * Math.pow(Math.abs(v.z), boxy));
    v.multiplyScalar(1 + (n - 0.5) * amp * 2);
    let y = v.y;
    if (flatBottom) y = Math.max(y, -0.7);
    y = (y + (flatBottom ? 0.7 : 1)) / (flatBottom ? 1.7 : 2);
    p.setXYZ(i, v.x * sx * 0.5, y * sy, v.z * sz * 0.5);
  }
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  // planar-ish UVs
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) * 0.3, p.getY(i) * 0.3);
  return g;
}

/** Split an ExtrudeGeometry (non-indexed with groups) into [caps, sides]. */
export function splitGroups(geo: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const src = geo.index ? geo.toNonIndexed() : geo;
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: src.getAttribute('position').count, materialIndex: 0 }];
  const byMat = new Map<number, { start: number; count: number }[]>();
  for (const gr of groups) {
    const mi = gr.materialIndex ?? 0;
    if (!byMat.has(mi)) byMat.set(mi, []);
    byMat.get(mi)!.push({ start: gr.start, count: gr.count });
  }
  [...byMat.keys()].sort().forEach((mi) => {
    const parts = byMat.get(mi)!;
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const a = src.getAttribute(name) as THREE.BufferAttribute;
      if (!a) continue;
      const arr: number[] = [];
      for (const pr of parts) for (let i = pr.start; i < pr.start + pr.count; i++) for (let k = 0; k < a.itemSize; k++) arr.push(a.array[i * a.itemSize + k]);
      g.setAttribute(name, new THREE.Float32BufferAttribute(arr, a.itemSize));
    }
    out.push(g);
  });
  return out;
}

/** Wobbly rounded-rect outline in XZ (world coords). */
export function roundRectPts(x0: number, z0: number, x1: number, z1: number, rad: number, wobble: number, seed: number, seg = 5): [number, number][] {
  const r = mulberry(seed);
  const pts: [number, number][] = [];
  const corners: [number, number, number][] = [
    [x1 - rad, z1 - rad, 0], [x0 + rad, z1 - rad, Math.PI / 2], [x0 + rad, z0 + rad, Math.PI], [x1 - rad, z0 + rad, Math.PI * 1.5],
  ];
  for (let c = 0; c < 4; c++) {
    const [cx, cz, a0] = corners[c];
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
    }
    // wobble points along the straight edge to the next corner
    const [nx, nz] = corners[(c + 1) % 4];
    const ex = cx + Math.cos(a0 + Math.PI / 2) * rad, ez = cz + Math.sin(a0 + Math.PI / 2) * rad;
    const fx = nx + Math.cos(a0 + Math.PI / 2) * rad, fz = nz + Math.sin(a0 + Math.PI / 2) * rad;
    const len = Math.hypot(fx - ex, fz - ez);
    const n = Math.floor(len / 1.3);
    const ox = Math.cos(a0 + Math.PI / 2), oz = Math.sin(a0 + Math.PI / 2);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const w = (r() - 0.5) * 2 * wobble;
      pts.push([ex + (fx - ex) * t + ox * w, ez + (fz - ez) * t + oz * w]);
    }
  }
  return pts;
}

/** Wobbly ellipse outline in XZ. */
export function blobPts(cx: number, cz: number, rx: number, rz: number, wobble: number, seed: number, n = 22): [number, number][] {
  const r = mulberry(seed);
  const pts: [number, number][] = [];
  const ph = r() * 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + Math.sin(a * 3 + ph) * wobble * 0.5 + (r() - 0.5) * wobble;
    pts.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]);
  }
  return pts;
}

/**
 * Extrude an XZ outline vertically from y0 to y1. Returns [caps(top only), sides].
 */
export function slabFromPts(pts: [number, number][], y0: number, y1: number, uvScale = 0.25): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 3 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  const [caps, sides] = splitGroups(geo);
  // drop the bottom cap (faces pointing down)
  const cp = caps.getAttribute('position') as THREE.BufferAttribute;
  const keep: number[] = [];
  const kuv: number[] = [];
  const cuv = caps.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i += 3) {
    if (cp.getY(i) < y1 - 1e-4) continue;
    for (let k = 0; k < 3; k++) {
      keep.push(cp.getX(i + k), cp.getY(i + k), cp.getZ(i + k));
      kuv.push(cp.getX(i + k) * uvScale, cp.getZ(i + k) * uvScale);
    }
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  top.setAttribute('uv', new THREE.Float32BufferAttribute(kuv, 2));
  top.computeVertexNormals();
  const su = sides.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < su.count; i++) su.setXY(i, su.getX(i) * uvScale, su.getY(i) * uvScale);
  sides.deleteAttribute('normal');
  sides.computeVertexNormals();
  return [top, sides];
}

/**
 * Castle arch lintel: a block (w x h x d) centred on x, base y=0, with a round-topped
 * opening of width w (spring at `spring`). Faces +/-Z.
 */
export function archGeo(w: number, top: number, spring: number, d: number) {
  const shape = new THREE.Shape();
  const hw = w / 2;
  shape.moveTo(-hw, spring);
  shape.absarc(0, spring, hw, Math.PI, 0, true);
  shape.lineTo(hw, top);
  shape.lineTo(-hw, top);
  shape.closePath();
  // absarc from PI to 0 clockwise goes over the top
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 10 });
  geo.translate(0, 0, -d / 2);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.25, uv.getY(i) * 0.25);
  return geo;
}

/** Flat polygon (XY plane, facing +Z) from outline with UV mapped to its bounding box. */
export function flatPoly(pts: [number, number][], doubleSided = false) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ShapeGeometry(shape, 4);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  const front = g.toNonIndexed();
  if (!doubleSided) return front;
  // back face: same positions, reversed winding, flipped normals
  const back = front.clone();
  const p2 = back.getAttribute('position') as THREE.BufferAttribute;
  const n2 = back.getAttribute('normal') as THREE.BufferAttribute;
  const u2 = back.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p2.count; i += 3) {
    for (const a of [p2, n2, u2]) {
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.getComponent(i + 1, k);
        a.setComponent(i + 1, k, a.getComponent(i + 2, k));
        a.setComponent(i + 2, k, t);
      }
    }
  }
  for (let i = 0; i < n2.count; i++) n2.setXYZ(i, -n2.getX(i), -n2.getY(i), -n2.getZ(i));
  return mergeGeometries([front, back])!;
}

/** Swallow-tail banner, top edge at y=0, hanging down (facing +Z). */
export function bannerGeo(w: number, h: number, notch = 0.18) {
  return flatPoly([[-w / 2, 0], [-w / 2, -h], [0, -h * (1 - notch)], [w / 2, -h], [w / 2, 0]]);
}

/** Origami crane (wingspan ~7) centred at origin, facing +X. Double-sided paper. */
export function craneGeo() {
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { tri(a, b, c); tri(a, c, d); };
  // body: a folded diamond (two halves meeting at the keel)
  const front = [1.1, 0.35, 0], back = [-1.1, 0.35, 0], keel = [0, -0.75, 0];
  const sideL = [0, 0.25, 0.55], sideR = [0, 0.25, -0.55];
  const ridge = [0, 0.55, 0];
  tri(front, ridge, sideL); tri(ridge, back, sideL); tri(front, sideR, ridge); tri(ridge, sideR, back);
  tri(front, sideL, keel); tri(sideL, back, keel); tri(front, keel, sideR); tri(sideR, keel, back);
  // wings (each folded along a crease)
  for (const s of [1, -1]) {
    const root0 = [0.75, 0.42, 0.12 * s], root1 = [-0.75, 0.42, 0.12 * s];
    const crease = [-0.1, 1.15, 2.1 * s];
    const tip = [-0.55, 1.95, 3.7 * s];
    tri(root0, crease, root1);
    tri(root0, [0.55, 1.2, 2.3 * s], crease);
    tri(crease, [0.55, 1.2, 2.3 * s], tip);
    tri(crease, tip, [-0.9, 1.05, 2.4 * s]);
    tri(root1, crease, [-0.9, 1.05, 2.4 * s]);
  }
  // neck + head
  const n0 = [0.8, 0.3, 0.1], n1 = [0.8, 0.3, -0.1], n2 = [2.5, 2.1, 0];
  tri(n0, n2, [1.25, 0.1, 0]); tri(n1, [1.25, 0.1, 0], n2);
  tri(n0, n1, n2);
  tri(n2, [3.05, 1.75, 0.05], [2.55, 1.95, 0]);
  tri(n2, [2.55, 1.95, 0], [3.05, 1.75, -0.05]);
  // tail
  const t0 = [-0.8, 0.3, 0.1], t1 = [-0.8, 0.3, -0.1], t2 = [-2.6, 2.0, 0];
  tri(t0, [-1.25, 0.1, 0], t2); tri(t1, t2, [-1.25, 0.1, 0]);
  tri(t0, t2, t1);
  void quad;
  return triGeo(pos, 0.3);
}

/** A puffy crumpled-paper cloud cluster (big central puff, smaller side puffs, flat-ish base). */
export function cloudGeo(seed: number, scale = 1) {
  const r = mulberry(seed);
  const parts: THREE.BufferGeometry[] = [];
  const puffs: [number, number, number, number][] = [
    [0, 0.5, 0, 2.3], [-2.3, -0.2, 0.3, 1.6], [2.2, -0.1, -0.2, 1.75], [-3.9, -0.7, 0, 1.05], [3.8, -0.6, 0.2, 1.1], [0.9, 1.5, -0.3, 1.4],
  ];
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const [x, y, z, rad] = puffs[i];
    const s = rad * scale * (0.9 + r() * 0.2);
    const g = crumpleGeo(s * 2, s * 1.85, s * 1.6, seed * 10 + i, 0.13, 1, 0.95, false);
    g.translate(x * scale, y * scale - s * 0.92, z * scale);
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

/** Paper pennant (triangle flag) in XY plane, pole side at x=0. */
export function pennantGeo(len: number, h: number) {
  return flatPoly([[0, 0], [0, h], [len, h * 0.55]], true);
}
