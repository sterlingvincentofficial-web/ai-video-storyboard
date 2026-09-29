import * as THREE from 'three';
import { Actor, BASE_PHYSICS, EYE, type Physics } from '../entities/Actor';
import { BotBrain, DIFFICULTIES, type BotWorld, type PickupInfo } from '../entities/Bot';
import { GRENADE, WEAPONS, type WeaponDef, type WeaponId } from '../entities/Weapons';
import { createMode, CTF, DuckMode, KOTH, type Mode, type ModeId } from '../modes/Modes';
import type { WorldScene } from '../world/WorldScene';
import type { WorldId } from '../worlds/types';
import type { PickupType } from '../world/Level';
import { CharacterModel, type CosmeticHat, HATS } from '../render/Character';
import type { Effects } from '../render/Effects';
import { clamp, dirFromYawPitch, pick, rand, shuffle } from '../core/utils';
import { canvasTexture } from '../render/Materials';
import { roundedBox } from '../worlds/common';
import { emptyTally, type MatchTally } from '../core/Challenges';
import { Batcher } from '../render/Batcher';
import { consolidate } from '../render/merge';

export interface MatchConfig {
  world: WorldId;
  mode: ModeId;
  difficulty: number;
  scoreScale: number;
  mutators: string[];
  playerName: string;
  playerHat: string;
  /** Attract mode: no human player, bots only. */
  spectate?: boolean;
  /** Index of the World Tour stop this match belongs to. */
  tourStop?: number;
}

export type MatchEvent =
  | { type: 'kill'; killer: Actor | null; victim: Actor; weapon: string; head: boolean; assist: Actor | null; env?: string }
  | { type: 'message'; text: string; big?: boolean; color?: string; forPlayer?: boolean }
  | { type: 'flag'; action: 'taken' | 'captured' | 'returned' | 'dropped'; team: number; actor: Actor | null }
  | { type: 'zone'; team: number }
  | { type: 'duck'; action: 'taken' | 'dropped' | 'reset'; actor: Actor | null }
  | { type: 'round'; team: number }
  | { type: 'hit'; attacker: Actor; victim: Actor; dmg: number; head: boolean; kill: boolean; pos: THREE.Vector3 }
  | { type: 'damaged'; victim: Actor; attacker: Actor | null; dmg: number; from: THREE.Vector3 }
  | { type: 'pickup'; actor: Actor; kind: PickupType }
  | { type: 'streak'; actor: Actor; text: string }
  | { type: 'chat'; actor: Actor; text: string }
  | { type: 'fire'; actor: Actor; weapon: WeaponId; pos: THREE.Vector3 }
  | { type: 'explode'; pos: THREE.Vector3; radius: number }
  | { type: 'jump'; actor: Actor; double: boolean }
  | { type: 'land'; actor: Actor; speed: number }
  | { type: 'pad'; actor: Actor }
  | { type: 'spawn'; actor: Actor }
  | { type: 'reload'; actor: Actor }
  | { type: 'empty'; actor: Actor }
  | { type: 'switch'; actor: Actor }
  | { type: 'grenade'; actor: Actor }
  | { type: 'melee'; actor: Actor; hit: boolean }
  | { type: 'bounce'; pos: THREE.Vector3 }
  | { type: 'end'; winner: number };

interface Projectile {
  kind: 'rocket' | 'grenade';
  owner: Actor;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  mesh: THREE.Object3D;
  def: WeaponDef | null;
  alive: boolean;
  overcharged: boolean;
  bounces: number;
}

interface Pickup {
  type: PickupType;
  pos: THREE.Vector3;
  available: boolean;
  timer: number;
  group: THREE.Group;
  icon: THREE.Object3D;
  info: PickupInfo;
}

interface Pad {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  radius: number;
  /** cached flight time */
  T?: number;
  mesh: THREE.Object3D;
  bounce: number;
}

const RESPAWN: Record<PickupType, number> = { health: 16, ammo: 18, boomer: 25, zapper: 25, overcharge: 55 };

const CHAT_KILL = ['Gotcha!', 'Boing!', 'Too easy!', 'Hehe!', 'Nice try!', 'Splat-tastic!', 'Pew pew!', 'Get toon-ed!', 'Outta here!'];
const CHAT_DIE = ['Ow!', 'No fair!', "I'll be back!", 'Whoops!', 'Rude!', 'Ouchie!', 'Not again!', 'Lag!!'];
const CHAT_TEAM = ['Covering you!', 'Right behind you!', 'On it!', 'Push up!', 'Watch left!', 'Nice one!'];

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

export class Match implements BotWorld {
  actors: Actor[] = [];
  player: Actor | null = null;
  brains = new Map<Actor, BotBrain>();
  mode: Mode;
  score: [number, number] = [0, 0];
  time = 0;
  timeLeft: number;
  state: 'countdown' | 'playing' | 'ended' = 'countdown';
  countdown = 3.5;
  winner = -2;
  phys: Physics;
  events: MatchEvent[] = [];
  projectiles: Projectile[] = [];
  pickupsList: Pickup[] = [];
  pads: Pad[] = [];
  group = new THREE.Group();
  flagMeshes: THREE.Group[] = [];
  zoneMesh: THREE.Group | null = null;
  playerMuzzle = new THREE.Vector3();
  headScale = 1;
  rateMul = 1;
  instagib = false;
  infinite = false;
  vampire = false;
  killY: number;
  mvp: Actor | null = null;
  tally: MatchTally;
  private firstBlood = false;
  private rocketGeo = new THREE.SphereGeometry(0.28, 12, 10);
  private grenadeGeo = new THREE.SphereGeometry(0.2, 10, 8);
  private nadeLightGeo = new THREE.SphereGeometry(0.07, 6, 4);
  private ownTextures: THREE.Texture[] = [];
  private ownMaterials: THREE.Material[] = [];

