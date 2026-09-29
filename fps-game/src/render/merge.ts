import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpM = new THREE.Matrix4();
const inv = new THREE.Matrix4();

/**
 * Bake the direct mesh children of `group` (those whose material has a plain colour and
 * is not transparent / emissive-glow) into a single vertex-coloured mesh using `material`.
 * Returns the created mesh (or null if nothing merged). Children that can't be merged stay.
 */
export function consolidate(group: THREE.Object3D, material: THREE.Material, deep = false): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  const remove: THREE.Object3D[] = [];
  group.updateMatrixWorld(true);
  inv.copy(group.matrixWorld).invert();
  const visit = (o: THREE.Object3D) => {
    for (const c of o.children) {
      const m = c as THREE.Mesh;
      if (m.isMesh && !m.userData.keep) {
        const mat = m.material as THREE.MeshToonMaterial;
        if (!Array.isArray(mat) && mat.color && !mat.transparent && !mat.map && !(mat as unknown as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
          let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
          if (!g.getAttribute('normal')) g.computeVertexNormals();
          tmpM.multiplyMatrices(inv, m.matrixWorld);
          g.applyMatrix4(tmpM);
          const n = g.getAttribute('position').count;
          const col = new Float32Array(n * 3);
          const c3 = mat.color;
          for (let i = 0; i < n; i++) { col[i * 3] = c3.r; col[i * 3 + 1] = c3.g; col[i * 3 + 2] = c3.b; }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          geos.push(g);
          remove.push(m);
          continue;
        }
      }
      if (deep && !(c as THREE.Mesh).isMesh && !c.userData.pivot) visit(c);
    }
  };
  visit(group);
  if (!geos.length) return null;
  for (const r of remove) r.parent?.remove(r);
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}
