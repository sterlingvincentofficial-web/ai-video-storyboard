import * as THREE from 'three';
import { rand } from '../core/utils';

export type WeatherKind = 'rain' | 'paper' | 'bubbles' | 'none';

interface Flake { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; spin: number; s: number }

/**
 * Cheap ambient particles that live in a box around the camera and wrap around it.
 */
export class Weather {
  mesh: THREE.InstancedMesh | null = null;
  private flakes: Flake[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private half: THREE.Vector3;

  constructor(public kind: WeatherKind, parent: THREE.Object3D) {
    let geo: THREE.BufferGeometry;
    let mat: THREE.Material;
    let n = 0;
    switch (kind) {
      case 'rain':
        geo = new THREE.BoxGeometry(0.018, 0.9, 0.018);
        mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.4), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, fog: false });
        n = 900;
        this.half = new THREE.Vector3(22, 12, 22);
        break;
      case 'paper':
        geo = new THREE.PlaneGeometry(0.3, 0.22);
        mat = new THREE.MeshBasicMaterial({ color: 0xfffaf0, side: THREE.DoubleSide });
        n = 160;
        this.half = new THREE.Vector3(26, 12, 26);
        break;
      case 'bubbles':
        geo = new THREE.SphereGeometry(0.16, 10, 8);
        mat = new THREE.MeshPhongMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35, shininess: 120, specular: 0xffffff, depthWrite: false });
        n = 70;
        this.half = new THREE.Vector3(24, 8, 24);
        break;
      default:
        this.half = new THREE.Vector3();
        return;
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 5;
    parent.add(this.mesh);
    for (let i = 0; i < n; i++) {
      const f: Flake = {
        x: rand(-this.half.x, this.half.x), y: rand(-this.half.y, this.half.y), z: rand(-this.half.z, this.half.z),
        vx: 0, vy: 0, vz: 0, rx: rand(0, 6), ry: rand(0, 6), spin: rand(-3, 3), s: rand(0.6, 1.4),
      };
      if (kind === 'rain') { f.vy = -rand(22, 30); f.vx = -2; }
      if (kind === 'paper') { f.vy = -rand(0.6, 1.4); f.vx = rand(0.3, 1); f.vz = rand(-0.4, 0.4); }
      if (kind === 'bubbles') { f.vy = rand(0.4, 1.1); f.vx = rand(-0.3, 0.3); f.vz = rand(-0.3, 0.3); f.y = rand(-4, this.half.y); }
      this.flakes.push(f);
    }
  }

  update(dt: number, cam: THREE.Vector3, t: number) {
    if (!this.mesh) return;
    const h = this.half;
    let i = 0;
    for (const f of this.flakes) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      if (this.kind === 'paper') {
        f.x += Math.sin(t * 1.3 + f.rx) * 0.4 * dt;
        f.rx += f.spin * dt;
        f.ry += f.spin * 0.7 * dt;
      }
      if (this.kind === 'bubbles') f.x += Math.sin(t * 0.8 + f.ry) * 0.3 * dt;
      // wrap around the camera box
      let wx = f.x - cam.x, wy = f.y - cam.y, wz = f.z - cam.z;
      if (wx < -h.x) f.x += 2 * h.x; else if (wx > h.x) f.x -= 2 * h.x;
      if (wz < -h.z) f.z += 2 * h.z; else if (wz > h.z) f.z -= 2 * h.z;
      if (wy < -h.y * 0.4) f.y += h.y * 1.4; else if (wy > h.y) f.y -= h.y * 1.4;
      wx = f.x; wy = f.y; wz = f.z;
      if (this.kind === 'rain') this.q.identity();
      else this.q.setFromEuler(this.e.set(f.rx, f.ry, 0));
      const pop = this.kind === 'bubbles' ? 0.8 + Math.sin(t * 3 + f.rx) * 0.1 : 1;
      this.m.compose(this.p.set(wx, wy, wz), this.q, this.sc.setScalar(f.s * pop));
      this.mesh.setMatrixAt(i++, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    if (!this.mesh) return;
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = null;
  }
}
