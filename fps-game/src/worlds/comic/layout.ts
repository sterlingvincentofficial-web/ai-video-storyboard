import { LevelBuilder } from '../builder';
import type { LevelData } from '../../world/Level';
import { mulberry } from '../../core/utils';

/**
 * Ink City collision layout. Blue base at +Z, red at -Z; the blue half is authored and
 * mirrored by 180° rotation. Playable street area: x ∈ [-30, 30], z ∈ [-44, 44].
 *
 *  - Main avenue (x ∈ [-8, 8]) down the middle with a median (newsstand + poster column).
 *  - Two city blocks per half split the avenue from the side alleys (x ≈ ±21..±30):
 *    a low corner shop with a walkable roof (fire-escape stairs + jump pad, zapper perch)
 *    and a tall brownstone with a loading dock (1.2m ledge) on the alley side.
 *  - Central intersection with a roundabout island, hero statue (KOTH) and a crashed billboard.
 */

/** Car collision: a body you can hop onto plus a smaller cabin. */
function car(L: LevelBuilder, cx: number, cz: number, alongX: boolean, data: Record<string, unknown>) {
  const d = { ...data, alongX };
  if (data.van) {
    // van: tall cargo box + lower cab. `front` = +1/-1 along the car axis.
    const f = (data.front as number) ?? 1;
    const wid = 2.1;
    const cargo = [-2.6, 0.9], cab = [0.9, 2.6];
    const seg = (a: number, b: number, h: number, kind: string, extra: Record<string, unknown>) => {
      const c = ((a + b) / 2) * f, len = b - a;
      L.mBoxC(alongX ? cx + c : cx, alongX ? cz : cz + c, alongX ? len : wid, alongX ? wid : len, h, kind, 0, extra);
    };
    seg(cargo[0], cargo[1], 2.5, 'car', { data: { ...d, cx, cz } });
    seg(cab[0], cab[1], 1.85, 'carcab', { invisible: true });
    return;
  }
  const len = 4.4, wid = 1.9;
  L.mBoxC(cx, cz, alongX ? len : wid, alongX ? wid : len, 1.0, 'car', 0, { data: d });
  L.mBoxC(cx, cz, alongX ? 2.3 : 1.6, alongX ? 1.6 : 2.3, 0.55, 'carcab', 1.0, { invisible: true });
}

export const SHOP = { x0: 11, x1: 20, z0: 13, z1: 27, h: 3.6 };
export const BROWN = { x0: -20, x1: -11, z0: 13, z1: 27, h: 10 };

