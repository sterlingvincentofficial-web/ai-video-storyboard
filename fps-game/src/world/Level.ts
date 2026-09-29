import * as THREE from 'three';

/**
 * Level geometry model.
 *
 * Rule: collision geometry has no overhangs you can walk under. Every solid is an
 * axis-aligned box or an axis-aligned ramp (a wedge). This lets bots navigate with a
 * 2.5D height grid while the player gets precise box collision.
 */

export type PickupType = 'health' | 'ammo' | 'boomer' | 'zapper' | 'overcharge';

export interface BoxDef {
  min: [number, number, number];
  max: [number, number, number];
  /** Visual kind, interpreted by the world's visual builder ("floor", "wall", "crate", ...). */
  kind: string;
  /** Optional colour hint for the visual builder. */
  color?: number;
  /** Visual-only: skip collision. */
  ghost?: boolean;
  /** Hidden (collision only, e.g. invisible boundary). */
  invisible?: boolean;
  /** Free-form data for the visual builder. */
  data?: Record<string, unknown>;
}

export interface RampDef {
  min: [number, number, number]; // min[1] = base height (bottom of wedge)
  max: [number, number, number]; // x/z footprint; max[1] ignored
  /** Axis along which height changes. */
  axis: 'x' | 'z';
  /** Height at the low end and at the high end (world Y of surface). */
  h0: number;
  h1: number;
  /** +1: surface rises toward +axis. -1: rises toward -axis. */
  dir: 1 | -1;
  kind: string;
  color?: number;
  invisible?: boolean;
}

export interface JumpPadDef {
  pos: [number, number, number];
  /** Where the pad sends you. Launch velocity is solved to land there. */
  target: [number, number, number];
  radius?: number;
}

export interface SpawnDef {
  pos: [number, number, number];
  yaw: number;
  team: 0 | 1;
}

export interface PickupDef {
  pos: [number, number, number];
  type: PickupType;
}

export interface LevelData {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  boxes: BoxDef[];
  ramps: RampDef[];
  pads: JumpPadDef[];
  spawns: SpawnDef[];
  pickups: PickupDef[];
  /** Flag bases per team [blue, red]. */
  flags: [[number, number, number], [number, number, number]];
  /** Control zones for King of the Hill. */
  zone: { pos: [number, number, number]; radius: number };
  /** Anything falling below this dies. */
  killY: number;
  /** Extra strategic points bots like to visit. */
  hotspots?: [number, number, number][];
}

export interface Solid {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  ramp: RampDef | null;
}

export interface RayHit {
  t: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

const CELL = 4;

/** Height of a ramp surface at x,z (unclamped inside footprint). */
export function rampHeight(r: RampDef, x: number, z: number) {
  const a = r.axis === 'x' ? x : z;
  const lo = r.axis === 'x' ? r.min[0] : r.min[2];
  const hi = r.axis === 'x' ? r.max[0] : r.max[2];
  let t = (a - lo) / (hi - lo);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  if (r.dir === -1) t = 1 - t;
  return r.h0 + (r.h1 - r.h0) * t;
}

export class Collision {
  solids: Solid[] = [];
  private grid = new Map<number, number[]>();
  bounds: LevelData['bounds'];
  killY: number;

  constructor(public data: LevelData) {
    this.bounds = data.bounds;
    this.killY = data.killY;
    for (const b of data.boxes) {
      if (b.ghost) continue;
      this.solids.push({
        minX: b.min[0], minY: b.min[1], minZ: b.min[2],
        maxX: b.max[0], maxY: b.max[1], maxZ: b.max[2],
        ramp: null,
      });
    }
    for (const r of data.ramps) {
      this.solids.push({
        minX: r.min[0], minY: r.min[1], minZ: r.min[2],
        maxX: r.max[0], maxY: Math.max(r.h0, r.h1), maxZ: r.max[2],
        ramp: r,
      });
    }
    this.solids.forEach((s, i) => {
      const x0 = Math.floor(s.minX / CELL), x1 = Math.floor(s.maxX / CELL);
      const z0 = Math.floor(s.minZ / CELL), z1 = Math.floor(s.maxZ / CELL);
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const k = this.key(x, z);
          let arr = this.grid.get(k);
          if (!arr) this.grid.set(k, (arr = []));
          arr.push(i);
        }
    });
  }

  private key(x: number, z: number) {
    return (x + 1000) * 4096 + (z + 1000);
  }

  private stamp = 0;
  private marks: Uint32Array = new Uint32Array(0);
  private tmp: number[] = [];

