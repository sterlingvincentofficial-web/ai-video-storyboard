import * as THREE from 'three';
import type { Actor } from './Actor';
import { EYE } from './Actor';
import type { Collision } from '../world/Level';
import type { NavGrid, NavPoint } from '../world/NavGrid';
import { WEAPONS, type WeaponId } from './Weapons';
import { angleDiff, clamp, rand, yawTo } from '../core/utils';

export interface Difficulty {
  name: string;
  reaction: number;
  aimError: number;
  turnSpeed: number;
  fov: number; // half-angle radians
  strafe: number;
  jumpiness: number;
  grenade: number;
  trackGain: number; // how fast aim error shrinks while tracking
  range: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { name: 'Easy', reaction: 0.7, aimError: 0.11, turnSpeed: 3.2, fov: 0.85, strafe: 0.35, jumpiness: 0.04, grenade: 0.03, trackGain: 0.6, range: 45 },
  { name: 'Normal', reaction: 0.45, aimError: 0.065, turnSpeed: 5.2, fov: 1.05, strafe: 0.7, jumpiness: 0.1, grenade: 0.08, trackGain: 1.0, range: 60 },
  { name: 'Hard', reaction: 0.3, aimError: 0.04, turnSpeed: 8, fov: 1.2, strafe: 1, jumpiness: 0.18, grenade: 0.12, trackGain: 1.6, range: 75 },
  { name: 'Insane', reaction: 0.17, aimError: 0.022, turnSpeed: 12, fov: 1.35, strafe: 1, jumpiness: 0.25, grenade: 0.16, trackGain: 2.4, range: 90 },
];

export type GoalKind = 'roam' | 'attack' | 'defend' | 'capture' | 'return' | 'escort' | 'hold' | 'chase';

export interface BotGoal {
  kind: GoalKind;
  pos: THREE.Vector3;
  radius: number;
  /** 0..1 — how much the bot should prioritise the goal over fighting. */
  urgency: number;
  follow?: Actor | null;
}

export interface PickupInfo {
  pos: THREE.Vector3;
  type: string;
  available: boolean;
}

export interface BotWorld {
  col: Collision;
  nav: NavGrid;
  actors: Actor[];
  time: number;
  goalFor(a: Actor): BotGoal;
  pickups(): PickupInfo[];
  killY: number;
  /** Time an actor last fired (for hearing). */
  headScale: number;
}

