import type { BoxDef, LevelData } from '../../world/Level';
import { LevelBuilder } from '../builder';

/**
 * Neon Rooftops layout.
 *
 * Connected city rooftops at different heights separated by deadly alleys (killY).
 * Blue lives on +Z, red on -Z. Everything is authored for the blue half and mirrored
 * by 180° rotation (x,z) -> (-x,-z). Things exactly on the centre are authored once.
 *
 *   BASE (y 5) + WINGS (y 3.5)          z 33..46   (back tower + team sign behind)
 *   ── base alley ──                    z 28..33   (bridges: centre ramp, left ramp, right deck)
 *   LT (y 2)   | PLAZA (y 1) |  RT (y 3.5, zapper perch 7.5)
 *   x -33..-18 | x -13..13   |  x 18..33
 *   side alleys x ±13..±18 (bridges + jump pad), side-lane alleys between LT and the red RT
 */

export const H = {
  plaza: 1,
  dais: 2,
  lt: 2,
  rt: 3.5,
  wing: 3.5,
  base: 5,
  perch: 7.5,
};

/** Bottom of the roof collision slabs (just below killY). */
const SLAB = -16;
const RAIL_H = 1.1;
const RAIL_T = 0.2;

export function layout(): LevelData {
  const L = new LevelBuilder(36, 50, -15);

  /** Mirrored box by min/max corners. */
  const mb = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, kind: string, data: Record<string, unknown> = {}, extra: Partial<BoxDef> = {}) => {
    L.box([x0, y0, z0], [x1, y1, z1], kind, { ...extra, data: { ...data, team: 0 } });
    L.box([-x1, y0, -z1], [-x0, y1, -z0], kind, { ...extra, data: { ...data, team: 1, mirrored: true } });
  };
  /** Single (self-symmetric) box. */
  const sb = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, kind: string, data: Record<string, unknown> = {}, extra: Partial<BoxDef> = {}) => {
    L.box([x0, y0, z0], [x1, y1, z1], kind, { ...extra, data: { ...data, team: -1 } });
  };

  /** Planter with a synthwave palm: planter box + slim trunk collider. */
  const planter = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    mb(x0, z0, x1, z1, y, y + 0.8, 'planter');
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    mb(cx - 0.22, cz - 0.22, cx + 0.22, cz + 0.22, y + 0.8, y + 5, 'trunk');
  };

  // ---------------------------------------------------------------- roofs
  sb(-13, -28, 13, 28, SLAB, H.plaza, 'roof', { floor: 'plaza' });
  mb(-14, 33, 14, 46, SLAB, H.base, 'roof', { floor: 'base' });
  mb(-33, 33, -14, 46, SLAB, H.wing, 'roof', { floor: 'team' });
  mb(14, 33, 33, 46, SLAB, H.wing, 'roof', { floor: 'team' });
  mb(-33, -4, -18, 28, SLAB, H.lt, 'roof', { floor: 'team' });
  mb(18, 7, 33, 28, SLAB, H.rt, 'roof', { floor: 'team' });

  // central dais (KOTH) + side ramps
  sb(-5, -5, 5, 5, H.plaza, H.dais, 'dais');
  L.mRamp(6.5, 0, 3, 4, 'x', -1, H.plaza, H.dais, 'steps', H.plaza);

  // back tower behind each base (team sign) & tall neighbour building beside LT
  mb(-14, 46, 14, 49, SLAB, 14.5, 'tower');
  mb(-36, 6, -33, 24, SLAB, 13, 'neighbour');

  // zapper perch: billboard catwalk on RT
  mb(25, 20, 33, 28, H.rt, H.perch, 'perch');
  L.mRamp(28, 15, 4, 10, 'z', 1, H.rt, H.perch, 'steps', H.rt);
  mb(32.4, 20, 33, 28, H.perch, 12.5, 'bigboard', { slot: 'vibes', face: 'nx' });

  // wing <-> base ramps (+ a crate step)
  L.mRamp(-17, 40, 6, 4, 'x', 1, H.wing, H.base, 'steps', H.wing);
  L.mRamp(17, 40, 6, 4, 'x', -1, H.wing, H.base, 'steps', H.wing);

  // ---------------------------------------------------------------- bridges
  // B1 centre: base -> plaza (long sloped catwalk)
  L.mRamp(0, 26.5, 5, 13, 'z', 1, H.plaza, H.base, 'bridge', H.plaza);
  // B2 left wing -> LT
  L.mRamp(-26, 28.5, 4, 9, 'z', 1, H.lt, H.wing, 'bridge', H.lt);
  // B3 right wing -> RT (flat deck)
  mb(19, 28, 23, 33, H.rt - 0.6, H.rt, 'deck');
  // B4 LT -> plaza
  L.mRamp(-14, 11, 8, 4, 'x', -1, H.plaza, H.lt, 'bridge', H.plaza);
  // B5 RT -> plaza
  L.mRamp(13.5, 19, 9, 4, 'x', 1, H.plaza, H.rt, 'bridge', H.plaza);
  // B6 side lane: LT -> red RT across the lane alley
  L.mRamp(-26, -2.5, 4, 9, 'z', -1, H.lt, H.rt, 'bridge', H.lt);

  // ---------------------------------------------------------------- railings
  // flat rail along x (z fixed) or along z (x fixed); `inside` = which side of the edge the roof is
  const railX = (x0: number, x1: number, z: number, y: number, inside: 1 | -1, kind = 'rail') => {
    const za = inside > 0 ? z : z - RAIL_T, zb = inside > 0 ? z + RAIL_T : z;
    mb(x0, za, x1, zb, y, y + RAIL_H, kind, { axis: 'x' });
  };
  const railZ = (z0: number, z1: number, x: number, y: number, inside: 1 | -1, kind = 'rail') => {
    const xa = inside > 0 ? x : x - RAIL_T, xb = inside > 0 ? x + RAIL_T : x;
    mb(xa, z0, xb, z1, y, y + RAIL_H, kind, { axis: 'z' });
  };
  // sloped rail riding a ramp bridge (thin ramp)
  const railRampZ = (x: number, z0: number, z1: number, h0: number, h1: number, base: number, inside: 1 | -1) => {
    // h0 at z0, h1 at z1 (surface heights)
    const xa = inside > 0 ? x : x - RAIL_T;
    const lo = Math.min(h0, h1), hi = Math.max(h0, h1);
    const dir = (h1 > h0 ? 1 : -1) as 1 | -1;
    L.mRamp(xa + RAIL_T / 2, (z0 + z1) / 2, RAIL_T, z1 - z0, 'z', dir, lo + RAIL_H, hi + RAIL_H, 'railRamp', base);
  };
  const railRampX = (z: number, x0: number, x1: number, h0: number, h1: number, base: number, inside: 1 | -1) => {
    const za = inside > 0 ? z : z - RAIL_T;
    const lo = Math.min(h0, h1), hi = Math.max(h0, h1);
    const dir = (h1 > h0 ? 1 : -1) as 1 | -1;
    L.mRamp((x0 + x1) / 2, za + RAIL_T / 2, x1 - x0, RAIL_T, 'x', dir, lo + RAIL_H, hi + RAIL_H, 'railRamp', base);
  };
  const lerpH = (a: number, b: number, ha: number, hb: number, t: number) => ha + (hb - ha) * ((t - a) / (b - a));

  // base front (opening for B1)
  railX(-14, -2.5, 33, H.base, 1);
  railX(2.5, 14, 33, H.base, 1);
  // wings: front (openings for B2 / B3), back, outer
  railX(-33, -28, 33, H.wing, 1);
  railX(-24, -14, 33, H.wing, 1);
  railX(14, 19, 33, H.wing, 1);
  railX(23, 33, 33, H.wing, 1);
  railX(-33, -14, 46, H.wing, -1);
  railX(14, 33, 46, H.wing, -1);
  railZ(33, 46, -33, H.wing, 1);
  railZ(33, 46, 33, H.wing, -1);
  // LT edges
  railZ(3, 9, -18, H.lt, -1);
  railZ(13, 28, -18, H.lt, -1);
  railX(-33, -28, 28, H.lt, -1);
  railX(-24, -18, 28, H.lt, -1);
  railX(-33, -28, -4, H.lt, 1);
  railX(-24, -18, -4, H.lt, 1);
  railZ(-4, 6, -33, H.lt, 1);
  railZ(24, 28, -33, H.lt, 1);
  // RT edges
  railZ(7, 17, 18, H.rt, 1);
  railZ(21, 28, 18, H.rt, 1);
  railX(23, 25, 28, H.rt, -1);
  railX(18, 24, 7, H.rt, 1);
  railX(28, 33, 7, H.rt, 1);
  railZ(7, 20, 33, H.rt, -1);
  // perch edges (ramp opening x 26..30)
  railX(25, 26, 20, H.perch, 1);
  railX(30, 32.4, 20, H.perch, 1);
  railZ(20, 28, 25, H.perch, 1);
  railX(25, 32.4, 28, H.perch, -1);
  // plaza edges (open stretches near the centre are deliberate knock-off danger)
  railZ(6, 17, 13, H.plaza, -1);
  railZ(21, 28, 13, H.plaza, -1);
  railZ(6, 9, -13, H.plaza, 1);
  railZ(13, 28, -13, H.plaza, 1);
  railX(-13, -2.5, 28, H.plaza, -1);
  railX(2.5, 13, 28, H.plaza, -1);
  // bridge railings
  // B1: x ±2.5, surface 1 (z 20) -> 5 (z 33); rails from z 23
  railRampZ(-2.5, 23, 33, lerpH(20, 33, H.plaza, H.base, 23), H.base, H.plaza, 1);
  railRampZ(2.5, 23, 33, lerpH(20, 33, H.plaza, H.base, 23), H.base, H.plaza, -1);
  // B2: x -28..-24, surface 2 (z 24) -> 3.5 (z 33); rails over the alley
  railRampZ(-28, 27, 33, lerpH(24, 33, H.lt, H.wing, 27), H.wing, H.lt, 1);
  railRampZ(-24, 27, 33, lerpH(24, 33, H.lt, H.wing, 27), H.wing, H.lt, -1);
  // B3 deck rails
  railZ(28, 33, 19, H.rt, 1);
  railZ(28, 33, 23, H.rt, -1);
  // B4: z 9..13, surface 2 (x -18) -> 1 (x -10)
  railRampX(9, -18, -12.5, H.lt, lerpH(-18, -10, H.lt, H.plaza, -12.5), H.plaza, 1);
  railRampX(13, -18, -12.5, H.lt, lerpH(-18, -10, H.lt, H.plaza, -12.5), H.plaza, -1);
  // B5: z 17..21, surface 1 (x 9) -> 3.5 (x 18)
  railRampX(17, 12.5, 18, lerpH(9, 18, H.plaza, H.rt, 12.5), H.rt, H.plaza, 1);
  railRampX(21, 12.5, 18, lerpH(9, 18, H.plaza, H.rt, 12.5), H.rt, H.plaza, -1);
  // B6: x -28..-24, surface 3.5 (z -7) -> 2 (z 2)
  railRampZ(-28, -7, -3.5, H.rt, lerpH(-7, 2, H.rt, H.lt, -3.5), H.lt, 1);
  railRampZ(-24, -7, -3.5, H.rt, lerpH(-7, 2, H.rt, H.lt, -3.5), H.lt, -1);

  // ---------------------------------------------------------------- cover & props
  // plaza
  mb(-6, 13.6, 6, 14.4, H.plaza, 7.5, 'billboard', { slot: 'nights' });
  // speaker pylons beside the zone (break long base-to-base sight lines)
  mb(-12.6, -1.2, -10.2, 1.2, H.plaza, H.plaza + 7.5, 'pylon');
  mb(-12.7, 17.2, -11.8, 18.5, H.plaza, H.plaza + 2.3, 'vending', { face: 'px', v: 0 });
  mb(-12.7, 18.6, -11.8, 19.9, H.plaza, H.plaza + 2.3, 'vending', { face: 'px', v: 1 });
  mb(7.4, 8.6, 9.9, 10.2, H.plaza, H.plaza + 1.3, 'ac');
  mb(-7, 20.4, -5.4, 22, H.plaza, H.plaza + 1.6, 'crate');
  mb(-8.6, 20.8, -7.4, 22, H.plaza, H.plaza + 1.2, 'crate');
  mb(5.2, 22.5, 6.6, 23.9, H.plaza, H.plaza + 1.4, 'crate');
  mb(-9.5, 5.5, -8.5, 6.5, H.plaza, H.plaza + 0.9, 'vent');
  mb(9.2, 13.2, 10.2, 14.2, H.plaza, H.plaza + 0.9, 'vent');
  mb(-11.6, 25.4, -9.6, 26.8, H.plaza, H.plaza + 1.25, 'ac');
  planter(-11.4, 14.6, -10, 16, H.plaza);
  planter(10.6, 22.2, 12, 23.6, H.plaza);
  // neon lamp posts (thin collision posts)
  mb(-12.35, 27.1, -12.05, 27.4, H.plaza, H.plaza + 5.2, 'lamp', { face: 'px' });
  mb(12.05, 27.1, 12.35, 27.4, H.plaza, H.plaza + 5.2, 'lamp', { face: 'nx' });
  mb(3.6, 7.6, 7.2, 8.4, H.plaza, H.plaza + 1.1, 'lowwall');
  mb(-8.6, 10.6, -5.4, 11.4, H.plaza, H.plaza + 1.1, 'lowwall');
  // dais corner blocks
  mb(2.9, 2.9, 4.3, 4.3, H.dais, H.dais + 1, 'block');
  mb(-4.3, 2.9, -2.9, 4.3, H.dais, H.dais + 1, 'block');

  // LT
  mb(-26, 11, -22, 15, H.lt, H.lt + 3, 'hut', { face: 'px' });
  mb(-33, 8.6, -32.1, 9.9, H.lt, H.lt + 2.3, 'vending', { face: 'px', v: 0 });
  mb(-33, 10, -32.1, 11.3, H.lt, H.lt + 2.3, 'vending', { face: 'px', v: 1 });
  mb(-33, 11.4, -32.1, 12.7, H.lt, H.lt + 2.3, 'vending', { face: 'px', v: 0 });
  mb(-23.4, 20, -20.8, 21.6, H.lt, H.lt + 1.3, 'ac');
  mb(-31.4, 0.6, -29.4, 2.4, H.lt, H.lt + 1.25, 'ac');
  mb(-21.2, 3.6, -19.8, 5, H.lt, H.lt + 1.4, 'crate');
  mb(-29.6, 22, -28.2, 23.4, H.lt, H.lt + 1.4, 'crate');
  mb(-30, 16.5, -29, 17.5, H.lt, H.lt + 0.9, 'vent');
  mb(-20.2, 25, -19.2, 26, H.lt, H.lt + 0.9, 'vent');

  // RT
  mb(19.6, 11.6, 22.2, 13.2, H.rt, H.rt + 1.3, 'ac');
  mb(31.2, 18.2, 32.6, 19.6, H.rt, H.rt + 1.4, 'crate');
  mb(30.2, 18.6, 31.2, 19.6, H.rt, H.rt + 1, 'crate');
  mb(21.4, 22.6, 22.4, 23.6, H.rt, H.rt + 0.9, 'vent');

  // wings & base
  mb(-16, 43, -14, 45, H.wing, H.wing + 1, 'crate');
  planter(-31.6, 42.6, -30.2, 44, H.wing);
  mb(-19.6, 34.4, -18.2, 35.8, H.wing, H.wing + 1.4, 'crate');
  mb(28.4, 42.8, 30.8, 44.4, H.wing, H.wing + 1.3, 'ac');
  planter(17.8, 34.6, 19.2, 36, H.wing);
  mb(-10.2, 35.2, -8.6, 36.8, H.base, H.base + 1.2, 'crate');
  mb(8.6, 35.2, 10.2, 36.8, H.base, H.base + 1.2, 'crate');
  mb(-12.8, 44, -11.2, 45.6, H.base, H.base + 1.6, 'crate');
  planter(11.2, 44, 12.8, 45.6, H.base);
  mb(-6.4, 35.2, -3.4, 36, H.base, H.base + 1.1, 'lowwall');
  mb(3.4, 35.2, 6.4, 36, H.base, H.base + 1.1, 'lowwall');
  for (const x of [-8.1, -6.8, 6.8, 8.1]) mb(x - 0.55, 45.1, x + 0.55, 46, H.base, H.base + 2.1, 'arcade', { face: 'nz' });

  // ---------------------------------------------------------------- boundary (invisible, keeps players from escaping to decor)
  L.box([-36, SLAB, 48.5], [36, 40, 50], 'boundary', { invisible: true });
  L.box([-36, SLAB, -50], [36, 40, -48.5], 'boundary', { invisible: true });
  L.box([34.5, SLAB, -48.5], [36, 40, 48.5], 'boundary', { invisible: true });
  L.box([-36, SLAB, -48.5], [-34.5, 40, 48.5], 'boundary', { invisible: true });

  // ---------------------------------------------------------------- pads
  L.pad([8, H.plaza, 25], [8, H.base, 38]);
  L.pad([10.5, H.plaza, 3], [22, H.rt, 10.5]);

  // ---------------------------------------------------------------- gameplay points
  for (const [x, y, z] of [
    [-9, H.base, 43], [-4, H.base, 38], [4, H.base, 38], [9, H.base, 43],
    [-24, H.wing, 43], [-29, H.wing, 38], [24, H.wing, 43], [29, H.wing, 38],
  ] as const) L.spawn(x, y, z, 0);

  L.pickup('health', -9.5, H.plaza, 9);
  L.pickup('health', -30, H.lt, 15);
  L.pickup('health', 20.5, H.rt, 25.5);
  L.pickup('ammo', 6.5, H.plaza, 18);
  L.pickup('ammo', -22, H.wing, 38);
  L.pickup('ammo', 31.5, H.rt, 15);
  L.pickup('boomer', 0, H.dais, 2.2);
  L.pickup('zapper', 29, H.perch, 25);
  L.pickup('overcharge', -30.5, H.lt, -1.5);

  L.flags([0, H.base, 41]);
  L.zone([0, H.dais, 0], 6);
  for (const p of [[-24, H.lt, 18], [22, H.rt, 16], [-8, H.plaza, 16], [29, H.perch, 23]] as const) L.hotspot(p[0], p[1], p[2]);

  return L.build();
}
