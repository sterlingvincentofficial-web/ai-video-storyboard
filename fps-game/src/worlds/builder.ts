import type { BoxDef, LevelData, PickupType, RampDef } from '../world/Level';

type V3 = [number, number, number];

/**
 * Helper for authoring symmetric arena layouts.
 * Team 0 (blue) lives on +Z, team 1 (red) on -Z. `m*` helpers add the
 * authored element and its 180° rotated twin (x,z) -> (-x,-z), so maps are fair.
 */
export class LevelBuilder {
  data: LevelData;

  constructor(halfX: number, halfZ: number, killY = -20) {
    this.data = {
      bounds: { minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ },
      boxes: [],
      ramps: [],
      pads: [],
      spawns: [],
      pickups: [],
      flags: [[0, 0, halfZ - 6], [0, 0, -halfZ + 6]],
      zone: { pos: [0, 0, 0], radius: 6 },
      killY,
      hotspots: [],
    };
  }

  static rot(p: V3): V3 {
    return [-p[0], p[1], -p[2]];
  }

  /** Raw box by min/max. */
  box(min: V3, max: V3, kind: string, extra: Partial<BoxDef> = {}): BoxDef {
    const b: BoxDef = { min: [...min] as V3, max: [...max] as V3, kind, ...extra };
    this.data.boxes.push(b);
    return b;
  }

  /** Box by centre XZ, size XZ, height, base y. */
  boxC(cx: number, cz: number, sx: number, sz: number, h: number, kind: string, y0 = 0, extra: Partial<BoxDef> = {}): BoxDef {
    return this.box([cx - sx / 2, y0, cz - sz / 2], [cx + sx / 2, y0 + h, cz + sz / 2], kind, extra);
  }

  /** Mirrored box pair. Returns [original, twin]. */
  mBoxC(cx: number, cz: number, sx: number, sz: number, h: number, kind: string, y0 = 0, extra: Partial<BoxDef> = {}, extraTwin: Partial<BoxDef> = {}): [BoxDef, BoxDef] {
    const a = this.boxC(cx, cz, sx, sz, h, kind, y0, { ...extra, data: { ...(extra.data ?? {}), team: 0 } });
    const b = this.boxC(-cx, -cz, sx, sz, h, kind, y0, { ...extra, ...extraTwin, data: { ...(extra.data ?? {}), ...(extraTwin.data ?? {}), team: 1, mirrored: true } });
    return [a, b];
  }

  /** Ramp. rises from h0 to h1 along axis in direction dir. Footprint by centre/size. */
  ramp(cx: number, cz: number, sx: number, sz: number, axis: 'x' | 'z', dir: 1 | -1, h0: number, h1: number, kind = 'ramp', base = 0, extra: Partial<RampDef> = {}): RampDef {
    const r: RampDef = {
      min: [cx - sx / 2, base, cz - sz / 2],
      max: [cx + sx / 2, Math.max(h0, h1), cz + sz / 2],
      axis, dir, h0, h1, kind, ...extra,
    };
    this.data.ramps.push(r);
    return r;
  }

  mRamp(cx: number, cz: number, sx: number, sz: number, axis: 'x' | 'z', dir: 1 | -1, h0: number, h1: number, kind = 'ramp', base = 0, extra: Partial<RampDef> = {}): [RampDef, RampDef] {
    const a = this.ramp(cx, cz, sx, sz, axis, dir, h0, h1, kind, base, extra);
    const b = this.ramp(-cx, -cz, sx, sz, axis, (dir === 1 ? -1 : 1) as 1 | -1, h0, h1, kind, base, extra);
    return [a, b];
  }

  pad(pos: V3, target: V3, mirror = true) {
    this.data.pads.push({ pos, target });
    if (mirror) this.data.pads.push({ pos: LevelBuilder.rot(pos), target: LevelBuilder.rot(target) });
  }

  /** Blue spawn (mirrored automatically to red). yaw 0 faces -Z (toward the enemy). */
  spawn(x: number, y: number, z: number, yaw = 0) {
    this.data.spawns.push({ pos: [x, y, z], yaw, team: 0 });
    this.data.spawns.push({ pos: [-x, y, -z], yaw: yaw + Math.PI, team: 1 });
  }

  pickup(type: PickupType, x: number, y: number, z: number, mirror = true) {
    this.data.pickups.push({ pos: [x, y, z], type });
    if (mirror && (x !== 0 || z !== 0)) this.data.pickups.push({ pos: [-x, y, -z], type });
  }

  hotspot(x: number, y: number, z: number, mirror = true) {
    this.data.hotspots!.push([x, y, z]);
    if (mirror) this.data.hotspots!.push([-x, y, -z]);
  }

  flags(blue: V3) {
    this.data.flags = [blue, LevelBuilder.rot(blue)];
  }

  zone(pos: V3, radius: number) {
    this.data.zone = { pos, radius };
  }

  /** Solid floor slab covering the bounds (top at y=0). */
  floor(kind = 'floor', pad = 0) {
    const b = this.data.bounds;
    this.box([b.minX - pad, -2, b.minZ - pad], [b.maxX + pad, 0, b.maxZ + pad], kind);
  }

  /** Perimeter walls (thickness t, height h) just inside bounds. */
  perimeter(h: number, t = 1, kind = 'perimeter', extra: Partial<BoxDef> = {}) {
    const b = this.data.bounds;
    this.box([b.minX, 0, b.minZ], [b.maxX, h, b.minZ + t], kind, extra);
    this.box([b.minX, 0, b.maxZ - t], [b.maxX, h, b.maxZ], kind, extra);
    this.box([b.minX, 0, b.minZ + t], [b.minX + t, h, b.maxZ - t], kind, extra);
    this.box([b.maxX - t, 0, b.minZ + t], [b.maxX, h, b.maxZ - t], kind, extra);
  }

  build(): LevelData {
    return this.data;
  }
}
