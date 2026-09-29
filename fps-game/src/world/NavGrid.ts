import * as THREE from 'three';
import type { Collision, LevelData } from './Level';

/**
 * 2.5D navigation grid. Each cell stores the walkable surface height.
 * Edges connect neighbours whose height difference is climbable (or a drop).
 * Jump pads add one-way links.
 */

const STEP = 0.6;
const JUMP_UP = 1.35;
const MAX_DROP = 9;

export interface NavPoint {
  x: number;
  y: number;
  z: number;
  /** Bot should jump when heading to this point. */
  jump?: boolean;
  /** This point is a jump pad: walk onto it and let physics do the rest. */
  pad?: boolean;
}

class Heap {
  private ids: number[] = [];
  private f: Float32Array;
  constructor(n: number) {
    this.f = new Float32Array(n);
  }
  get size() {
    return this.ids.length;
  }
  clear() {
    this.ids.length = 0;
  }
  push(id: number, f: number) {
    this.f[id] = f;
    const a = this.ids;
    a.push(id);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.ids;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l;
        if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export class NavGrid {
  cs = 1; // cell size
  w: number;
  h: number;
  ox: number;
  oz: number;
  height: Float32Array;
  walk: Uint8Array;
  /** Distance-to-wall-ish clearance flag (1 = hugging a wall). */
  tight: Uint8Array;
  /** Region id (connected component) for fast reachability checks. */
  region: Int32Array;
  links = new Map<number, number[]>(); // pad cell -> landing cells
  padCells = new Set<number>();
  walkable: number[] = [];

  private g: Float32Array;
  private came: Int32Array;
  private closed: Uint32Array;
  private open: Uint32Array;
  private stamp = 0;
  private heap: Heap;

  constructor(private col: Collision, data: LevelData, cellSize = 1) {
    this.cs = cellSize;
    const b = data.bounds;
    this.ox = b.minX;
    this.oz = b.minZ;
    this.w = Math.ceil((b.maxX - b.minX) / this.cs);
    this.h = Math.ceil((b.maxZ - b.minZ) / this.cs);
    const n = this.w * this.h;
    this.height = new Float32Array(n);
    this.walk = new Uint8Array(n);
    this.tight = new Uint8Array(n);
    this.region = new Int32Array(n).fill(-1);
    this.g = new Float32Array(n);
    this.came = new Int32Array(n);
    this.closed = new Uint32Array(n);
    this.open = new Uint32Array(n);
    this.heap = new Heap(n);

    const r = 0.5;
    const samples: [number, number][] = [];
    for (let i = 0; i < 8; i++) samples.push([Math.cos((i / 8) * Math.PI * 2) * r, Math.sin((i / 8) * Math.PI * 2) * r]);
    const r2 = 0.95;
    const samples2: [number, number][] = [];
    for (let i = 0; i < 8; i++) samples2.push([Math.cos((i / 8) * Math.PI * 2) * r2, Math.sin((i / 8) * Math.PI * 2) * r2]);

    for (let z = 0; z < this.h; z++)
      for (let x = 0; x < this.w; x++) {
        const i = z * this.w + x;
        const wx = this.ox + (x + 0.5) * this.cs, wz = this.oz + (z + 0.5) * this.cs;
        const hgt = col.topAt(wx, wz);
        this.height[i] = hgt;
        if (hgt === -Infinity || hgt < data.killY + 1) continue;
        let ok = true;
        for (const [sx, sz] of samples) {
          const hh = col.topAt(wx + sx, wz + sz);
          if (hh > hgt + STEP || hh === -Infinity || hh < hgt - 3) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        this.walk[i] = 1;
        for (const [sx, sz] of samples2) {
          const hh = col.topAt(wx + sx, wz + sz);
          if (hh > hgt + STEP || hh === -Infinity) {
            this.tight[i] = 1;
            break;
          }
        }
      }

    for (const p of data.pads) {
      const from = this.cellAt(p.pos[0], p.pos[2]);
      const to = this.nearestWalkable(p.target[0], p.target[1], p.target[2]);
      if (from >= 0 && to >= 0) {
        this.walk[from] = 1;
        this.padCells.add(from);
        const arr = this.links.get(from) ?? [];
        arr.push(to);
        this.links.set(from, arr);
      }
    }

    for (let i = 0; i < n; i++) if (this.walk[i]) this.walkable.push(i);
    this.computeRegions();
  }

  cellAt(x: number, z: number) {
    const cx = Math.floor((x - this.ox) / this.cs), cz = Math.floor((z - this.oz) / this.cs);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return -1;
    return cz * this.w + cx;
  }

  cellCenter(i: number, out = new THREE.Vector3()) {
    const x = i % this.w, z = (i / this.w) | 0;
    return out.set(this.ox + (x + 0.5) * this.cs, this.height[i], this.oz + (z + 0.5) * this.cs);
  }

  /** Nearest walkable cell to a point, preferring cells at a similar height. */
  nearestWalkable(x: number, y: number, z: number, maxR = 6): number {
    const c = this.cellAt(x, z);
    if (c >= 0 && this.walk[c] && Math.abs(this.height[c] - y) < 1.5) return c;
    const cx = Math.floor((x - this.ox) / this.cs), cz = Math.floor((z - this.oz) / this.cs);
    let best = -1, bestD = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
          const i = nz * this.w + nx;
          if (!this.walk[i]) continue;
          const d = dx * dx + dz * dz + (this.height[i] - y) ** 2 * 4;
          if (d < bestD) { bestD = d; best = i; }
        }
      if (best >= 0) return best;
    }
    return best;
  }

  /** Enumerate traversable neighbours of cell i. */
  private neighbours(i: number, out: { n: number; cost: number; jump: boolean }[]) {
    out.length = 0;
    const x = i % this.w, z = (i / this.w) | 0;
    const h0 = this.height[i];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
        const j = nz * this.w + nx;
        if (!this.walk[j]) continue;
        const dh = this.height[j] - h0;
        if (dh > JUMP_UP || dh < -MAX_DROP) continue;
        if (dx && dz) {
          // no corner cutting
          const a = z * this.w + nx, b = nz * this.w + x;
          if (!this.walk[a] || !this.walk[b]) continue;
          if (Math.abs(this.height[a] - h0) > STEP || Math.abs(this.height[b] - h0) > STEP) continue;
        }
        const jump = dh > STEP;
        let cost = dx && dz ? 1.414 : 1;
        if (jump) cost += 2;
        if (dh < -STEP) cost += 0.5;
        if (this.tight[j]) cost += 0.6;
        out.push({ n: j, cost: cost * this.cs, jump });
      }
    const l = this.links.get(i);
    if (l) for (const j of l) out.push({ n: j, cost: 4, jump: false });
  }

