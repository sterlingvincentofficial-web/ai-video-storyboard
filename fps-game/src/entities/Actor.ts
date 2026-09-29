import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER, WeaponSlot, type WeaponId } from './Weapons';
import type { CharacterModel } from '../render/Character';
import type { Collision } from '../world/Level';

export const RADIUS = 0.45;
export const HEIGHT = 1.7;
export const EYE = 1.55;
export const STEP_UP = 0.6;

export interface Physics {
  gravity: number;
  walk: number;
  sprint: number;
  jump: number;
  doubleJump: number;
}

export const BASE_PHYSICS: Physics = { gravity: 22, walk: 7, sprint: 10, jump: 7.6, doubleJump: 6.8 };

export interface Stats {
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  caps: number;
  returns: number;
  damage: number;
  streak: number;
  bestStreak: number;
  headshots: number;
  zoneTime: number;
}

let nextId = 1;

export class Actor {
  id = nextId++;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  jumpsUsed = 0;
  coyote = 0;
  health = 100;
  maxHealth = 100;
  alive = false;
  respawnTimer = 0;
  spawnShield = 0;
  slots: WeaponSlot[];
  cur = 0;
  prevSlot = 1;
  fireCd = 0;
  reloadT = 0;
  switchT = 0;
  grenades = 2;
  grenadeCd = 0;
  overcharge = 0;
  stats: Stats = { kills: 0, deaths: 0, assists: 0, score: 0, caps: 0, returns: 0, damage: 0, streak: 0, bestStreak: 0, headshots: 0, zoneTime: 0 };
  damagers = new Map<number, number>();
  lastAttacker: Actor | null = null;
  lastDamageTime = -99;
  lastFireTime = -99;
  model: CharacterModel | null = null;
  /** Flag team index being carried, or -1. */
  carrying = -1;
  /** Input intents (filled by player controller or bot brain). */
  wish = new THREE.Vector2(); // x = strafe right, y = forward (local)
  wantJump = false;
  wantSprint = false;
  wantFire = false;
  wantAim = false;
  aiming = false;
  landed = 0; // landing impact speed this frame
  deathTime = 0;
  killer: Actor | null = null;
  hat = 'default';
  /** Multikill tracking */
  lastKillTime = -99;
  multi = 0;
  airTime = 0;
  stepAcc = 0;

  constructor(public name: string, public team: 0 | 1, public isPlayer = false) {
    this.slots = WEAPON_ORDER.map((id) => new WeaponSlot(WEAPONS[id]));
  }

  get weapon() {
    return this.slots[this.cur];
  }

  get eye() {
    return this.pos.y + EYE;
  }

  resetLoadout(instagib = false) {
    for (const s of this.slots) {
      s.owned = false;
      s.mag = 0;
      s.reserve = 0;
    }
    if (instagib) {
      this.slots[3].owned = true;
      this.slots[3].mag = 999;
      this.slots[3].reserve = 999;
      this.cur = 3;
    } else {
      this.slots[0].give();
      this.slots[1].give();
      this.cur = 0;
      this.prevSlot = 1;
    }
    this.grenades = 2;
    this.reloadT = 0;
    this.switchT = 0;
    this.fireCd = 0;
  }

  owns(id: WeaponId) {
    return this.slots[WEAPONS[id].slot].owned;
  }

  switchTo(slot: number) {
    if (slot === this.cur || !this.slots[slot]?.owned) return false;
    this.prevSlot = this.cur;
    this.cur = slot;
    this.reloadT = 0;
    this.switchT = 0.32;
    return true;
  }

  cycle(dir: number) {
    for (let i = 1; i <= 4; i++) {
      const s = (this.cur + dir * i + 8) % 4;
      if (this.slots[s].owned) return this.switchTo(s);
    }
    return false;
  }

  startReload() {
    const w = this.weapon;
    if (this.reloadT > 0 || w.mag >= w.def.mag || w.reserve <= 0) return false;
    this.reloadT = w.def.reload;
    return true;
  }