  constructor(public world: WorldScene, public cfg: MatchConfig, public fx: Effects) {
    this.mode = createMode(cfg.mode);
    this.tally = emptyTally(cfg.mode, cfg.world);
    this.killY = world.level.killY;
    const info = this.mode.info;
    this.mode.scoreLimit = Math.max(1, Math.round(info.baseScore * cfg.scoreScale));
    this.timeLeft = info.time * (cfg.scoreScale < 1 ? 0.7 : cfg.scoreScale > 1 ? 1.3 : 1);
    const mut = new Set(cfg.mutators);
    this.phys = { ...BASE_PHYSICS };
    if (mut.has('lowgrav')) { this.phys.gravity = 8.5; this.phys.jump = 6.4; this.phys.doubleJump = 5.6; }
    if (mut.has('turbo')) { this.phys.walk *= 1.4; this.phys.sprint *= 1.4; this.rateMul = 1.4; }
    if (mut.has('bighead')) this.headScale = 1.9;
    this.instagib = mut.has('instagib');
    this.infinite = mut.has('infinite');
    this.vampire = mut.has('vampire');
    world.scene.add(this.group);

    // --- actors
    const th = world.theme;
    const names = [shuffle([...th.botNames[0]]), shuffle([...th.botNames[1]])];
    const diff = DIFFICULTIES[clamp(cfg.difficulty, 0, 3)];
    for (let team = 0 as 0 | 1; team <= 1; team = (team + 1) as 0 | 1) {
      for (let i = 0; i < 4; i++) {
        const isPlayer = team === 0 && i === 0 && !cfg.spectate;
        const name = isPlayer ? cfg.playerName || 'You' : names[team][i % names[team].length];
        const a = new Actor(name, team, isPlayer);
        let hat: CosmeticHat = 'default';
        if (isPlayer) hat = (cfg.playerHat as CosmeticHat) || 'default';
        else if (Math.random() < 0.25) hat = pick(HATS.slice(1, 10)).id;
        a.hat = hat;
        a.model = new CharacterModel({ team, palette: th.teams[team], style: th.character, mats: world.mats, name, cosmetic: hat, bigHead: this.headScale > 1 });
        this.group.add(a.model.root);
        if (isPlayer) this.player = a;
        else this.brains.set(a, new BotBrain(a, diff));
        this.actors.push(a);
      }
      if (team === 1) break;
    }
    this.mode.setup(this);
    this.buildPickups();
    this.buildPads();
    if (this.mode instanceof CTF) this.buildFlags();
    if (this.mode instanceof KOTH) this.buildZone();
    if (this.mode instanceof DuckMode) this.buildDuck();
    this.respawnAll();
  }

  emit(e: MatchEvent) {
    this.events.push(e);
  }

  get col() { return this.world.col; }
  get nav() { return this.world.nav; }

  goalFor(a: Actor) {
    return this.mode.goalFor(this, a);
  }

  pickups(): PickupInfo[] {
    return this.pickupsList.map((p) => p.info);
  }

  addScore(team: 0 | 1, n: number) {
    if (this.state !== 'playing') return;
    this.score[team] += n;
    if (this.score[team] >= this.mode.scoreLimit) this.end(team);
  }

