export type WeaponId = 'blaster' | 'scatter' | 'boomer' | 'zapper';

export interface WeaponDef {
  id: WeaponId;
  slot: number;
  name: string;
  damage: number;
  headMult: number;
  /** shots per second */
  rate: number;
  auto: boolean;
  pellets: number;
  /** hip spread (radians, cone half-angle) */
  spread: number;
  /** spread while aiming */
  aimSpread: number;
  mag: number;
  reserve: number;
  reload: number;
  range: number;
  /** damage falloff start/end distances (hitscan) */
  falloff: [number, number];
  projectile?: { speed: number; gravity: number; splash: number; splashDamage: number; knockback: number; radius: number };
  zoomFov?: number;
  recoil: number;
  /** Bots prefer to use this weapon within this distance band. */
  botRange: [number, number];
  /** Screen shake per shot */
  kick: number;
  color: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  blaster: {
    id: 'blaster', slot: 0, name: 'Blaster',
    damage: 14, headMult: 1.8, rate: 9, auto: true, pellets: 1,
    spread: 0.022, aimSpread: 0.008, mag: 30, reserve: 150, reload: 1.35, range: 120,
    falloff: [25, 60], recoil: 0.012, botRange: [6, 45], kick: 0.08, color: 0x39c0ff,
  },
  scatter: {
    id: 'scatter', slot: 1, name: 'Scatter',
    damage: 11, headMult: 1.4, rate: 1.25, auto: false, pellets: 9,
    spread: 0.085, aimSpread: 0.065, mag: 6, reserve: 30, reload: 1.8, range: 45,
    falloff: [8, 22], recoil: 0.06, botRange: [0, 12], kick: 0.35, color: 0xffb000,
  },
  boomer: {
    id: 'boomer', slot: 2, name: 'Boomer',
    damage: 90, headMult: 1, rate: 1.1, auto: false, pellets: 1,
    spread: 0, aimSpread: 0, mag: 4, reserve: 12, reload: 2.1, range: 200,
    falloff: [999, 999], recoil: 0.05, botRange: [5, 30], kick: 0.4, color: 0xff5ab4,
    projectile: { speed: 32, gravity: 0, splash: 4.2, splashDamage: 75, knockback: 13, radius: 0.28 },
  },
  zapper: {
    id: 'zapper', slot: 3, name: 'Zapper',
    damage: 75, headMult: 2.2, rate: 0.85, auto: false, pellets: 1,
    spread: 0.04, aimSpread: 0.0, mag: 5, reserve: 20, reload: 2.3, range: 250,
    falloff: [999, 999], recoil: 0.08, botRange: [20, 120], kick: 0.3, color: 0x9dff4a,
    zoomFov: 30,
  },
};

export const WEAPON_ORDER: WeaponId[] = ['blaster', 'scatter', 'boomer', 'zapper'];

export interface GrenadeDef {
  fuse: number;
  splash: number;
  damage: number;
  knockback: number;
  throwSpeed: number;
}

export const GRENADE: GrenadeDef = { fuse: 1.7, splash: 4.5, damage: 85, knockback: 11, throwSpeed: 19 };

export class WeaponSlot {
  owned = false;
  mag = 0;
  reserve = 0;
  constructor(public def: WeaponDef) {}
  refill() {
    this.mag = this.def.mag;
    this.reserve = this.def.reserve;
  }
  give() {
    if (!this.owned) {
      this.owned = true;
      this.refill();
      return true;
    }
    const before = this.reserve;
    this.reserve = Math.min(this.def.reserve, this.reserve + this.def.mag * 2);
    return this.reserve > before;
  }
}