  private computeRegions() {
    // Undirected-ish connectivity using only edges traversable both ways (so a region is mutually reachable)
    let rid = 0;
    const nb: { n: number; cost: number; jump: boolean }[] = [];
    const stack: number[] = [];
    for (const s of this.walkable) {
      if (this.region[s] >= 0) continue;
      this.region[s] = rid;
      stack.push(s);
      while (stack.length) {
        const c = stack.pop()!;
        this.neighbours(c, nb);
        for (const e of nb) {
          if (this.region[e.n] >= 0) continue;
          const dh = Math.abs(this.height[e.n] - this.height[c]);
          if (dh > JUMP_UP && !this.links.get(c)?.includes(e.n)) continue;
          this.region[e.n] = rid;
          stack.push(e.n);
        }
      }
      rid++;
    }
    // Find largest region -> main
    const counts = new Map<number, number>();
    for (const s of this.walkable) counts.set(this.region[s], (counts.get(this.region[s]) ?? 0) + 1);
    let main = 0, mc = 0;
    counts.forEach((c, r) => { if (c > mc) { mc = c; main = r; } });
    this.mainRegion = main;
    this.mainCells = this.walkable.filter((c) => this.region[c] === main);
  }
  mainRegion = 0;
  mainCells: number[] = [];

  randomCell(): number {
    return this.mainCells[Math.floor(Math.random() * this.mainCells.length)];
  }

