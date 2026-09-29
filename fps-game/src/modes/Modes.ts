import * as THREE from 'three';
import type { Actor } from '../entities/Actor';
import type { BotGoal } from '../entities/Bot';
import type { Match } from '../game/Match';
import { pick } from '../core/utils';

export type ModeId = 'tdm' | 'ctf' | 'koth' | 'elim';

export interface ModeInfo {
  id: ModeId;
  name: string;
  short: string;
  desc: string;
  icon: string;
  baseScore: number;
  time: number; // seconds
}

export const MODE_INFO: Record<ModeId, ModeInfo> = {
  tdm: { id: 'tdm', name: 'Team Splat', short: 'TDM', desc: 'Classic team deathmatch. First team to the kill limit wins.', icon: '💥', baseScore: 30, time: 360 },
  ctf: { id: 'ctf', name: 'Capture the Flag', short: 'CTF', desc: "Grab the enemy flag and bring it home. Your own flag must be at base to score.", icon: '🚩', baseScore: 3, time: 480 },
  koth: { id: 'koth', name: 'King of the Hill', short: 'KOTH', desc: 'Hold the glowing zone. Every second your team controls it scores a point.', icon: '👑', baseScore: 100, time: 420 },
  elim: { id: 'elim', name: 'Elimination', short: 'ELIM', desc: 'No respawns. Wipe out the other team to win the round. First to 4 rounds.', icon: '☠️', baseScore: 4, time: 900 },
};

export const MODE_ORDER: ModeId[] = ['tdm', 'ctf', 'koth', 'elim'];

export interface Objective {
  /** Short line under the score (e.g. "Flag taken!"). */
  status: string;
  /** For CTF: flag states per team. */
  flags?: [string, string];
  /** For KOTH: zone owner -1/0/1 and contested flag. */
  zone?: { owner: number; contested: boolean; progress: number };
  /** For elimination: alive counts. */
  alive?: [number, number];
  round?: number;
}

export abstract class Mode {
  abstract info: ModeInfo;
  respawn = true;
  respawnTime = 3;
  scoreLimit = 0;
  setup(_m: Match) {}
  update(_m: Match, _dt: number) {}
  onKill(m: Match, killer: Actor | null, victim: Actor) {
    void m; void killer; void victim;
  }
  abstract goalFor(m: Match, a: Actor): BotGoal;
  objective(_m: Match): Objective {
    return { status: '' };
  }
  /** Winner team or -1 for draw when time runs out. */
  timeUp(m: Match): number {
    return m.score[0] === m.score[1] ? -1 : m.score[0] > m.score[1] ? 0 : 1;
  }

  /** Generic roaming goal: hotspots, pickups, enemy half, near teammates. */
  protected roam(m: Match, a: Actor): BotGoal {
    const lv = m.world.level;
    const spots = (lv.hotspots ?? []).map((h) => new THREE.Vector3(...h));
    spots.push(new THREE.Vector3(...lv.zone.pos));
    const r = Math.random();
    // blue bots sometimes stick with the human player
    const pl = m.player;
    if (pl && pl.alive && a.team === pl.team && r < 0.3) {
      return { kind: 'escort', pos: pl.pos.clone(), radius: 5, urgency: 0.2, follow: pl };
    }
    if (r < 0.55) {
      // go where the enemies were last seen / enemy half
      const enemies = m.actors.filter((e) => e.team !== a.team && e.alive);
      if (enemies.length) {
        const e = pick(enemies);
        return { kind: 'attack', pos: e.pos.clone(), radius: 6, urgency: 0.15 };
      }
    }
    const p = spots.length ? pick(spots) : m.world.nav.cellCenter(m.world.nav.randomCell());
    return { kind: 'roam', pos: p, radius: 4, urgency: 0.1 };
  }
}

export class TDM extends Mode {
  info = MODE_INFO.tdm;
  onKill(m: Match, killer: Actor | null, victim: Actor) {
    const team = killer && killer !== victim ? killer.team : victim.team === 0 ? 1 : 0;
    m.addScore(team, 1);
  }
  goalFor(m: Match, a: Actor): BotGoal {
    return this.roam(m, a);
  }
  objective(m: Match): Objective {
    const lead = m.score[0] - m.score[1];
    return { status: lead === 0 ? 'Tied!' : lead > 0 ? `Blue leads by ${lead}` : `Red leads by ${-lead}` };
  }
}

export interface FlagState {
  team: 0 | 1;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  carrier: Actor | null;
  atHome: boolean;
  dropTimer: number;
}

export class CTF extends Mode {
  info = MODE_INFO.ctf;
  respawnTime = 5;
  flags: FlagState[] = [];
  private roles = new Map<number, 'attack' | 'defend' | 'mid'>();

