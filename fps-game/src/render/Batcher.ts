import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collects static geometry per material and merges it into a few big meshes
 * to keep draw calls low (important on mobile).
 */
export class Batcher {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  get size() {
    return this.groups.size;
  }
  private tmp = new THREE.Matrix4();

  constructor(public castShadow = true, public receiveShadow = true) {}

  /** Add a geometry with a transform. The geometry is cloned. */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix?: THREE.Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    // normalise attributes so geometries merge (position, normal, uv [, color])
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const n = g.getAttribute('position').count;
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    const wantColor = (mat as THREE.MeshBasicMaterial).vertexColors;
    if (wantColor && !g.getAttribute('color')) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    const colAttr = g.getAttribute('color');
    if (colAttr && colAttr.itemSize !== 3) g.deleteAttribute('color');
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && !(k === 'color' && wantColor)) g.deleteAttribute(k);
    g.morphAttributes = {};
    if (matrix) g.applyMatrix4(matrix);
    let arr = this.groups.get(mat);
    if (!arr) this.groups.set(mat, (arr = []));
    arr.push(g);
  }

  /** Add a mesh (and its children) by baking world transforms. */
  addMesh(obj: THREE.Object3D) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      this.add(m.geometry, mat, m.matrixWorld);
    });
  }

  /** Convenience: box at position with size. */
  box(mat: THREE.Material, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotY = 0) {
    const g = boxGeo(sx, sy, sz);
    this.tmp.makeRotationY(rotY).setPosition(cx, cy, cz);
    this.add(g, mat, this.tmp);
  }

  flush(parent: THREE.Object3D, shadows = true, castOverride?: (mat: THREE.Material) => boolean) {
    this.groups.forEach((geos, mat) => {
      // chunk to avoid huge single buffers
      for (let i = 0; i < geos.length; i += 400) {
        const merged = mergeGeometries(geos.slice(i, i + 400), false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = castOverride ? castOverride(mat) : shadows && this.castShadow && !(mat as THREE.MeshBasicMaterial).transparent;
        mesh.receiveShadow = shadows && this.receiveShadow;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        parent.add(mesh);
      }
      geos.forEach((g) => g.dispose());
    });
    this.groups.clear();
  }
}

const boxCache = new Map<string, THREE.BufferGeometry>();
/** Box geometry with UVs scaled to world size (so textures tile consistently). */
export function boxGeo(sx: number, sy: number, sz: number, uvScale = 0.25) {
  const key = `${sx.toFixed(3)}|${sy.toFixed(3)}|${sz.toFixed(3)}|${uvScale}`;
  let g = boxCache.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    let w: number, h: number;
    if (ax > 0.5) { w = sz; h = sy; } else if (ay > 0.5) { w = sx; h = sz; } else { w = sx; h = sy; }
    uv.setXY(i, uv.getX(i) * w * uvScale, uv.getY(i) * h * uvScale);
  }
  boxCache.set(key, g);
  return g;
}

/**
 * Merge every static mesh under `root` (not below a `userData.dynamic` node, not flagged
 * `userData.noMerge`) into per-material batches in root's local space. Recurses into dynamic
 * nodes so their own static children get merged too. Returns number of meshes merged.
 */
export function mergeStatic(root: THREE.Object3D, shadows: boolean): number {
  let merged = 0;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const batch = new Batcher(shadows, shadows);
  const casters = new Map<THREE.Material, boolean>();
  const remove: THREE.Object3D[] = [];
  const dyn: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (c.userData.dynamic) { dyn.push(c); continue; }
      const m = c as THREE.Mesh;
      if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh && !m.userData.noMerge && !Array.isArray(m.material) && m.children.length === 0 && m.geometry.getAttribute('position')) {
        const mat = m.material as THREE.Material;
        if ((mat as THREE.ShaderMaterial).isShaderMaterial || (m.geometry.morphAttributes && Object.keys(m.geometry.morphAttributes).length)) { visit(c); continue; }
        rel.multiplyMatrices(inv, m.matrixWorld);
        batch.add(m.geometry, mat, rel);
        casters.set(mat, (casters.get(mat) ?? false) || m.castShadow);
        remove.push(m);
        merged++;
        continue;
      }
      visit(c);
    }
  };
  visit(root);
  if (merged > 1) {
    for (const r of remove) r.parent?.remove(r);
    batch.flush(root, shadows, (mat) => shadows && (casters.get(mat) ?? false));
  }
  for (const d of dyn) merged += mergeStatic(d, shadows);
  return merged;
}