  /** Movement + physics step. Returns footstep/landing info. */
  move(dt: number, col: Collision, phys: Physics) {
    const sprinting = this.wantSprint && this.wish.y > 0.3 && !this.aiming;
    const maxSpeed = (sprinting ? phys.sprint : phys.walk) * (this.aiming ? 0.6 : 1) * (this.carrying >= 0 ? 0.92 : 1);
    // wish direction in world space
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const wx = this.wish.x * cy + this.wish.y * -sy;
    const wz = this.wish.x * -sy + this.wish.y * -cy;
    const wl = Math.hypot(wx, wz);
    const tx = wl > 0 ? (wx / Math.max(1, wl)) * maxSpeed : 0;
    const tz = wl > 0 ? (wz / Math.max(1, wl)) * maxSpeed : 0;
    const accel = this.onGround ? 60 : 16;
    const dvx = tx - this.vel.x, dvz = tz - this.vel.z;
    const dl = Math.hypot(dvx, dvz);
    // in the air: only accelerate, don't brake hard (preserve knockback momentum)
    if (dl > 0) {
      let a = accel * dt;
      if (!this.onGround && wl < 0.01) a = 2 * dt;
      const f = Math.min(1, a / dl);
      this.vel.x += dvx * f;
      this.vel.z += dvz * f;
    }

    // jumping
    if (this.onGround) { this.coyote = 0.1; this.jumpsUsed = 0; }
    else this.coyote -= dt;
    let jumped = 0;
    if (this.wantJump) {
      if (this.coyote > 0 && this.jumpsUsed === 0) {
        this.vel.y = phys.jump;
        this.jumpsUsed = 1;
        this.coyote = 0;
        jumped = 1;
      } else if (this.jumpsUsed < 2) {
        this.vel.y = phys.doubleJump;
        this.jumpsUsed = 2;
        // small directional boost for double jump
        if (wl > 0) {
          this.vel.x += (wx / Math.max(1, wl)) * 1.5;
          this.vel.z += (wz / Math.max(1, wl)) * 1.5;
        }
        jumped = 2;
      }
      this.wantJump = false;
    }
    this.vel.y -= phys.gravity * dt;
    if (this.vel.y < -40) this.vel.y = -40;
    const wasGround = this.onGround;
    const r = col.move(this.pos, this.vel, dt, RADIUS, HEIGHT, STEP_UP, wasGround && jumped === 0);
    this.onGround = r.grounded;
    this.landed = !wasGround && r.grounded ? r.landedSpeed : 0;
    if (this.onGround) this.airTime = 0;
    else this.airTime += dt;
    // keep inside bounds
    const b = col.bounds;
    this.pos.x = Math.max(b.minX + RADIUS, Math.min(b.maxX - RADIUS, this.pos.x));
    this.pos.z = Math.max(b.minZ + RADIUS, Math.min(b.maxZ - RADIUS, this.pos.z));
    return { jumped, sprinting };
  }

  horizSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** Hit test a ray against this actor. Returns distance and whether it was a headshot. */
  rayHit(o: THREE.Vector3, d: THREE.Vector3, maxT: number, headScale = 1): { t: number; head: boolean } | null {
    let best: { t: number; head: boolean } | null = null;
    const test = (cx: number, cy: number, cz: number, r: number, head: boolean) => {
      const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
      const b = ox * d.x + oy * d.y + oz * d.z;
      const c = ox * ox + oy * oy + oz * oz - r * r;
      const disc = b * b - c;
      if (disc < 0) return;
      const t = -b - Math.sqrt(disc);
      if (t < 0 || t > maxT) return;
      if (!best || t < best.t) best = { t, head };
    };
    const p = this.pos;
    test(p.x, p.y + 0.45, p.z, 0.46, false);
    test(p.x, p.y + 1.0, p.z, 0.46, false);
    test(p.x, p.y + 1.56 + (headScale - 1) * 0.3, p.z, 0.34 * headScale, true);
    return best;
  }

  /** Sphere overlap (for projectiles & splash). Distance from point to body centre line. */
  distTo(p: THREE.Vector3) {
    const y = Math.max(this.pos.y + 0.4, Math.min(this.pos.y + 1.5, p.y));
    return Math.hypot(p.x - this.pos.x, p.y - y, p.z - this.pos.z);
  }

  center(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.0, this.pos.z);
  }

  head(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.56, this.pos.z);
  }
}