  end(winner: number) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.winner = winner;
    let best: Actor | null = null;
    for (const a of this.actors) if (!best || a.stats.score > best.stats.score) best = a;
    this.mvp = best;
    for (const a of this.actors) { a.wantFire = false; a.wantAim = false; a.aiming = false; }
    this.emit({ type: 'end', winner });
    // winners chat
    const w = this.actors.filter((a) => a.team === winner && !a.isPlayer);
    if (w.length) this.emit({ type: 'chat', actor: pick(w), text: pick(['GG!', 'GG EZ... jk, GG!', 'Wooo!', 'Victory dance!']) });
  }

  // ---------------------------------------------------------------- spawning
  respawnAll() {
    for (const a of this.actors) this.spawn(a);
  }

  pickSpawn(a: Actor) {
    const spawns = this.world.level.spawns.filter((s) => s.team === a.team);
    let best = spawns[0];
    let bestScore = -Infinity;
    for (const s of spawns) {
      let minEnemy = 999;
      let crowd = 0;
      for (const o of this.actors) {
        if (!o.alive || o === a) continue;
        const d = Math.hypot(o.pos.x - s.pos[0], o.pos.z - s.pos[2]);
        if (o.team !== a.team) minEnemy = Math.min(minEnemy, d);
        else if (d < 1.6) crowd++;
      }
      const sc = Math.min(minEnemy, 40) - crowd * 50 + rand(0, 8);
      if (sc > bestScore) { bestScore = sc; best = s; }
    }
    return best;
  }

  spawn(a: Actor) {
    const s = this.pickSpawn(a);
    a.pos.set(s.pos[0], s.pos[1] + 0.05, s.pos[2]);
    a.vel.set(0, 0, 0);
    a.yaw = s.yaw;
    a.pitch = 0;
    a.health = a.maxHealth;
    a.alive = true;
    a.onGround = true;
    a.spawnShield = 2;
    a.padT = 0;
    a.overcharge = 0;
    a.carrying = -1;
    a.damagers.clear();
    a.lastAttacker = null;
    a.killer = null;
    a.resetLoadout(this.instagib);
    a.stats.streak = 0;
    const b = this.brains.get(a);
    b?.reset();
    if (a.model) {
      a.model.resetPose();
      a.model.root.visible = !a.isPlayer;
      a.model.root.position.copy(a.pos);
      a.model.setWeapon(a.weapon.def.id, this.world.mats, this.weaponColor(a));
    }
    this.emit({ type: 'spawn', actor: a });
  }

  weaponColor(a: Actor) {
    return this.world.theme.teams[a.team].secondary;
  }

  // ---------------------------------------------------------------- update
  update(dt: number) {
    this.time += dt;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.state = 'playing';
        this.emit({ type: 'message', text: 'GO!', big: true });
      }
    } else if (this.state === 'playing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.end(this.mode.timeUp(this));
      }
    }
    const active = this.state === 'playing';
    if (active) this.mode.update(this, dt);

    // bots think
    for (const [a, b] of this.brains) {
      if (!a.alive) continue;
      if (!active) {
        a.wish.set(0, 0);
        a.wantFire = false;
        if (this.state === 'countdown') {
          // look around idly
          a.yaw += Math.sin(this.time * 0.8 + a.id) * dt * 0.3;
        }
        continue;
      }
      b.update(dt, this);
      if (b.wantGrenade) this.throwGrenade(a);
      if (b.wantMelee) this.melee(a);
    }

    for (const a of this.actors) this.updateActor(a, dt, active);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updatePads(dt);
    this.updateFlags(dt);
    this.updateZone(dt);
    this.updateDuck(dt);
    if (this.mode instanceof DuckMode && this.player && this.mode.carrier === this.player && this.state === 'playing') this.tally.duckTime += dt;
  }

  private updateActor(a: Actor, dt: number, active: boolean) {
    if (!a.alive) {
      if (a.model) this.animateDeath(a, dt);
      if (active && this.mode.respawn) {
        a.respawnTimer -= dt;
        if (a.respawnTimer <= 0) this.spawn(a);
      }
      return;
    }
    a.spawnShield = Math.max(0, a.spawnShield - dt);
    a.overcharge = Math.max(0, a.overcharge - dt);
    // cartoon regen: heal up after a few seconds out of combat
    if (a.health < a.maxHealth && a.carrying !== 2 && this.time - a.lastDamageTime > 4.5) a.health = Math.min(a.maxHealth, a.health + 14 * dt);
    a.fireCd -= dt;
    a.grenadeCd -= dt;
    a.meleeCd -= dt;
    if (a.switchT > 0) {
      a.switchT -= dt;
      if (a.model) a.model.setWeapon(a.weapon.def.id, this.world.mats, this.weaponColor(a));
    }
    if (a.reloadT > 0) {
      a.reloadT -= dt;
      if (a.reloadT <= 0) {
        const w = a.weapon;
        const need = w.def.mag - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
        a.reloadT = 0;
      }
    }
    a.aiming = a.wantAim && a.reloadT <= 0 && a.switchT <= 0;
    if (!active) {
      a.wish.set(0, 0);
      a.wantJump = false;
    }
    if (active && a.wantFire) this.fire(a);
    if (!a.weapon.def.auto && !a.isPlayer) a.wantFire = false;

    const wasGround = a.onGround;
    const r = a.move(dt, this.col, this.phys);
    if (r.jumped) {
      if (a.isPlayer && r.jumped === 2) this.tally.doubleJumps++;
      this.emit({ type: 'jump', actor: a, double: r.jumped === 2 });
      if (r.jumped === 2) this.fx.puff(a.pos, 8);
    }
    if (a.landed > 6 && !wasGround) {
      this.emit({ type: 'land', actor: a, speed: a.landed });
      a.model?.land(a.landed);
    }
    if (a.pos.y < this.killY) {
      this.kill(a, a.lastAttacker && this.time - a.lastDamageTime < 6 ? a.lastAttacker : null, 'void', false);
      return;
    }
    // footsteps are handled by Game (player) — here just touch pickups
    for (const p of this.pickupsList) {
      if (!p.available) continue;
      if (Math.abs(a.pos.x - p.pos.x) < 1.1 && Math.abs(a.pos.z - p.pos.z) < 1.1 && Math.abs(a.pos.y - p.pos.y) < 1.6) this.tryPickup(a, p);
    }
    // sync model
    if (a.model) {
      const m = a.model;
      m.root.position.copy(a.pos);
      m.root.rotation.y = a.yaw;
      m.update({ speed: a.horizSpeed(), onGround: a.onGround, pitch: a.pitch, vy: a.vel.y, dt, sprint: a.wantSprint && a.wish.y > 0.3 });
      // spawn shield blink
      if (!a.isPlayer) m.root.visible = a.spawnShield > 0 ? Math.floor(this.time * 12) % 2 === 0 : true;
    }
  }

  private deathSpin = new Map<Actor, { t: number; vx: number; vz: number; vy: number; spin: number }>();

  private animateDeath(a: Actor, dt: number) {
    const d = this.deathSpin.get(a);
    const m = a.model!;
    if (!d) return;
    d.t += dt;
    if (d.t < 0.55) {
      d.vy -= 20 * dt;
      m.root.position.x += d.vx * dt;
      m.root.position.y += d.vy * dt;
      m.root.position.z += d.vz * dt;
      m.root.rotation.x += d.spin * dt;
      m.root.rotation.z += d.spin * 0.6 * dt;
      m.root.scale.setScalar(1 - d.t * 0.5);
    } else if (m.root.visible) {
      m.root.visible = false;
      this.fx.poof(m.root.position.clone().setY(m.root.position.y - 0.6), this.world.theme.teams[a.team].primary);
      this.deathSpin.delete(a);
    }
  }

  // ---------------------------------------------------------------- weapons
  muzzleOf(a: Actor, out: THREE.Vector3) {
    if (a.isPlayer) return out.copy(this.playerMuzzle);
    if (a.model) {
      a.model.root.updateMatrixWorld(true);
      return a.model.muzzle.getWorldPosition(out);
    }
    return out.set(a.pos.x, a.pos.y + EYE - 0.2, a.pos.z);
  }

  fire(a: Actor) {
    const w = a.weapon;
    const def = w.def;
    if (a.switchT > 0 || a.reloadT > 0 || a.fireCd > 0) return;
    if (w.mag <= 0) {
      if (w.reserve > 0) {
        if (a.startReload()) this.emit({ type: 'reload', actor: a });
      } else {
        this.emit({ type: 'empty', actor: a });
        a.fireCd = 0.3;
        // auto switch to something with ammo
        for (let i = 0; i < 4; i++) {
          const s = a.slots[i];
          if (s.owned && s.mag + s.reserve > 0 && a.switchTo(i)) { this.emit({ type: 'switch', actor: a }); break; }
        }
      }
      return;
    }
    a.fireCd = 1 / (def.rate * this.rateMul);
    if (!this.infinite && !this.instagib) w.mag--;
    a.lastFireTime = this.time;
    a.spawnShield = 0;
    const eye = new THREE.Vector3(a.pos.x, a.pos.y + EYE, a.pos.z);
    const dir = dirFromYawPitch(a.yaw, a.pitch, new THREE.Vector3());
    const muzzle = this.muzzleOf(a, new THREE.Vector3());
    a.model?.fire();
    this.emit({ type: 'fire', actor: a, weapon: def.id, pos: muzzle.clone() });
    const moving = a.horizSpeed() > 2;
    let spread = a.aiming ? def.aimSpread : def.spread;
    if (!a.onGround) spread *= 1.6;
    else if (moving && !a.aiming) spread *= 1.25;
    if (def.projectile) {
      const start = eye.clone().addScaledVector(dir, 0.7);
      // don't spawn inside a wall
      const h = this.col.raycast(eye, dir, 0.9);
      if (h) start.copy(h.point).addScaledVector(dir, -0.25);
      this.spawnRocket(a, start, dir.clone(), def, muzzle);
      return;
    }
    const color = this.impactColor(a);
    const pellets = def.pellets;
    const hitAgg = new Map<Actor, { dmg: number; head: boolean; pos: THREE.Vector3 }>();
    for (let i = 0; i < pellets; i++) {
      const d = dir.clone();
      if (spread > 0) {
        const r = Math.sqrt(Math.random()) * spread;
        const th = Math.random() * Math.PI * 2;
        const right = tmp2.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
        const up = new THREE.Vector3().crossVectors(right, d).normalize();
        d.addScaledVector(right, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r).normalize();
      }
      const wall = this.col.raycast(eye, d, def.range);
      const maxT = wall ? wall.t : def.range;
      let hitA: Actor | null = null;
      let hitT = maxT;
      let head = false;
      for (const o of this.actors) {
        if (o === a || !o.alive || o.team === a.team) continue;
        // cheap reject
        const dx = o.pos.x - eye.x, dz = o.pos.z - eye.z;
        if (dx * d.x + dz * d.z < -1) continue;
        const h = o.rayHit(eye, d, hitT, this.headScale);
        if (h) { hitA = o; hitT = h.t; head = h.head; }
      }
      const end = eye.clone().addScaledVector(d, hitT);
      if (def.id === 'zapper') this.fx.tracer(muzzle, end, this.tracerColor(a, def), 0.07, 0.25);
      else {
        if (i < 4 || Math.random() < 0.4) this.fx.shot(muzzle, end, this.shotColor(a));
        if (i === 0 && (this.world.theme.impact === 'laser' || this.world.theme.impact === 'ink')) this.fx.tracer(muzzle, end, this.tracerColor(a, def), 0.02, 0.06);
      }
      if (hitA) {
        const fall = clamp((hitT - def.falloff[0]) / (def.falloff[1] - def.falloff[0]), 0, 1);
        let dmg = def.damage * (1 - fall * 0.45) * (head ? def.headMult : 1);
        if (this.instagib) dmg = 999;
        const agg = hitAgg.get(hitA) ?? { dmg: 0, head: false, pos: end.clone() };
        agg.dmg += dmg;
        agg.head = agg.head || head;
        hitAgg.set(hitA, agg);
        this.fx.impactActor(end, this.world.theme.teams[hitA.team].primary, head);
      } else if (wall) {
        this.fx.impactWorld(wall.point, wall.normal, color, def.id === 'zapper');
      }
    }
    if (a.isPlayer) {
      this.tally.shots++;
      if (hitAgg.size) this.tally.hits++;
    }
    for (const [o, h] of hitAgg) this.damage(o, h.dmg, a, def.id, h.head, h.pos, dir);
  }

  impactColor(a: Actor) {
    return this.world.theme.teams[a.team].primary;
  }

  shotColor(a: Actor) {
    const t = this.world.theme.teams[a.team];
    switch (this.world.theme.impact) {
      case 'paper': return 0xf4ecd8;
      case 'ink': return 0xffe12b;
      case 'dart': return t.primary;
      case 'laser': return t.light;
      default: return t.primary;
    }
  }

  tracerColor(a: Actor, def: WeaponDef) {
    const t = this.world.theme.teams[a.team];
    if (def.id === 'zapper') return t.light;
    return this.world.theme.impact === 'ink' ? 0xffe12b : t.light;
  }

  spawnRocket(a: Actor, pos: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef, muzzle: THREE.Vector3) {
    const col = this.world.theme.teams[a.team].light;
    const mesh = new THREE.Mesh(this.rocketGeo, this.world.mats.glow(col, 1.5));
    mesh.position.copy(muzzle);
    this.group.add(mesh);
    this.projectiles.push({ kind: 'rocket', owner: a, pos: pos.clone(), vel: dir.multiplyScalar(def.projectile!.speed), life: 4, mesh, def, alive: true, overcharged: a.overcharge > 0, bounces: 0 });
  }

  /** Cartoon bonk: short-range bash with the blaster. Hits from behind do double damage. */
  melee(a: Actor) {
    if (!a.alive || a.meleeCd > 0 || this.state !== 'playing') return;
    a.meleeCd = 0.7;
    a.spawnShield = 0;
    const dir = dirFromYawPitch(a.yaw, Math.max(-0.4, Math.min(0.4, a.pitch)), new THREE.Vector3());
    const eye = new THREE.Vector3(a.pos.x, a.pos.y + EYE - 0.3, a.pos.z);
    let best: Actor | null = null;
    let bestD = 2.7;
    const to = new THREE.Vector3();
    for (const o of this.actors) {
      if (!o.alive || o.team === a.team) continue;
      to.set(o.pos.x, o.pos.y + 1, o.pos.z).sub(eye);
      const d = to.length();
      if (d > bestD) continue;
      if (to.dot(dir) / Math.max(d, 1e-3) < 0.55 && d > 1.1) continue;
      if (!this.col.lineOfSight(eye, o.center(new THREE.Vector3()))) continue;
      best = o;
      bestD = d;
    }
    a.model?.fire();
    this.emit({ type: 'melee', actor: a, hit: !!best });
    if (!best) return;
    const fwd = dirFromYawPitch(best.yaw, 0, new THREE.Vector3());
    const back = fwd.x * dir.x + fwd.z * dir.z > 0.5; // attacker is behind the victim
    const pos = best.center(new THREE.Vector3()).add(new THREE.Vector3(0, 0.4, 0));
    this.damage(best, back ? 100 : 55, a, 'bonk', false, pos, dir);
    best.vel.addScaledVector(new THREE.Vector3(dir.x, 0, dir.z).normalize(), 7);
    best.vel.y += 3.5;
    best.onGround = false;
    this.fx.pop(pos, back ? 'BACK BONK!' : 'BONK!', back ? 1.7 : 1.4);
    this.fx.impactActor(pos, this.world.theme.teams[best.team].primary, true);
  }

  throwGrenade(a: Actor) {
    if (!a.alive || a.grenades <= 0 || a.grenadeCd > 0 || this.state !== 'playing') return;
    a.grenades--;
    a.grenadeCd = 1;
    a.spawnShield = 0;
    const dir = dirFromYawPitch(a.yaw, a.pitch + 0.15, new THREE.Vector3());
    const pos = new THREE.Vector3(a.pos.x, a.pos.y + EYE - 0.1, a.pos.z).addScaledVector(dir, 0.6);
    const h = this.col.raycast(new THREE.Vector3(a.pos.x, a.pos.y + EYE, a.pos.z), dir, 0.8);
    if (h) pos.copy(h.point).addScaledVector(dir, -0.3);
    const vel = dir.multiplyScalar(GRENADE.throwSpeed).add(new THREE.Vector3(a.vel.x * 0.5, 3, a.vel.z * 0.5));
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.grenadeGeo, this.world.mats.mat(this.world.theme.teams[a.team].primary));
    const light = new THREE.Mesh(this.nadeLightGeo, this.world.mats.glow(0xffee55, 2));
    light.position.y = 0.2;
    g.add(body, light);
    g.position.copy(pos);
    this.group.add(g);
    this.projectiles.push({ kind: 'grenade', owner: a, pos, vel, life: GRENADE.fuse, mesh: g, def: null, alive: true, overcharged: a.overcharge > 0, bounces: 0 });
    this.emit({ type: 'grenade', actor: a });
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.kind === 'rocket') {
        const step = p.vel.length() * dt;
        const d = tmpDir.copy(p.vel).normalize();
        const hit = this.col.raycast(p.pos, d, step + 0.28);
        let hitActor: Actor | null = null;
        for (const o of this.actors) {
          if (!o.alive || o === p.owner || o.team === p.owner.team) continue;
          if (o.distTo(p.pos) < 0.75) { hitActor = o; break; }
        }
        if (hit || hitActor || p.life <= 0) {
          const at = hit ? hit.point.clone().addScaledVector(hit.normal, 0.2) : p.pos.clone();
          const pr = p.def!.projectile!;
          if (hitActor) this.damage(hitActor, 20 * (p.overcharged ? 2 : 1), p.owner, 'boomer', false, at, d, true);
          this.explode(at, pr.splash, pr.splashDamage, pr.knockback, p.owner, 'boomer', p.overcharged, hitActor);
          if (hit) this.fx.decal(hit.point, hit.normal, this.impactColor(p.owner), 3.2);
          p.alive = false;
        } else {
          p.pos.addScaledVector(p.vel, dt);
          if (Math.random() < 0.8) this.fx.trail(p.pos, this.world.theme.impact === 'laser' ? this.world.theme.teams[p.owner.team].light : 0xffffff);
        }
      } else {
        // grenade: bouncy
        p.vel.y -= this.phys.gravity * 1.1 * dt;
        const step = p.vel.length() * dt;
        const d = tmpDir.copy(p.vel).normalize();
        const hit = this.col.raycast(p.pos, d, step + 0.2);
        if (hit) {
          p.pos.copy(hit.point).addScaledVector(hit.normal, 0.21);
          const vn = p.vel.dot(hit.normal);
          p.vel.addScaledVector(hit.normal, -vn * 1.55);
          p.vel.multiplyScalar(0.62);
          if (Math.abs(vn) > 2) this.emit({ type: 'bounce', pos: p.pos.clone() });
          p.bounces++;
        } else p.pos.addScaledVector(p.vel, dt);
        let contact: Actor | null = null;
        for (const o of this.actors) {
          if (!o.alive || o.team === p.owner.team) continue;
          if (o.distTo(p.pos) < 0.7) { contact = o; break; }
        }
        (p.mesh.children[1] as THREE.Mesh).visible = Math.floor(p.life * (p.life < 0.6 ? 16 : 6)) % 2 === 0;
        p.mesh.rotation.x += dt * 8;
        if (p.life <= 0 || contact) {
          this.explode(p.pos.clone(), GRENADE.splash, GRENADE.damage, GRENADE.knockback, p.owner, 'grenade', p.overcharged, null);
          p.alive = false;
        }
        if (p.pos.y < this.killY) p.alive = false;
      }
      p.mesh.position.copy(p.pos);
      if (!p.alive) {
        this.group.remove(p.mesh);
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  explode(pos: THREE.Vector3, radius: number, dmg: number, knock: number, owner: Actor, weapon: string, overcharged: boolean, skip: Actor | null) {
    this.fx.explosion(pos, this.world.theme.teams[owner.team].light, radius);
    this.emit({ type: 'explode', pos: pos.clone(), radius });
    for (const o of this.actors) {
      if (!o.alive) continue;
      const d = o.distTo(pos);
      if (d > radius) continue;
      // line of sight from blast to body
      tmp2.set(o.pos.x, o.pos.y + 1, o.pos.z);
      if (!this.col.lineOfSight(pos, tmp2)) {
        tmp2.y = o.pos.y + 0.3;
        if (!this.col.lineOfSight(pos, tmp2)) continue;
      }
      const f = Math.pow(1 - d / radius, 0.7);
      const dir = new THREE.Vector3(o.pos.x - pos.x, o.pos.y + 1 - pos.y, o.pos.z - pos.z);
      if (dir.lengthSq() < 0.01) dir.set(0, 1, 0);
      dir.normalize();
      dir.y = Math.max(dir.y, 0.35);
      dir.normalize();
      const self = o === owner;
      const kb = knock * f * (self ? 1.35 : 1);
      o.vel.addScaledVector(dir, kb);
      if (kb > 3) o.onGround = false;
      if (o === skip) continue;
      if (o.team === owner.team && !self) continue;
      let dd = dmg * f * (overcharged ? 2 : 1);
      if (self) dd *= 0.35;
      if (this.instagib && !self) dd = 999;
      if (dd > 1) this.damage(o, dd, owner, weapon, false, tmp2.clone(), dir, true);
    }
  }

  damage(v: Actor, amount: number, attacker: Actor | null, weapon: string, head: boolean, pos: THREE.Vector3, dir: THREE.Vector3, splash = false) {
    if (!v.alive || this.state === 'ended') return;
    if (v.spawnShield > 0 && attacker !== v) return;
    if (attacker && attacker !== v && attacker.overcharge > 0 && !splash) amount *= 2;
    amount = Math.round(amount);
    if (amount <= 0) return;
    const before = v.health;
    v.health -= amount;
    v.lastDamageTime = this.time;
    if (attacker && attacker !== v) {
      v.lastAttacker = attacker;
      v.damagers.set(attacker.id, this.time);
      attacker.stats.damage += Math.min(before, amount);
      if (this.vampire) attacker.health = Math.min(attacker.maxHealth + 50, attacker.health + amount * 0.35);
    }
    v.model?.hit();
    const kill = v.health <= 0;
    if (attacker && attacker !== v) this.emit({ type: 'hit', attacker, victim: v, dmg: amount, head, kill, pos: pos.clone() });
    const from = attacker ? attacker.pos.clone() : pos.clone().sub(dir);
    this.emit({ type: 'damaged', victim: v, attacker, dmg: amount, from });
    this.brains.get(v)?.onDamaged(attacker, this.time);
    // small knockback for hitscan
    if (!splash && dir) v.vel.addScaledVector(tmp2.set(dir.x, 0, dir.z).normalize(), Math.min(3, amount * 0.04));
    if (kill) this.kill(v, attacker, weapon, head);
  }

  kill(v: Actor, killer: Actor | null, weapon: string, head: boolean) {
    if (!v.alive) return;
    v.alive = false;
    v.health = 0;
    v.deathTime = this.time;
    v.killer = killer && killer !== v ? killer : null;
    v.stats.deaths++;
    v.stats.streak = 0;
    v.respawnTimer = this.mode.respawnTime;
    v.wantFire = false;
    if (v.carrying >= 0 && this.mode instanceof CTF) this.mode.drop(this, this.mode.flags[v.carrying]);
    if (this.mode instanceof DuckMode && this.mode.carrier === v) this.mode.drop(this, v);
    // assist
    let assist: Actor | null = null;
    for (const [id, t] of v.damagers) {
      if (killer && id === killer.id) continue;
      if (this.time - t > 8) continue;
      const a = this.actors.find((x) => x.id === id);
      if (a && a.team !== v.team) { assist = a; break; }
    }
    if (assist) { assist.stats.assists++; assist.stats.score += 50; }
    if (killer && killer !== v) {
      if (killer.isPlayer) {
        this.tally.kills++;
        if (head) this.tally.headshots++;
        this.tally.weaponKills[weapon] = (this.tally.weaponKills[weapon] ?? 0) + 1;
      }
      if (!this.firstBlood) {
        this.firstBlood = true;
        this.emit({ type: 'streak', actor: killer, text: 'FIRST SPLAT!' });
      }
      if (killer.killer === v && this.time - killer.deathTime < 30 && killer.isPlayer) this.emit({ type: 'streak', actor: killer, text: 'REVENGE!' });
      killer.stats.kills++;
      killer.stats.score += 100 + (head ? 25 : 0);
      if (head) killer.stats.headshots++;
      killer.stats.streak++;
      killer.stats.bestStreak = Math.max(killer.stats.bestStreak, killer.stats.streak);
      if (this.time - killer.lastKillTime < 4) killer.multi++;
      else killer.multi = 1;
      killer.lastKillTime = this.time;
      const multi = ['', '', 'DOUBLE KO!', 'TRIPLE KO!', 'QUAD KO!', 'TOONAMI!'][Math.min(5, killer.multi)];
      if (multi) this.emit({ type: 'streak', actor: killer, text: multi });
      const streak = { 3: 'ON A ROLL!', 5: 'RAMPAGE!', 7: 'UNSTOPPABLE!', 10: 'LEGENDARY!', 15: 'CARTOON GOD!' }[killer.stats.streak];
      if (streak) this.emit({ type: 'streak', actor: killer, text: streak });
      if (killer.stats.streak === 5 || killer.stats.streak === 10) {
        killer.overcharge = Math.max(killer.overcharge, 10);
        this.emit({ type: 'message', text: `${killer.name}: STREAK BONUS — OVERCHARGED!`, color: killer.team === 0 ? '#5aa9ff' : '#ff6b6b' });
      }
      if (!killer.isPlayer && Math.random() < 0.18) this.emit({ type: 'chat', actor: killer, text: killer.team === 0 && v.team === 1 && Math.random() < 0.4 ? pick(CHAT_TEAM) : pick(CHAT_KILL) });
    } else {
      v.stats.score = Math.max(0, v.stats.score - 25);
    }
    if (!v.isPlayer && Math.random() < 0.12) this.emit({ type: 'chat', actor: v, text: pick(CHAT_DIE) });
    this.emit({ type: 'kill', killer: v.killer, victim: v, weapon, head, assist, env: weapon === 'void' ? 'void' : undefined });
    this.mode.onKill(this, v.killer, v);
    // death animation
    if (v.model) {
      const d = v.lastAttacker ? tmp.subVectors(v.pos, v.lastAttacker.pos).setY(0).normalize() : tmp.set(0, 0, 0);
      this.deathSpin.set(v, { t: 0, vx: d.x * 4 + v.vel.x * 0.3, vz: d.z * 4 + v.vel.z * 0.3, vy: 6, spin: rand(8, 14) * (Math.random() < 0.5 ? -1 : 1) });
      if (v.isPlayer) v.model.root.visible = true;
      if (weapon === 'void') { this.deathSpin.delete(v); v.model.root.visible = false; }
    }
  }

  // ---------------------------------------------------------------- pickups
  private buildPickups() {
    const mats = this.world.mats;
    const accent = this.world.theme.accent;
    const batch = new Batcher(false, true);
    const baseGeo = new THREE.CylinderGeometry(0.75, 0.85, 0.16, 20);
    const ringGeo = new THREE.TorusGeometry(0.66, 0.06, 6, 24).rotateX(Math.PI / 2);
    const iconMat = mats.mat(0xffffff, { vertexColors: true });
    for (const def of this.world.level.pickups) {
      if (this.instagib && def.type !== 'overcharge' && def.type !== 'health') continue;
      const g = new THREE.Group();
      batch.add(baseGeo, mats.mat(0x3a3a4a), new THREE.Matrix4().makeTranslation(def.pos[0], def.pos[1] + 0.08, def.pos[2]));
      batch.add(ringGeo, mats.glow(accent, 1.2), new THREE.Matrix4().makeTranslation(def.pos[0], def.pos[1] + 0.17, def.pos[2]));
      const icon = this.pickupIcon(def.type);
      consolidate(icon, iconMat);
      icon.position.y = 1.0;
      g.add(icon);
      g.position.set(...def.pos);
      this.group.add(g);
      const pos = new THREE.Vector3(...def.pos);
      const info: PickupInfo = { pos, type: def.type, available: true };
      const p: Pickup = { type: def.type, pos, available: true, timer: 0, group: g, icon, info };
      if (def.type === 'overcharge') { p.available = false; p.timer = 30; info.available = false; icon.visible = false; }
      this.pickupsList.push(p);
    }
    batch.flush(this.group, false);
  }

  private pickupIcon(type: PickupType): THREE.Object3D {
    const wm = this.world.mats;
    const mats = { mat: (c: number) => new THREE.MeshLambertMaterial({ color: c }), glow: (c: number, i: number) => wm.glow(c, i) };
    const g = new THREE.Group();
    switch (type) {
      case 'health': {
        const m = mats.mat(0xff3b5c);
        const a = new THREE.Mesh(roundedBox(0.7, 0.24, 0.24, 0.08), m);
        const b = new THREE.Mesh(roundedBox(0.24, 0.7, 0.24, 0.08), m);
        const w = new THREE.Mesh(roundedBox(0.8, 0.8, 0.16, 0.12), mats.mat(0xffffff));
        g.add(w, a, b);
        a.position.z = b.position.z = 0.06;
        break;
      }
      case 'ammo': {
        const box = new THREE.Mesh(roundedBox(0.7, 0.4, 0.45, 0.06), mats.mat(0x3f8f4f));
        g.add(box);
        for (let i = 0; i < 3; i++) {
          const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 3, 8), mats.mat(0xffc93c));
          b.position.set(-0.18 + i * 0.18, 0.36, 0);
          g.add(b);
        }
        break;
      }
      case 'boomer': {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 14), mats.mat(WEAPONS.boomer.color));
        t.rotation.z = Math.PI / 2;
        const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 14), mats.mat(0x2a2a3a));
        r1.rotation.y = Math.PI / 2;
        r1.position.x = 0.45;
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mats.glow(0xffe066, 1.5));
        orb.position.x = 0.5;
        g.add(t, r1, orb);
        break;
      }
      case 'zapper': {
        const b = new THREE.Mesh(roundedBox(1.2, 0.18, 0.14, 0.05), mats.mat(WEAPONS.zapper.color));
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 10), mats.mat(0x2a2a3a));
        s.rotation.z = Math.PI / 2;
        s.position.y = 0.16;
        g.add(b, s);
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 10), mats.glow(0x9dff4a, 1.8));
          c.rotation.y = Math.PI / 2;
          c.position.x = -0.35 - i * 0.12;
          g.add(c);
        }
        break;
      }
      case 'overcharge': {
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), mats.glow(0xff66ff, 1.8));
        const star2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), mats.glow(0xffee55, 1.6));
        star2.rotation.set(0.6, 0.6, 0);
        star2.scale.setScalar(0.8);
        g.add(star, star2);
        break;
      }
    }
    return g;
  }

  private tryPickup(a: Actor, p: Pickup) {
    let used = false;
    switch (p.type) {
      case 'health':
        if (a.health < a.maxHealth) { a.health = Math.min(a.maxHealth, a.health + 50); used = true; }
        break;
      case 'ammo':
        for (const s of a.slots) {
          if (!s.owned) continue;
          if (s.reserve < s.def.reserve) { s.reserve = Math.min(s.def.reserve, s.reserve + Math.ceil(s.def.reserve * 0.5)); used = true; }
        }
        if (a.grenades < 3) { a.grenades++; used = true; }
        break;
      case 'boomer':
      case 'zapper': {
        const slot = a.slots[WEAPONS[p.type].slot];
        const had = slot.owned;
        used = slot.give();
        if (used && !had) {
          a.switchTo(slot.def.slot);
          this.emit({ type: 'switch', actor: a });
        }
        break;
      }
      case 'overcharge':
        a.overcharge = 15;
        used = true;
        this.emit({ type: 'message', text: `${a.name} is OVERCHARGED!`, color: a.team === 0 ? '#5aa9ff' : '#ff6b6b' });
        break;
    }
    if (!used) return;
    p.available = false;
    p.info.available = false;
    p.timer = RESPAWN[p.type];
    p.icon.visible = false;
    this.fx.sparkle(p.pos, this.world.theme.accent);
    if (a.isPlayer) this.tally.pickups++;
    this.emit({ type: 'pickup', actor: a, kind: p.type });
  }

  private updatePickups(dt: number) {
    for (const p of this.pickupsList) {
      if (!p.available) {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.available = true;
          p.info.available = true;
          p.icon.visible = true;
          p.icon.scale.setScalar(0.01);
        }
      } else {
        p.icon.rotation.y += dt * (p.type === 'overcharge' ? 3 : 1.6);
        p.icon.position.y = 1.0 + Math.sin(this.time * 2.5 + p.pos.x) * 0.12;
        const s = Math.min(1, p.icon.scale.x + dt * 3);
        p.icon.scale.setScalar(s);
      }
    }
  }

  // ---------------------------------------------------------------- jump pads
  private buildPads() {
    const mats = this.world.mats;
    for (const d of this.world.level.pads) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.2, 20), mats.mat(0x3a3a4a));
      base.position.y = 0.1;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 20), mats.glow(this.world.theme.accent, 1.3));
      top.position.y = 0.26;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 3), mats.mat(0xffffff));
      arrow.position.y = 0.7;
      g.add(base, top, arrow);
      g.position.set(...d.pos);
      this.group.add(g);
      this.pads.push({ pos: new THREE.Vector3(...d.pos), target: new THREE.Vector3(...d.target), radius: d.radius ?? 1.1, mesh: g, bounce: 0 });
    }
  }

  private updatePads(dt: number) {
    for (const p of this.pads) {
      p.bounce = Math.max(0, p.bounce - dt * 3);
      const arrow = p.mesh.children[2];
      arrow.position.y = 0.7 + Math.sin(this.time * 4) * 0.12 + p.bounce * 0.6;
      arrow.rotation.y += dt * 2;
      p.mesh.children[1].scale.y = 1 + p.bounce * 3;
      for (const a of this.actors) {
        if (!a.alive || a.vel.y > 1) continue;
        if (Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) > p.radius || Math.abs(a.pos.y - p.pos.y) > 0.6) continue;
        const dx = p.target.x - a.pos.x, dz = p.target.z - a.pos.z, dy = p.target.y - a.pos.y;
        const T = p.T ?? (p.T = this.padFlightTime(p));
        const g = this.phys.gravity;
        a.vel.set(dx / T, (dy + 0.5 * g * T * T) / T, dz / T);
        a.padT = T;
        a.onGround = false;
        a.jumpsUsed = 1;
        a.coyote = 0;
        p.bounce = 1;
        this.fx.puff(p.pos, 10, this.world.theme.accent);
        this.emit({ type: 'pad', actor: a });
      }
    }
  }

  /** Shortest flight time (from the old distance-based guess upward) whose arc clears the level. */
  private padFlightTime(p: Pad) {
    const g = this.phys.gravity;
    const dx = p.target.x - p.pos.x, dz = p.target.z - p.pos.z, dy = p.target.y - p.pos.y;
    const dist = Math.hypot(dx, dz);
    const base = clamp(dist / 11, 0.9, 1.7);
    const ux = dist > 0 ? dx / dist : 0, uz = dist > 0 ? dz / dist : 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let T = base; T < 2.8; T += 0.1) {
      const vy = (dy + 0.5 * g * T * T) / T;
      let ok = true;
      // check the feet line and the body's leading edge
      for (const lead of [0, 0.45]) {
        a.set(p.pos.x + ux * lead, p.pos.y + 0.35, p.pos.z + uz * lead);
        for (let i = 1; i <= 20 && ok; i++) {
          const t = (i / 20) * T * 0.9;
          const f = t / T;
          b.set(p.pos.x + dx * f + ux * lead, p.pos.y + 0.35 + vy * t - 0.5 * g * t * t, p.pos.z + dz * f + uz * lead);
          if (!this.col.lineOfSight(a, b)) ok = false;
          a.copy(b);
        }
      }
      if (ok) return T;
    }
    return base;
  }

  // ---------------------------------------------------------------- CTF flags
  private buildFlags() {
    const th = this.world.theme;
    for (let t = 0; t < 2; t++) {
      const col = th.teams[t].primary;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), this.world.mats.mat(0xdddddd));
      pole.position.y = 1.3;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), this.world.mats.mat(th.accent));
      knob.position.y = 2.62;
      const clothGeo = new THREE.PlaneGeometry(1.3, 0.85, 10, 4);
      clothGeo.translate(0.65, 0, 0);
      const tex = canvasTexture(128, 96, (c, w, h) => {
        c.fillStyle = '#' + new THREE.Color(col).getHexString();
        c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 12 : 28;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          c.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
        }
        c.fill();
      });
      const clothMat = new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide });
      this.ownTextures.push(tex);
      this.ownMaterials.push(clothMat);
      const cloth = new THREE.Mesh(clothGeo, clothMat);
      cloth.position.set(0.05, 2.15, 0);
      cloth.userData.base = (clothGeo.getAttribute('position').array as Float32Array).slice();
      const flag = new THREE.Group();
      flag.add(pole, knob, cloth);
      flag.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      // base
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.18, 24), this.world.mats.mat(0x3a3a4a));
      base.position.y = 0.09;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 6, 28), this.world.mats.glow(th.teams[t].light, 1.4));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.2;
      const baseG = new THREE.Group();
      baseG.add(base, ring);
      baseG.position.set(...this.world.level.flags[t]);
      this.group.add(baseG);
      g.add(flag);
      this.group.add(g);
      this.flagMeshes.push(g);
    }
  }

  private updateFlags(_dt: number) {
    if (!(this.mode instanceof CTF)) return;
    this.mode.flags.forEach((f, i) => {
      const g = this.flagMeshes[i];
      if (f.carrier && f.carrier.model) {
        const m = f.carrier.model;
        if (g.parent !== m.flagMount) { m.flagMount.add(g); g.position.set(0, -1.2, 0); g.scale.setScalar(0.7); }
        // first-person player carrying: hide (they see HUD indicator)
      } else {
        if (g.parent !== this.group) { this.group.add(g); g.scale.setScalar(1); }
        g.position.copy(f.pos);
        g.rotation.y += 0.01;
      }
      const cloth = g.children[0].children[2] as THREE.Mesh;
      const pos = cloth.geometry.getAttribute('position') as THREE.BufferAttribute;
      const base = cloth.userData.base as Float32Array;
      for (let v = 0; v < pos.count; v++) {
        const x = base[v * 3];
        pos.setZ(v, Math.sin(x * 4 - this.time * 7) * 0.12 * x);
      }
      pos.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- KOTH zone
  private zoneGain = 1.1;
  private zoneWallOpacity = 0.16;
  private buildZone() {
    const z = this.world.level.zone;
    const g = new THREE.Group();
    const bloom = !!this.world.theme.style.bloom;
    this.zoneGain = bloom ? 0.38 : 1.1;
    this.zoneWallOpacity = bloom ? 0.06 : 0.16;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(z.radius, 0.12, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: bloom }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(z.radius, z.radius, 3, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: this.zoneWallOpacity, side: THREE.DoubleSide, depthWrite: false, toneMapped: bloom }));
    // ground disc with a dark edge so the zone reads on bright floors too
    const disc = new THREE.Mesh(new THREE.RingGeometry(z.radius - 0.35, z.radius + 0.05, 64), new THREE.MeshBasicMaterial({ color: 0x14102a, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.04;
    this.ownMaterials.push(disc.material as THREE.Material);
    this.ownMaterials.push(ring.material as THREE.Material, wall.material as THREE.Material);
    wall.position.y = 1.5;
    const crown = new THREE.Group();
    const cm = this.world.mats.glow(0xffd23f, this.world.theme.style.bloom ? 0.55 : 1.4);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.4, 12, 1, true), cm);
    (band.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
    crown.add(band);
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 4), cm);
      const a = (i / 5) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.5, 0.35, Math.sin(a) * 0.5);
      crown.add(s);
    }
    crown.position.y = 6;
    g.add(ring, wall, crown, disc);
    g.position.set(...z.pos);
    this.group.add(g);
    this.zoneMesh = g;
  }

  private updateZone(dt: number) {
    if (!(this.mode instanceof KOTH) || !this.zoneMesh) return;
    const k = this.mode;
    const th = this.world.theme;
    const col = k.contested ? (Math.floor(this.time * 6) % 2 ? 0xffffff : 0xffd23f) : k.owner < 0 ? 0xffd23f : th.teams[k.owner].light;
    const ring = this.zoneMesh.children[0] as THREE.Mesh;
    const wall = this.zoneMesh.children[1] as THREE.Mesh;
    (ring.material as THREE.MeshBasicMaterial).color.setHex(col).multiplyScalar(this.zoneGain);
    (wall.material as THREE.MeshBasicMaterial).color.setHex(col).multiplyScalar(Math.min(1, this.zoneGain * 1.5));
    (wall.material as THREE.MeshBasicMaterial).opacity = this.zoneWallOpacity + Math.sin(this.time * 3) * this.zoneWallOpacity * 0.35;
    const crown = this.zoneMesh.children[2];
    crown.rotation.y += dt;
    crown.position.y = 6 + Math.sin(this.time * 2) * 0.3;
  }

  // ---------------------------------------------------------------- Duck Rush
  duckMesh: THREE.Group | null = null;
  private buildDuck() {
    const g = new THREE.Group();
    const gold = this.world.mats.mat(0xffd21f, { emissive: 0x6a4a00, emissiveIntensity: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), gold);
    body.scale.set(1.25, 0.9, 1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), gold);
    head.position.set(0.42, 0.55, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 10), this.world.mats.mat(0xff7a1a));
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.78, 0.5, 0);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 8), gold);
    tail.rotation.z = Math.PI / 2 + 0.6;
    tail.position.set(-0.6, 0.25, 0);
    const eyeM = this.world.mats.mat(0x111111);
    for (const z of [-0.18, 0.18]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeM);
      e.position.set(0.6, 0.65, z);
      g.add(e);
    }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 32), this.world.mats.glow(0xffe066, 1.6));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.3;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 18, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beam.position.y = 9;
    this.ownMaterials.push(beam.material as THREE.Material);
    g.add(body, head, beak, tail, halo, beam);
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== beam) o.castShadow = true; });
    this.group.add(g);
    this.duckMesh = g;
  }

  private updateDuck(dt: number) {
    if (!(this.mode instanceof DuckMode) || !this.duckMesh) return;
    const d = this.mode;
    const g = this.duckMesh;
    g.rotation.y += dt * 1.5;
    const carried = !!d.carrier;
    g.position.set(d.pos.x, d.pos.y + (carried ? 2.9 : 1.1) + Math.sin(this.time * 3) * 0.15, d.pos.z);
    g.scale.setScalar(carried ? 0.6 : 1);
    // pulse the beacon so the duck reads against busy (and yellow) scenery
    const pulse = Math.sin(this.time * 5);
    const beam = g.children[g.children.length - 1] as THREE.Mesh;
    (beam.material as THREE.MeshBasicMaterial).opacity = (carried ? 0.14 : 0.26) + pulse * 0.08;
    beam.scale.set(1 + pulse * 0.12, carried ? 0.7 : 1, 1 + pulse * 0.12);
    g.children[g.children.length - 2].scale.setScalar(1 + pulse * 0.18);
  }

  dispose() {
    for (const a of this.actors) a.model?.dispose();
    for (const a of this.actors) if (a.model) this.group.remove(a.model.root);
    // everything else under the match group was built for this match only
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    this.rocketGeo.dispose();
    this.grenadeGeo.dispose();
    this.nadeLightGeo.dispose();
    this.ownTextures.forEach((t) => t.dispose());
    this.ownMaterials.forEach((m) => m.dispose());
    this.world.scene.remove(this.group);
    this.fx.clear();
  }
}
