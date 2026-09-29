import { HATS } from '../render/Character';

export interface ProfileData {
  xp: number;
  level: number;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  headshots: number;
  caps: number;
  bestStreak: number;
  playTime: number;
  worldWins: Record<string, number>;
}

const KEY = 'toonfire.profile.v1';

export function xpForLevel(level: number) {
  // XP needed to go from `level` to `level + 1`
  return 800 + (level - 1) * 350;
}

export const profile: ProfileData = (() => {
  const d: ProfileData = { xp: 0, level: 1, matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0, caps: 0, bestStreak: 0, playTime: 0, worldWins: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...d, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return d;
})();

export function saveProfile() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

/** Add XP; returns list of levels gained and hats unlocked. */
export function addXp(xp: number) {
  const gained: number[] = [];
  const unlocked: string[] = [];
  profile.xp += xp;
  while (profile.xp >= xpForLevel(profile.level)) {
    profile.xp -= xpForLevel(profile.level);
    profile.level++;
    gained.push(profile.level);
    for (const h of HATS) if (h.level === profile.level) unlocked.push(h.name);
  }
  saveProfile();
  return { gained, unlocked };
}

export function hatUnlocked(id: string) {
  const h = HATS.find((x) => x.id === id);
  return !!h && h.level <= profile.level;
}
