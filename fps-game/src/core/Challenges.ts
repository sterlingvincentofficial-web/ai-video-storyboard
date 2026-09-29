import { mulberry } from './utils';
import { profile, saveProfile } from './Profile';

/** Stats gathered for the human player during one match. */
export interface MatchTally {
  kills: number;
  headshots: number;
  weaponKills: Record<string, number>;
  bestStreak: number;
  caps: number;
  zoneTime: number;
  duckTime: number;
  doubleJumps: number;
  pickups: number;
  won: boolean;
  mode: string;
  world: string;
  played: boolean;
}

export function emptyTally(mode: string, world: string): MatchTally {
  return { kills: 0, headshots: 0, weaponKills: {}, bestStreak: 0, caps: 0, zoneTime: 0, duckTime: 0, doubleJumps: 0, pickups: 0, won: false, mode, world, played: true };
}

interface ChallengeDef {
  id: string;
  text: string;
  goal: number;
  add: (t: MatchTally) => number;
}

const WORLD_NAMES: Record<string, string> = { plaza: 'Splat Plaza', paper: 'Paper Fort', comic: 'Ink City', toy: 'Toy Box', neon: 'Neon Rooftops' };
const MODE_NAMES: Record<string, string> = { tdm: 'Team Splat', ctf: 'Capture the Flag', koth: 'King of the Hill', duck: 'Duck Rush', elim: 'Elimination' };
const WEAPON_NAMES: Record<string, string> = { blaster: 'the Blaster', scatter: 'the Scatter', boomer: 'the Boomer', zapper: 'the Zapper', grenade: 'Splat Bombs' };

const POOL: ChallengeDef[] = [
  { id: 'kills20', text: 'Splat 20 enemies', goal: 20, add: (t) => t.kills },
  { id: 'kills40', text: 'Splat 40 enemies', goal: 40, add: (t) => t.kills },
  { id: 'hs5', text: 'Land 5 headshot kills', goal: 5, add: (t) => t.headshots },
  { id: 'streak5', text: 'Get a 5-splat streak', goal: 1, add: (t) => (t.bestStreak >= 5 ? 1 : 0) },
  { id: 'dj30', text: 'Double-jump 30 times', goal: 30, add: (t) => t.doubleJumps },
  { id: 'pick10', text: 'Grab 10 pickups', goal: 10, add: (t) => t.pickups },
  { id: 'wins2', text: 'Win 2 matches', goal: 2, add: (t) => (t.won ? 1 : 0) },
  { id: 'caps2', text: 'Capture 2 flags', goal: 2, add: (t) => t.caps },
  { id: 'zone60', text: 'Stand in the KOTH zone for 60 s', goal: 60, add: (t) => Math.round(t.zoneTime) },
  { id: 'duck30', text: 'Carry the duck for 30 s', goal: 30, add: (t) => Math.round(t.duckTime) },
  ...['blaster', 'scatter', 'boomer', 'zapper', 'grenade'].map((w) => ({ id: `w_${w}`, text: `Splat 6 enemies with ${WEAPON_NAMES[w]}`, goal: 6, add: (t: MatchTally) => t.weaponKills[w] ?? 0 })),
  ...Object.keys(WORLD_NAMES).map((w) => ({ id: `win_${w}`, text: `Win a match in ${WORLD_NAMES[w]}`, goal: 1, add: (t: MatchTally) => (t.won && t.world === w ? 1 : 0) })),
  ...Object.keys(MODE_NAMES).map((m) => ({ id: `mode_${m}`, text: `Play 2 matches of ${MODE_NAMES[m]}`, goal: 2, add: (t: MatchTally) => (t.mode === m ? 1 : 0) })),
];

export const CHALLENGE_XP = 500;

interface Stored { date: string; items: { id: string; progress: number; done: boolean }[] }

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function stored(): Stored {
  const p = profile as unknown as { challenges?: Stored };
  const date = today();
  if (!p.challenges || p.challenges.date !== date) {
    let seed = 0;
    for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const r = mulberry(seed);
    const picks: ChallengeDef[] = [];
    const pool = [...POOL];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    p.challenges = { date, items: picks.map((c) => ({ id: c.id, progress: 0, done: false })) };
    saveProfile();
  }
  return p.challenges;
}

export function dailyChallenges() {
  return stored().items.map((it) => {
    const def = POOL.find((c) => c.id === it.id)!;
    return { ...it, text: def?.text ?? it.id, goal: def?.goal ?? 1 };
  });
}

/** Apply a finished match; returns challenges completed by it. */
export function applyTally(t: MatchTally): string[] {
  const s = stored();
  const done: string[] = [];
  for (const it of s.items) {
    if (it.done) continue;
    const def = POOL.find((c) => c.id === it.id);
    if (!def) continue;
    it.progress = Math.min(def.goal, it.progress + def.add(t));
    if (it.progress >= def.goal) {
      it.done = true;
      done.push(def.text);
    }
  }
  saveProfile();
  return done;
}