  /** Solids whose XZ footprint may touch the given rect. */
  query(minX: number, minZ: number, maxX: number, maxZ: number): number[] {
    if (this.marks.length !== this.solids.length) this.marks = new Uint32Array(this.solids.length);
    this.stamp++;
    const out = this.tmp;
    out.length = 0;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const arr = this.grid.get(this.key(x, z));
        if (!arr) continue;
        for (const i of arr) {
          if (this.marks[i] === this.stamp) continue;
          this.marks[i] = this.stamp;
          out.push(i);
        }
      }
    return out;
  }

  /** Top surface height of solid at point (clamped into its footprint). */
  surfaceAt(s: Solid, x: number, z: number) {
    if (!s.ramp) return s.maxY;
    return rampHeight(s.ramp, x, z);
  }

  /**
   * Highest walkable surface under a circle whose top is at most `maxY`.
   * Returns -Infinity if nothing is below.
   */
  groundHeight(x: number, z: number, radius: number, maxY: number): number {
    let best = -Infinity;
    const ids = this.query(x - radius, z - radius, x + radius, z + radius);
    for (const i of ids) {
      const s = this.solids[i];
      // circle-rect overlap in XZ
      const cx = x < s.minX ? s.minX : x > s.maxX ? s.maxX : x;
      const cz = z < s.minZ ? s.minZ : z > s.maxZ ? s.maxZ : z;
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz > radius * radius) continue;
      let h: number;
      if (s.ramp) {
        // use the centre projected onto the footprint for smooth ramps
        h = rampHeight(s.ramp, cx, cz);
      } else h = s.maxY;
      if (h <= maxY && h > best) best = h;
    }
    return best;
  }

  /** Highest surface of anything at exact point (ignores step limits). Used by nav + spawn. */
  topAt(x: number, z: number): number {
    let best = -Infinity;
    const ids = this.query(x, z, x, z);
    for (const i of ids) {
      const s = this.solids[i];
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const h = this.surfaceAt(s, x, z);
      if (h > best) best = h;
    }
    return best;
  }

  /**
   * Move a vertical cylinder through the world.
   * pos is the feet position (mutated). vel mutated on collisions.
   */
  move(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    dt: number,
    radius: number,
    height: number,
    stepUp: number,
    wasGrounded: boolean,
  ): { grounded: boolean; hitWall: boolean; hitCeiling: boolean; landedSpeed: number } {
    let hitWall = false;
    let hitCeiling = false;
    const dist = Math.hypot(vel.x, vel.z) * dt;
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.5)));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      pos.x += vel.x * sdt;
      pos.z += vel.z * sdt;
      if (this.pushOut(pos, radius, height, stepUp, vel)) hitWall = true;
    }

    // Vertical
    let grounded = false;
    let landedSpeed = 0;
    const prevY = pos.y;
    pos.y += vel.y * dt;

    // ceiling check (floating solids only)
    if (vel.y > 0) {
      const ids = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
      for (const i of ids) {
        const sd = this.solids[i];
        if (sd.ramp) continue;
        if (sd.minY <= prevY + height - 0.01) continue;
        if (pos.y + height < sd.minY) continue;
        const cx = Math.max(sd.minX, Math.min(pos.x, sd.maxX));
        const cz = Math.max(sd.minZ, Math.min(pos.z, sd.maxZ));
        if ((pos.x - cx) ** 2 + (pos.z - cz) ** 2 >= radius * radius) continue;
        pos.y = sd.minY - height;
        vel.y = 0;
        hitCeiling = true;
      }
    }

    const probe = Math.max(prevY, pos.y) + stepUp;
    const g = this.groundHeight(pos.x, pos.z, radius * 0.85, probe);
    if (g > -Infinity) {
      if (pos.y <= g) {
        if (vel.y < 0) landedSpeed = -vel.y;
        pos.y = g;
        if (vel.y < 0) vel.y = 0;
        grounded = true;
      } else if (wasGrounded && vel.y <= 0 && pos.y - g < 0.35) {
        // snap down slopes / small steps
        pos.y = g;
        vel.y = 0;
        grounded = true;
      }
    }
    return { grounded, hitWall, hitCeiling, landedSpeed };
  }

  /** Resolve horizontal penetration against walls. Returns true if pushed. */
  pushOut(pos: THREE.Vector3, radius: number, height: number, stepUp: number, vel?: THREE.Vector3): boolean {
    let pushed = false;
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      const ids = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
      for (const i of ids) {
        const s = this.solids[i];
        if (s.minY >= pos.y + height) continue;
        const cx = pos.x < s.minX ? s.minX : pos.x > s.maxX ? s.maxX : pos.x;
        const cz = pos.z < s.minZ ? s.minZ : pos.z > s.maxZ ? s.maxZ : pos.z;
        const top = s.ramp ? rampHeight(s.ramp, cx, cz) : s.maxY;
        if (top <= pos.y + stepUp) continue;
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        let nx: number, nz: number, pen: number;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d; pen = radius - d;
        } else {
          // centre inside the rect: push along smallest axis
          const l = pos.x - s.minX, r = s.maxX - pos.x, b = pos.z - s.minZ, f = s.maxZ - pos.z;
          const m = Math.min(l, r, b, f);
          if (m === l) { nx = -1; nz = 0; pen = l + radius; }
          else if (m === r) { nx = 1; nz = 0; pen = r + radius; }
          else if (m === b) { nx = 0; nz = -1; pen = b + radius; }
          else { nx = 0; nz = 1; pen = f + radius; }
        }
        pos.x += nx * pen;
        pos.z += nz * pen;
        if (vel) {
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
        }
        any = true;
        pushed = true;
      }
      if (!any) break;
    }
    return pushed;
  }

  private _p = new THREE.Vector3();

  /** Ray vs world. dir must be normalized. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, out?: RayHit): RayHit | null {
    let bestT = maxDist;
    let bnx = 0, bny = 0, bnz = 0;
    let found = false;
    const ex = origin.x + dir.x * maxDist, ez = origin.z + dir.z * maxDist;
    const ids = this.query(Math.min(origin.x, ex), Math.min(origin.z, ez), Math.max(origin.x, ex), Math.max(origin.z, ez));
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const idx = 1 / (dir.x || 1e-12), idy = 1 / (dir.y || 1e-12), idz = 1 / (dir.z || 1e-12);
    for (const i of ids) {
      const s = this.solids[i];
      let t1 = (s.minX - ox) * idx, t2 = (s.maxX - ox) * idx;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      let nAxis = 0;
      let enter = tmin;
      t1 = (s.minY - oy) * idy; t2 = (s.maxY - oy) * idy;
      let a = Math.min(t1, t2), b = Math.max(t1, t2);
      if (a > enter) { enter = a; nAxis = 1; }
      tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
      t1 = (s.minZ - oz) * idz; t2 = (s.maxZ - oz) * idz;
      a = Math.min(t1, t2); b = Math.max(t1, t2);
      if (a > enter) { enter = a; nAxis = 2; }
      tmin = Math.max(tmin, a); tmax = Math.min(tmax, b);
      if (tmax < Math.max(tmin, 0) || tmin >= bestT) continue;
      if (!s.ramp) {
        if (tmin < 0) continue; // started inside
        bestT = tmin;
        found = true;
        bnx = nAxis === 0 ? -Math.sign(dir.x) : 0;
        bny = nAxis === 1 ? -Math.sign(dir.y) : 0;
        bnz = nAxis === 2 ? -Math.sign(dir.z) : 0;
      } else {
        const r = s.ramp;
        const t0 = Math.max(tmin, 0);
        // f(t) = y(t) - h(x(t),z(t)); linear in t inside the footprint
        const fAt = (t: number) => oy + dir.y * t - rampHeight(r, ox + dir.x * t, oz + dir.z * t);
        const f0 = fAt(t0);
        if (f0 <= 0) {
          if (tmin < 0) continue;
          bestT = t0; found = true;
          bnx = nAxis === 0 ? -Math.sign(dir.x) : 0;
          bny = nAxis === 1 ? -Math.sign(dir.y) : 0;
          bnz = nAxis === 2 ? -Math.sign(dir.z) : 0;
          continue;
        }
        const f1 = fAt(tmax);
        if (f1 > 0) continue;
        const t = t0 + (tmax - t0) * (f0 / (f0 - f1));
        if (t >= bestT) continue;
        bestT = t; found = true;
        // plane normal
        const len = (r.axis === 'x' ? r.max[0] - r.min[0] : r.max[2] - r.min[2]);
        const slope = ((r.h1 - r.h0) / len) * r.dir;
        const n = this._p.set(r.axis === 'x' ? -slope : 0, 1, r.axis === 'z' ? -slope : 0).normalize();
        bnx = n.x; bny = n.y; bnz = n.z;
      }
    }
    if (!found) return null;
    const hit = out ?? { t: 0, point: new THREE.Vector3(), normal: new THREE.Vector3() };
    hit.t = bestT;
    hit.point.set(ox + dir.x * bestT, oy + dir.y * bestT, oz + dir.z * bestT);
    hit.normal.set(bnx, bny, bnz);
    return hit;
  }

  private _dir = new THREE.Vector3();
  /** True if the segment a->b is unobstructed. */
  lineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const d = this._dir.subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    d.multiplyScalar(1 / len);
    return this.raycast(a, d, len - 0.05) === null;
  }
}