export function layout(): LevelData {
  const L = new LevelBuilder(34, 47);
  L.floor('floor', 12);

  // ---------------------------------------------------------------- perimeter buildings
  const r = mulberry(1938);
  let z = -47;
  let i = 0;
  while (z < 47 - 0.01) {
    let w = 9 + Math.floor(r() * 5);
    if (47 - z < w + 7) w = 47 - z;
    const h = 11 + Math.floor(r() * 8);
    L.mBoxC(34, z + w / 2, 8, w, h, 'bldg', 0, {
      data: { tone: i % 4, tower: r() > 0.45, fire: r() > 0.3, seed: i * 31 + 7, bill: false },
    });
    z += w;
    i++;
  }
  // back rows behind the bases (the HQ sits in the middle)
  const back: [number, number, number][] = [[-30, -19, 13], [-19, -10, 11], [10, 19, 12], [19, 30, 15]];
  back.forEach(([a, b, h], k) => {
    L.mBoxC((a + b) / 2, 48, b - a, 8, h, 'bldg', 0, { data: { tone: (k + 2) % 4, tower: k % 2 === 0, fire: k !== 1, seed: 300 + k * 17, bill: k === 3 } });
  });
  L.mBoxC(0, 48, 20, 8, 18, 'hq');

  // ---------------------------------------------------------------- sidewalks (0.15 curbs)
  L.mBoxC(28.75, 0, 2.5, 88, 0.15, 'sidewalk');
  L.mBoxC(0, 42.75, 55, 2.5, 0.15, 'sidewalk');
  L.mBoxC(14.75, 20, 13.5, 17, 0.15, 'sidewalk'); // around the shop block: x∈[8,21.5] z∈[11.5,28.5]
  L.mBoxC(-14.75, 20, 13.5, 17, 0.15, 'sidewalk'); // around the brownstone

  // ---------------------------------------------------------------- shop block + roof perch
  const S = SHOP;
  L.mBoxC((S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2, S.x1 - S.x0, S.z1 - S.z0, S.h, 'shop');
  const P = 0.8, T = 0.4;
  L.mBoxC(S.x0 + T / 2, (S.z0 + S.z1) / 2, T, S.z1 - S.z0, P, 'parapet', S.h); // avenue side
  L.mBoxC((S.x0 + T + S.x1) / 2, S.z0 + T / 2, S.x1 - S.x0 - T, T, P, 'parapet', S.h); // centre side
  L.mBoxC((S.x0 + T + S.x1) / 2, S.z1 - T / 2, S.x1 - S.x0 - T, T, P, 'parapet', S.h); // base side
  L.mBoxC(S.x1 - T / 2, (S.z0 + T + 15.4) / 2, T, 15.4 - S.z0 - T, P, 'parapet', S.h); // alley side (short)
  L.mBoxC(S.x1 - T / 2, (20.4 + S.z1 - T) / 2, T, S.z1 - T - 20.4, P, 'parapet', S.h); // alley side (long)
  // stair bulkhead with a water tower on top (cover on the roof)
  L.mBoxC(18.1, 24.4, 3.0, 4.0, 2.6, 'bulkhead', S.h);
  L.mBoxC(12.2, 25.7, 0.9, 0.9, 0.5, 'vent', S.h);
  L.mBoxC(14.6, 22.2, 1.6, 1.2, 0.45, 'skylight', S.h);
  // fire-escape stairs up the alley side: x∈[20,23], z∈[16,28], rising toward the centre
  L.mRamp(21.5, 22, 3, 12, 'z', -1, 0, S.h, 'fescape');
  for (let k = 0; k < 12; k++) {
    const top = S.h - (k + 0.5) * (S.h / 12) + 0.95;
    L.mBoxC(22.9, 16 + k + 0.5, 0.2, 1, top, 'srail', 0, { invisible: true });
  }
  // jump pad from the avenue sidewalk up onto the roof
  L.pad([9.4, 0.15, 21.5], [14.2, S.h, 21.5]);

  // ---------------------------------------------------------------- brownstone + loading dock
  const B = BROWN;
  L.mBoxC((B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2, B.x1 - B.x0, B.z1 - B.z0, B.h, 'brown');
  L.mBoxC(-21.75, 20, 3.5, 10, 1.2, 'dock'); // x∈[-23.5,-20] z∈[15,25]
  L.mRamp(-21.75, 26.5, 3.5, 3, 'z', -1, 0, 1.2, 'dockramp');
  L.mBoxC(-22.6, 16.2, 1.3, 1.3, 1.3, 'crate', 1.2);
  L.mBoxC(-22.7, 17.6, 1.1, 1.1, 1.1, 'crate', 1.2);
  // stoop on the avenue side
  L.mBoxC(-10.45, 20, 1.1, 2.6, 0.45, 'stoop1');

  // ---------------------------------------------------------------- avenue (blue half)
  L.mBoxC(0, 22.5, 2.6, 11, 0.15, 'median'); // x∈[-1.3,1.3] z∈[17,28]
  L.mBoxC(0, 25.2, 2.4, 2.0, 2.6, 'newsstand');
  L.mBoxC(0, 19.2, 1.3, 1.3, 3.2, 'column');
  car(L, 6.9, 15.8, false, { color: 'taxi' });
  car(L, -6.9, 22.8, false, { color: 'teal' });
  // double-parked delivery van breaking the long avenue sightline
  car(L, 5.0, 34.5, false, { van: true, color: 'van', front: -1 });
  L.mBoxC(-4.4, 30.6, 3.4, 0.7, 1.1, 'barrier');
  L.mBoxC(-9.8, 33.5, 0.7, 3.4, 1.1, 'barrier');
  // street furniture (poles are thin but solid)
  L.mBoxC(8.6, 12.6, 0.3, 0.3, 5.6, 'traffic', 0, { data: { arm: [-1, 0] } });
  L.mBoxC(-8.6, 12.6, 0.3, 0.3, 5.6, 'traffic', 0, { data: { arm: [1, 0] } });
  L.mBoxC(8.6, 26.5, 0.3, 0.3, 5, 'lamp', 0, { data: { arm: [-1, 0] } });
  L.mBoxC(-8.6, 17.5, 0.3, 0.3, 5, 'lamp', 0, { data: { arm: [1, 0] } });
  L.mBoxC(9.0, 18.6, 0.45, 0.45, 0.85, 'hydrant');
  L.mBoxC(-8.9, 25.8, 0.8, 0.6, 1.3, 'mailbox');
  L.mBoxC(-24.2, 12.3, 0.45, 0.45, 0.85, 'hydrant');

  // ---------------------------------------------------------------- centre: roundabout + statue
  L.box([-7, 0, -7], [7, 0.3, 7], 'island');
  L.box([-1.2, 0, -1.2], [1.2, 2.6, 1.2], 'pedestal');
  L.box([-0.7, 2.6, -0.7], [0.7, 6.8, 0.7], 'statue', { invisible: true });
  L.mBoxC(4.5, 4.6, 3.0, 1.0, 1.15, 'hedge');
  L.mBoxC(-4.6, 4.5, 1.0, 3.0, 1.15, 'hedge');
  L.mBoxC(1.9, 6.0, 1.1, 1.1, 2.75, 'booth');
  L.mBoxC(6.3, -0.2, 0.3, 0.3, 5, 'lamp', 0, { data: { arm: [0, 1], globe: true } });
  // crashed rooftop billboard + wreck in the cross street
  L.mBoxC(-15.5, 3.2, 0.9, 6.4, 2.5, 'crashsign');
  car(L, 22.4, 6.8, true, { color: 'cream' });
  car(L, 13.6, -8.2, true, { color: 'purple' });
  L.mBoxC(-28.6, 2.6, 1.2, 2.2, 1.4, 'dumpster');
  car(L, -25.5, 8.6, false, { van: true, color: 'van3', front: -1 });
  L.mBoxC(-9.6, 9.0, 1.2, 1.2, 1.2, 'crate');
  L.mBoxC(-10.4, 7.9, 1.0, 1.0, 1.0, 'crate');

  // ---------------------------------------------------------------- alleys (blue half)
  // right alley: dumpster + trash near the stairs; delivery van near the base
  L.mBoxC(28.5, 22.5, 1.3, 2.4, 1.45, 'dumpster');
  L.mBoxC(28.9, 25.0, 0.7, 0.7, 1.0, 'trash');
  L.mBoxC(28.9, 18.8, 0.7, 0.7, 1.0, 'trash');
  car(L, 25.4, 37.0, false, { van: true, color: 'van2', front: -1 });
  L.mBoxC(24.4, 29.6, 1.2, 1.2, 1.2, 'crate');
  // left alley: construction hoarding with posters, trash
  L.mBoxC(-27.1, 33.0, 4.8, 0.4, 2.6, 'hoarding');
  L.mBoxC(-28.9, 13.8, 0.7, 0.7, 1.0, 'trash');
  L.mBoxC(-17.5, 31.2, 1.2, 1.2, 1.2, 'crate');
  L.mBoxC(-16.3, 31.0, 1.0, 1.0, 1.0, 'crate');

  // ---------------------------------------------------------------- base
  L.mBoxC(0, 42.25, 14, 3.5, 1.2, 'stoop'); // x∈[-7,7] z∈[40.5,44]
  L.mRamp(-8.5, 42.25, 3, 3.5, 'x', 1, 0, 1.2, 'steps');
  L.mRamp(8.5, 42.25, 3, 3.5, 'x', -1, 0, 1.2, 'steps');
  car(L, -16.5, 36.2, true, { color: 'police' });
  L.mBoxC(20.5, 41.2, 0.45, 0.45, 0.85, 'hydrant');
  L.mBoxC(-11.6, 41.0, 0.3, 0.3, 5, 'lamp', 0, { data: { arm: [0, -1] } });
  L.mBoxC(11.6, 41.0, 0.3, 0.3, 5, 'lamp', 0, { data: { arm: [0, -1] } });

  // ---------------------------------------------------------------- gameplay points
  const sp: [number, number, number][] = [
    [-23, 0, 38.5], [-11.5, 0, 37], [-4, 1.2, 42.3], [0, 1.2, 42.6],
    [4, 1.2, 42.3], [11, 0, 38], [17, 0, 39], [22, 0, 36],
  ];
  for (const [x, y, zz] of sp) L.spawn(x, y, zz, 0);

  L.pickup('health', -21.75, 1.2, 21.5);
  L.pickup('health', 25.5, 0, 9);
  L.pickup('health', -4.5, 0, 16);
  L.pickup('ammo', 0, 0.15, 17.9);
  L.pickup('ammo', 25.8, 0, 31.5);
  L.pickup('ammo', -13.5, 0, 32.5);
  L.pickup('boomer', 0, 0.3, 4.4);
  L.pickup('zapper', 14.4, S.h, 17.2);
  L.pickup('overcharge', -24.5, 0, 1.5);

  L.flags([0, 0, 36.5]);
  L.zone([0, 0.3, 0], 7);
  for (const p of [[15.5, S.h, 21], [-21.75, 1.2, 18.5], [5.2, 0.3, 1.5], [-23.2, 0, 3.2], [4.5, 0, 22], [25.2, 0, 20]] as const) L.hotspot(p[0], p[1], p[2]);
  return L.build();
}