  setup(m: Match) {
    this.flags = [0, 1].map((t) => {
      const home = new THREE.Vector3(...m.world.level.flags[t]);
      return { team: t as 0 | 1, home, pos: home.clone(), carrier: null, atHome: true, dropTimer: 0 };
    });
    // assign roles
    for (const t of [0, 1]) {
      const team = m.actors.filter((a) => a.team === t && !a.isPlayer);
      team.forEach((a, i) => this.roles.set(a.id, i === 0 ? 'defend' : 'attack'));
    }
  }

  update(m: Match, dt: number) {
    for (const f of this.flags) {
      if (f.carrier) {
        if (!f.carrier.alive) this.drop(m, f);
        else f.pos.copy(f.carrier.pos);
        continue;
      }
      if (!f.atHome) {
        f.dropTimer -= dt;
        if (f.dropTimer <= 0) {
          this.returnFlag(m, f, null);
          continue;
        }
      }
      for (const a of m.actors) {
        if (!a.alive) continue;
        const d = Math.hypot(a.pos.x - f.pos.x, a.pos.z - f.pos.z);
        if (d > 1.4 || Math.abs(a.pos.y - f.pos.y) > 2) continue;
        if (a.team !== f.team) {
          // grab
          if (a.carrying >= 0) continue;
          f.carrier = a;
          f.atHome = false;
          a.carrying = f.team;
          m.emit({ type: 'flag', action: 'taken', team: f.team, actor: a });
          break;
        } else if (!f.atHome) {
          a.stats.returns++;
          a.stats.score += 50;
          this.returnFlag(m, f, a);
          break;
        } else if (a.carrying >= 0) {
          // capture: own flag at home, carrying enemy flag
          const enemy = this.flags[a.carrying];
          a.stats.caps++;
          a.stats.score += 300;
          m.addScore(a.team, 1);
          m.emit({ type: 'flag', action: 'captured', team: enemy.team, actor: a });
          enemy.carrier = null;
          a.carrying = -1;
          enemy.atHome = true;
          enemy.pos.copy(enemy.home);
          break;
        }
      }
    }
  }

  drop(m: Match, f: FlagState) {
    const c = f.carrier;
    if (c) c.carrying = -1;
    f.carrier = null;
    f.atHome = false;
    f.dropTimer = 20;
    if (c) {
      f.pos.copy(c.pos);
      // if dropped into the void, return immediately
      if (c.pos.y < m.world.level.killY + 2) {
        this.returnFlag(m, f, null);
        return;
      }
      // settle on ground
      const g = m.world.col.groundHeight(f.pos.x, f.pos.z, 0.3, f.pos.y + 1);
      if (g > -Infinity) f.pos.y = g;
    }
    m.emit({ type: 'flag', action: 'dropped', team: f.team, actor: c });
  }

  returnFlag(m: Match, f: FlagState, by: Actor | null) {
    f.carrier = null;
    f.atHome = true;
    f.pos.copy(f.home);
    m.emit({ type: 'flag', action: 'returned', team: f.team, actor: by });
  }

  onKill(m: Match, killer: Actor | null, victim: Actor) {
    void m; void killer; void victim;
  }

  goalFor(m: Match, a: Actor): BotGoal {
    const own = this.flags[a.team];
    const enemy = this.flags[a.team ? 0 : 1];
    if (a.carrying >= 0) {
      return { kind: 'return', pos: own.home.clone(), radius: 0.5, urgency: 1 };
    }
    // own flag stolen: hunt the carrier / recover dropped flag
    if (!own.atHome) {
      if (own.carrier) return { kind: 'chase', pos: own.carrier.pos.clone(), radius: 2, urgency: 0.6 };
      return { kind: 'capture', pos: own.pos.clone(), radius: 0.5, urgency: 0.8 };
    }
    if (enemy.carrier && enemy.carrier.team === a.team) {
      return { kind: 'escort', pos: enemy.carrier.pos.clone(), radius: 5, urgency: 0.35, follow: enemy.carrier };
    }
    const role = this.roles.get(a.id) ?? 'attack';
    if (role === 'defend') return { kind: 'defend', pos: own.home.clone(), radius: 7, urgency: 0.2 };
    if (role === 'mid') {
      if (Math.random() < 0.5) return this.roam(m, a);
    }
    return { kind: 'attack', pos: enemy.pos.clone(), radius: 0.5, urgency: 0.72 };
  }

  objective(_m: Match): Objective {
    const st = (f: FlagState) => (f.carrier ? `TAKEN by ${f.carrier.name}` : f.atHome ? 'At base' : 'Dropped!');
    return { status: '', flags: [st(this.flags[0]), st(this.flags[1])] };
  }
}

export class KOTH extends Mode {
  info = MODE_INFO.koth;
  owner = -1;
  contested = false;
  private acc = 0;
  progress = 0;
  private capTeam = -1;
  center = new THREE.Vector3();
  radius = 6;

  setup(m: Match) {
    this.center.set(...m.world.level.zone.pos);
    this.radius = m.world.level.zone.radius;
  }