const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class BotBrain {
  target: Actor | null = null;
  lastKnown = new THREE.Vector3();
  lastKnownT = -99;
  private reactT = 0;
  private thinkT = Math.random() * 0.2;
  private path: NavPoint[] | null = null;
  private pathIdx = 0;
  private pathGoal = new THREE.Vector3(1e9, 0, 0);
  private repathT = 0;
  private goal: BotGoal | null = null;
  private goalT = 0;
  private wander = new THREE.Vector3();
  private wanderT = 0;
  private strafeDir = 1;
  private strafeT = 0;
  private errX = 0;
  private errY = 0;
  private errTX = 0;
  private errTY = 0;
  private errT = 0;
  private trackTime = 0;
  private stuckT = 0;
  private stuckRef = new THREE.Vector3();
  private stuckCount = 0;
  private switchCd = 0;
  private burstT = 0;
  private burstOff = 0;
  wantGrenade = false;
  private detour: PickupInfo | null = null;
  /** Personality tweaks. */
  private aggression = rand(0.3, 1);
  private preferHigh = Math.random() < 0.3;

  constructor(public actor: Actor, public diff: Difficulty) {}

  reset() {
    this.target = null;
    this.path = null;
    this.goal = null;
    this.detour = null;
    this.lastKnownT = -99;
    this.trackTime = 0;
    this.stuckCount = 0;
  }

  /** Called by the game when this bot takes damage. */
  onDamaged(from: Actor | null, time: number) {
    if (!from || from.team === this.actor.team) return;
    if (!this.target) {
      this.lastKnown.copy(from.pos);
      this.lastKnownT = time;
      // quicker reaction when shot
      if (this.canSee(from, null, true)) {
        this.target = from;
        this.reactT = this.diff.reaction * 0.6;
      }
    }
  }

  private canSee(t: Actor, w: BotWorld | null, ignoreFov = false): boolean {
    const a = this.actor;
    if (!t.alive) return false;
    const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > this.diff.range + (t.lastFireTime > (w?.time ?? 0) - 0.5 ? 20 : 0)) return false;
    if (!ignoreFov && d > 6) {
      const ang = Math.abs(angleDiff(a.yaw, yawTo(a.pos.x, a.pos.z, t.pos.x, t.pos.z)));
      if (ang > this.diff.fov) return false;
    }
    if (!w) return true;
    tmpA.set(a.pos.x, a.pos.y + EYE, a.pos.z);
    tmpB.set(t.pos.x, t.pos.y + 1.2, t.pos.z);
    if (w.col.lineOfSight(tmpA, tmpB)) return true;
    tmpB.y = t.pos.y + 1.6;
    return w.col.lineOfSight(tmpA, tmpB);
  }

  private perceive(w: BotWorld) {
    const a = this.actor;
    let best: Actor | null = null;
    let bestScore = Infinity;
    for (const t of w.actors) {
      if (t.team === a.team || !t.alive) continue;
      const d = a.pos.distanceTo(t.pos);
      const visible = this.canSee(t, w, t === this.target);
      if (!visible) {
        // hearing: gunfire nearby
        if (d < 28 && w.time - t.lastFireTime < 0.6 && !this.target) {
          this.lastKnown.copy(t.pos);
          this.lastKnownT = w.time;
        }
        continue;
      }
      let score = d;
      if (t === this.target) score -= 8; // stickiness
      if (t.carrying >= 0) score -= 25;
      if (t.lastAttacker === a) score -= 4;
      if (t.health < 40) score -= 6;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (best !== this.target) {
      if (best) {
        this.reactT = this.diff.reaction * rand(0.8, 1.25);
        this.trackTime = 0;
        this.errX = rand(-1, 1) * this.diff.aimError * 2.5;
        this.errY = rand(-1, 1) * this.diff.aimError * 1.5;
      }
      this.target = best;
    }
    if (this.target) {
      this.lastKnown.copy(this.target.pos);
      this.lastKnownT = w.time;
    }
  }

  private pickWeapon(dist: number) {
    const a = this.actor;
    if (this.switchCd > 0 || a.reloadT > 0) return;
    let best: WeaponId = a.weapon.def.id;
    let bestScore = -1;
    for (const s of a.slots) {
      if (!s.owned || s.mag + s.reserve <= 0) continue;
      const [lo, hi] = s.def.botRange;
      let sc = 0;
      if (dist >= lo && dist <= hi) sc = 2;
      else sc = 1 - Math.min(1, Math.abs(dist - (dist < lo ? lo : hi)) / 20);
      if (s.def.id === 'boomer' && dist < 4) sc -= 2; // don't blow yourself up
      if (s.def.id === 'zapper' && dist > 25) sc += 0.6;
      if (s.def.id === 'boomer') sc += 0.4;
      if (s.mag === 0) sc -= 0.5;
      if (sc > bestScore) { bestScore = sc; best = s.def.id; }
    }
    if (best !== a.weapon.def.id) {
      a.switchTo(WEAPONS[best].slot);
      this.switchCd = 1.6;
    }
  }

  private followPath(w: BotWorld, dest: THREE.Vector3, dt: number, force = false): THREE.Vector3 | null {
    const a = this.actor;
    this.repathT -= dt;
    if (force || this.repathT <= 0 || this.pathGoal.distanceToSquared(dest) > 9) {
      this.path = w.nav.findPath(a.pos, dest);
      this.pathIdx = 0;
      this.pathGoal.copy(dest);
      this.repathT = 1.2 + Math.random() * 0.8;
    }
    if (!this.path || this.path.length === 0) return null;
    while (this.pathIdx < this.path.length) {
      const p = this.path[this.pathIdx];
      const dx = p.x - a.pos.x, dz = p.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const reach = p.pad ? 0.5 : this.pathIdx === this.path.length - 1 ? 0.8 : 1.1;
      if (d < reach && Math.abs(p.y - a.pos.y) < 1.6) {
        this.pathIdx++;
        continue;
      }
      if (p.jump && d < 2.2 && a.onGround && p.y > a.pos.y + 0.5) a.wantJump = true;
      return tmpV.set(p.x, p.y, p.z);
    }
    return null;
  }

  update(dt: number, w: BotWorld) {
    const a = this.actor;
    if (!a.alive) return;
    this.switchCd -= dt;
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.18 + Math.random() * 0.08;
      this.perceive(w);
      if (this.target && !this.canSee(this.target, w, true)) {
        // lost sight
        this.target = null;
      }
    }
    if (this.target && !this.target.alive) this.target = null;
    this.reactT -= dt;

    // ----- goal selection
    this.goalT -= dt;
    if (!this.goal || this.goalT <= 0) {
      this.goal = w.goalFor(a);
      this.goalT = 1 + Math.random();
    }
    const goal = this.goal;

    // detour for pickups
    if (!this.detour || !this.detour.available) this.detour = null;
    if (!this.detour && Math.random() < dt * 2) {
      const needHealth = a.health < 55;
      const needAmmo = a.slots.every((s) => !s.owned || s.reserve + s.mag < s.def.mag);
      for (const p of w.pickups()) {
        if (!p.available) continue;
        const d = p.pos.distanceTo(a.pos);
        const want =
          (p.type === 'health' && needHealth && d < 35) ||
          (p.type === 'ammo' && needAmmo && d < 30) ||
          ((p.type === 'boomer' || p.type === 'zapper') && !a.owns(p.type as WeaponId) && d < 28) ||
          (p.type === 'overcharge' && d < 30);
        if (want && (goal.urgency < 0.85 || d < 10)) { this.detour = p; break; }
      }
    }

    // ----- where to move
    let dest: THREE.Vector3 | null = null;
    let combatMove = false;
    const t = this.target;
    const dist = t ? a.pos.distanceTo(t.pos) : 999;
    if (a.carrying >= 0) dest = goal.pos; // flag carrier: always run home
    else if (this.detour && (!t || a.health < 35)) dest = this.detour.pos;
    else if (t && goal.urgency < 0.9) combatMove = true;
    else if (!t && w.time - this.lastKnownT < 4 && goal.urgency < 0.6 && this.aggression > 0.4) dest = this.lastKnown;
    else dest = goal.pos;

    let steerX = 0, steerZ = 0;
    if (combatMove && t) {
      const [lo, hi] = a.weapon.def.botRange;
      const ideal = clamp((lo + hi) / 2, 4, 30);
      let fwd = 0;
      if (dist > hi + 3 || (dist > ideal && this.aggression > 0.6)) fwd = 1;
      else if (dist < lo) fwd = -1;
      // strafing
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        this.strafeT = rand(0.4, 1.4);
      }
      const ty = yawTo(a.pos.x, a.pos.z, t.pos.x, t.pos.z);
      const fx = -Math.sin(ty), fz = -Math.cos(ty);
      const rx = Math.cos(ty), rz = -Math.sin(ty);
      if (fwd === 1 && dist > hi + 3) {
        // chase along path so we don't hug walls
        const p = this.followPath(w, t.pos, dt);
        if (p) { steerX = p.x - a.pos.x; steerZ = p.z - a.pos.z; }
        else { steerX = fx; steerZ = fz; }
        const l = Math.hypot(steerX, steerZ) || 1;
        steerX = steerX / l + rx * this.strafeDir * 0.4 * this.diff.strafe;
        steerZ = steerZ / l + rz * this.strafeDir * 0.4 * this.diff.strafe;
      } else {
        steerX = fx * fwd * 0.8 + rx * this.strafeDir * this.diff.strafe;
        steerZ = fz * fwd * 0.8 + rz * this.strafeDir * this.diff.strafe;
      }
      if (goal.urgency > 0.5 && dest === null) {
        // keep drifting toward objective while fighting
        const p = this.followPath(w, goal.pos, dt);
        if (p) {
          const l = Math.hypot(p.x - a.pos.x, p.z - a.pos.z) || 1;
          steerX += ((p.x - a.pos.x) / l) * goal.urgency;
          steerZ += ((p.z - a.pos.z) / l) * goal.urgency;
        }
      }
      if (Math.random() < this.diff.jumpiness * dt * 3 && a.onGround) a.wantJump = true;
    } else if (dest) {
      // arrive: wander inside goal radius
      const dd = Math.hypot(dest.x - a.pos.x, dest.z - a.pos.z);
      let target = dest;
      if (dest === goal.pos && dd < goal.radius && !this.detour && a.carrying < 0) {
        this.wanderT -= dt;
        if (this.wanderT <= 0 || this.wander.distanceTo(goal.pos) > goal.radius + 1) {
          const c = w.nav.nearestWalkable(goal.pos.x + rand(-1, 1) * goal.radius, goal.pos.y, goal.pos.z + rand(-1, 1) * goal.radius, 4);
          if (c >= 0) w.nav.cellCenter(c, this.wander);
          else this.wander.copy(goal.pos);
          this.wanderT = rand(1.5, 3.5);
        }
        target = this.wander;
      }
      const p = this.followPath(w, target, dt);
      if (p) { steerX = p.x - a.pos.x; steerZ = p.z - a.pos.z; }
      else if (dd > 1) { steerX = dest.x - a.pos.x; steerZ = dest.z - a.pos.z; }
    }

    // edge safety: don't walk into the void
    const sl = Math.hypot(steerX, steerZ);
    if (sl > 0.01) {
      const px = a.pos.x + (steerX / sl) * 1.2, pz = a.pos.z + (steerZ / sl) * 1.2;
      const g = w.col.groundHeight(px, pz, 0.2, a.pos.y + 1.4);
      if (g === -Infinity || g < w.killY + 2 || g < a.pos.y - 6) {
        if (combatMove) { this.strafeDir *= -1; steerX = -steerX; steerZ = -steerZ; }
        else if (!this.path) { steerX = 0; steerZ = 0; }
      }
    }

    // convert world steer into local wish (relative to body yaw)
    const l2 = Math.hypot(steerX, steerZ);
    if (l2 > 0.05) {
      const nx = steerX / l2, nz = steerZ / l2;
      const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
      // right = (cos, -sin), forward = (-sin, -cos)
      a.wish.x = nx * cy - nz * sy;
      a.wish.y = -nx * sy - nz * cy;
      const wl = Math.hypot(a.wish.x, a.wish.y);
      if (wl > 1) a.wish.multiplyScalar(1 / wl);
    } else a.wish.set(0, 0);
    a.wantSprint = !t && l2 > 0.05 && a.wish.y > 0.5;

    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 0.9) {
      const moved = this.stuckRef.distanceTo(a.pos);
      if (l2 > 0.05 && moved < 0.5) {
        this.stuckCount++;
        a.wantJump = true;
        this.repathT = 0;
        if (this.stuckCount > 2) {
          this.strafeDir *= -1;
          this.goalT = 0;
          this.detour = null;
          this.stuckCount = 0;
        }
      } else this.stuckCount = 0;
      this.stuckRef.copy(a.pos);
      this.stuckT = 0;
    }

    // ----- aiming
    let desiredYaw = a.yaw;
    let desiredPitch = 0;
    const turnMul = t ? 1 : 0.6;
    if (t) {
      this.pickWeapon(dist);
      const def = a.weapon.def;
      // aim point: body, sometimes head for good bots
      tmpV.set(t.pos.x, t.pos.y + (this.diff.aimError < 0.03 ? 1.45 : 1.1), t.pos.z);
      if (def.projectile) {
        const time = dist / def.projectile.speed;
        tmpV.addScaledVector(t.vel, time * 0.85);
        tmpV.y = Math.max(t.pos.y + 0.2, tmpV.y - 0.6); // aim at feet for splash
      } else {
        tmpV.addScaledVector(t.vel, 0.05);
      }
      const ex = a.pos.x, ey = a.pos.y + EYE, ez = a.pos.z;
      desiredYaw = yawTo(ex, ez, tmpV.x, tmpV.z);
      desiredPitch = Math.atan2(tmpV.y - ey, Math.hypot(tmpV.x - ex, tmpV.z - ez));
      // aim error (drifts, shrinks while tracking, grows with target speed)
      this.trackTime += dt;
      this.errT -= dt;
      if (this.errT <= 0) {
        const spd = t.horizSpeed() / 7;
        const mag = this.diff.aimError * (1 + spd * 0.8) * (1 / (1 + this.trackTime * this.diff.trackGain));
        this.errTX = rand(-1, 1) * mag;
        this.errTY = rand(-1, 1) * mag * 0.6;
        this.errT = rand(0.15, 0.4);
      }
      this.errX += (this.errTX - this.errX) * Math.min(1, dt * 6);
      this.errY += (this.errTY - this.errY) * Math.min(1, dt * 6);
      desiredYaw += this.errX;
      desiredPitch += this.errY;
      a.wantAim = def.id === 'zapper' && dist > 15;
    } else {
      a.wantAim = false;
      // look where we're going / toward last known threat
      if (w.time - this.lastKnownT < 3) {
        desiredYaw = yawTo(a.pos.x, a.pos.z, this.lastKnown.x, this.lastKnown.z);
        desiredPitch = 0;
      } else if (l2 > 0.05) {
        desiredYaw = yawTo(0, 0, steerX, steerZ);
      }
      // reload during downtime
      const wpn = a.weapon;
      if (wpn.mag < wpn.def.mag * 0.5 && wpn.reserve > 0 && a.reloadT <= 0) a.startReload();
      if (this.switchCd <= 0 && a.weapon.def.id !== 'blaster' && a.weapon.mag === 0) this.pickWeapon(15);
    }
    const maxTurn = this.diff.turnSpeed * turnMul * dt;
    const dy = angleDiff(a.yaw, desiredYaw);
    a.yaw += clamp(dy, -maxTurn, maxTurn);
    a.pitch += clamp(desiredPitch - a.pitch, -maxTurn, maxTurn);
    a.pitch = clamp(a.pitch, -1.3, 1.3);

    // ----- firing
    a.wantFire = false;
    this.wantGrenade = false;
    if (t && this.reactT <= 0) {
      const def = a.weapon.def;
      const offYaw = Math.abs(angleDiff(a.yaw, yawTo(a.pos.x, a.pos.z, t.pos.x, t.pos.z)));
      const tol = Math.atan2(0.9, Math.max(1, dist)) + (def.pellets > 1 ? 0.08 : 0) + (def.projectile ? 0.06 : 0);
      if (offYaw < tol * 1.6) {
        if (def.auto) {
          // burst fire at range
          this.burstT -= dt;
          if (dist > 25) {
            if (this.burstT <= 0) {
              this.burstOff = this.burstOff > 0 ? 0 : 1;
              this.burstT = this.burstOff ? rand(0.25, 0.5) : rand(0.2, 0.45);
            }
            a.wantFire = this.burstOff === 1;
          } else a.wantFire = true;
        } else {
          a.wantFire = a.fireCd <= 0;
          if (def.id === 'zapper' && this.trackTime < 0.35) a.wantFire = false;
        }
      }
      if (a.weapon.mag === 0 && a.weapon.reserve > 0) a.startReload();
      if (a.grenades > 0 && dist > 7 && dist < 20 && Math.random() < this.diff.grenade * dt) this.wantGrenade = true;
    }
  }
}