  private nb: { n: number; cost: number; jump: boolean }[] = [];
  private jumpFlag: Uint8Array | null = null;

  /** A* from world pos to world pos. Returns smoothed list of waypoints (excluding start). */
  findPath(from: THREE.Vector3, to: THREE.Vector3, maxIter = 6000): NavPoint[] | null {
    const s = this.nearestWalkable(from.x, from.y, from.z);
    const t = this.nearestWalkable(to.x, to.y, to.z);
    if (s < 0 || t < 0) return null;
    if (!this.jumpFlag) this.jumpFlag = new Uint8Array(this.walk.length);
    this.stamp++;
    const st = this.stamp;
    const heap = this.heap;
    heap.clear();
    const tx = t % this.w, tz = (t / this.w) | 0;
    const hfun = (i: number) => {
      const x = i % this.w, z = (i / this.w) | 0;
      const dx = Math.abs(x - tx), dz = Math.abs(z - tz);
      return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * this.cs;
    };
    this.g[s] = 0;
    this.came[s] = -1;
    this.open[s] = st;
    heap.push(s, hfun(s));
    let iter = 0;
    let found = false;
    while (heap.size && iter++ < maxIter) {
      const c = heap.pop();
      if (this.closed[c] === st) continue;
      this.closed[c] = st;
      if (c === t) { found = true; break; }
      this.neighbours(c, this.nb);
      for (const e of this.nb) {
        if (this.closed[e.n] === st) continue;
        const ng = this.g[c] + e.cost;
        if (this.open[e.n] === st && ng >= this.g[e.n]) continue;
        this.open[e.n] = st;
        this.g[e.n] = ng;
        this.came[e.n] = c;
        this.jumpFlag[e.n] = e.jump ? 1 : 0;
        heap.push(e.n, ng + hfun(e.n));
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let c = t; c !== -1; c = this.came[c]) cells.push(c);
    cells.reverse();
    return this.smooth(cells);
  }

  /** Grid-walk check that a straight segment between two cells is flat enough to walk directly. */
  private walkableLine(a: number, b: number): boolean {
    const ax = a % this.w, az = (a / this.w) | 0;
    const bx = b % this.w, bz = (b / this.w) | 0;
    const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az)) * 2;
    if (steps === 0) return true;
    let prevH = this.height[a];
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      // check a small neighbourhood to keep clearance
      const cx = Math.round(x), cz = Math.round(z);
      const i = cz * this.w + cx;
      if (!this.walk[i] || this.padCells.has(i)) return false;
      if (this.tight[i] && i !== a && i !== b) return false;
      const hh = this.height[i];
      if (Math.abs(hh - prevH) > STEP) return false;
      prevH = hh;
    }
    return true;
  }

  private smooth(cells: number[]): NavPoint[] {
    const pts: NavPoint[] = [];
    let anchor = 0;
    const special = (i: number) => this.padCells.has(cells[i]) || (this.jumpFlag![cells[i]] === 1) || (i > 0 && this.links.get(cells[i - 1])?.includes(cells[i]));
    let i = 1;
    while (i < cells.length) {
      // extend as far as possible
      let j = i;
      while (j + 1 < cells.length && !special(j) && !special(j + 1) && this.walkableLine(cells[anchor], cells[j + 1])) j++;
      const c = cells[j];
      const p = this.cellCenter(c);
      pts.push({ x: p.x, y: p.y, z: p.z, jump: this.jumpFlag![c] === 1, pad: this.padCells.has(c) });
      anchor = j;
      i = j + 1;
    }
    return pts;
  }

  /** Is there a walkable surface at this point (for spawn/item validation)? */
  isWalkable(x: number, z: number) {
    const c = this.cellAt(x, z);
    return c >= 0 && this.walk[c] === 1;
  }
}