  inZone(a: Actor) {
    return a.alive && Math.hypot(a.pos.x - this.center.x, a.pos.z - this.center.z) < this.radius && Math.abs(a.pos.y - this.center.y) < 4;
  }

  update(m: Match, dt: number) {
    const count = [0, 0];
    for (const a of m.actors) if (this.inZone(a)) { count[a.team]++; a.stats.zoneTime += dt; }
    this.contested = count[0] > 0 && count[1] > 0;
    const present = count[0] > 0 ? (count[1] > 0 ? -2 : 0) : count[1] > 0 ? 1 : -1;
    if (present >= 0 && present !== this.owner) {
      // capturing
      if (this.capTeam !== present) { this.capTeam = present; this.progress = 0; }
      this.progress += dt * (0.6 + 0.2 * count[present]);
      if (this.progress >= 1) {
        this.owner = present;
        this.progress = 0;
        m.emit({ type: 'zone', team: present });
      }
    } else if (present === -1) {
      this.progress = Math.max(0, this.progress - dt * 0.5);
    }
    if (this.owner >= 0 && !this.contested) {
      this.acc += dt;
      while (this.acc >= 1) {
        this.acc -= 1;
        m.addScore(this.owner as 0 | 1, 1);
        for (const a of m.actors) if (a.team === this.owner && this.inZone(a)) a.stats.score += 5;
      }
    }
  }

  goalFor(m: Match, a: Actor): BotGoal {
    if (Math.random() < 0.15) return this.roam(m, a);
    const urg = this.owner === a.team ? 0.35 : 0.65;
    return { kind: 'hold', pos: this.center.clone(), radius: this.radius * 0.7, urgency: urg };
  }

  objective(_m: Match): Objective {
    return {
      status: this.contested ? 'CONTESTED!' : this.owner < 0 ? 'Zone is neutral' : this.owner === 0 ? 'Blue holds the zone' : 'Red holds the zone',
      zone: { owner: this.owner, contested: this.contested, progress: this.progress },
    };
  }
}

export class Elimination extends Mode {
  info = MODE_INFO.elim;
  respawn = false;
  round = 1;
  roundOver = 0;
  roundTime = 0;

  setup(_m: Match) {
    this.round = 1;
    this.roundTime = 0;
  }

  update(m: Match, dt: number) {
    if (m.state !== 'playing') return;
    this.roundTime += dt;
    if (this.roundOver > 0) {
      this.roundOver -= dt;
      if (this.roundOver <= 0) {
        this.round++;
        this.roundTime = 0;
        m.respawnAll();
        m.emit({ type: 'message', text: `ROUND ${this.round}`, big: true });
      }
      return;
    }
    const alive = [0, 1].map((t) => m.actors.filter((a) => a.team === t && a.alive).length);
    let winner = -1;
    if (alive[0] === 0 && alive[1] > 0) winner = 1;
    else if (alive[1] === 0 && alive[0] > 0) winner = 0;
    else if (alive[0] === 0 && alive[1] === 0) winner = -2;
    else if (this.roundTime > 100) winner = alive[0] > alive[1] ? 0 : alive[1] > alive[0] ? 1 : -2;
    if (winner !== -1) {
      if (winner >= 0) m.addScore(winner as 0 | 1, 1);
      this.roundOver = 4;
      m.emit({ type: 'round', team: winner });
    }
  }

  goalFor(m: Match, a: Actor): BotGoal {
    const alive = m.actors.filter((e) => e.team !== a.team && e.alive);
    const mine = m.actors.filter((e) => e.team === a.team && e.alive).length;
    // later in the round, hunt aggressively
    if (alive.length && (this.roundTime > 25 || mine > alive.length)) {
      const e = pick(alive);
      return { kind: 'attack', pos: e.pos.clone(), radius: 4, urgency: 0.2 };
    }
    return this.roam(m, a);
  }

  objective(m: Match): Objective {
    const alive = [0, 1].map((t) => m.actors.filter((a) => a.team === t && a.alive).length) as [number, number];
    return { status: `Round ${this.round}`, alive, round: this.round };
  }
}

export function createMode(id: ModeId): Mode {
  switch (id) {
    case 'ctf': return new CTF();
    case 'koth': return new KOTH();
    case 'elim': return new Elimination();
    default: return new TDM();
  }
}

export const MUTATORS: { id: string; name: string; desc: string }[] = [
  { id: 'bighead', name: 'Big Heads', desc: 'Everyone gets a giant noggin. Easier headshots!' },
  { id: 'lowgrav', name: 'Moon Gravity', desc: 'Floaty jumps and huge rocket jumps.' },
  { id: 'turbo', name: 'Turbo', desc: '40% faster movement and fire rate.' },
  { id: 'instagib', name: 'One Zap', desc: 'Everyone gets an infinite Zapper. One hit kills.' },
  { id: 'infinite', name: 'Bottomless Ammo', desc: 'Never reload, never run dry.' },
  { id: 'vampire', name: 'Vampire', desc: 'Dealing damage heals you.' },
];
