import type { WorldId } from '../worlds/types';
import type { ModeId } from '../modes/Modes';
import type { MatchTally } from './Challenges';
import { profile, saveProfile } from './Profile';

/** One match in the World Tour. `diff` is added to the tier's base difficulty. */
export interface TourStop {
  world: WorldId;
  mode: ModeId;
  diff: number;
  mutators: string[];
  title: string;
  blurb: string;
  star3: { text: string; test: (t: MatchTally) => boolean };
}

export const TOUR: TourStop[] = [
  { world: 'plaza', mode: 'tdm', diff: 0, mutators: [], title: 'Opening Day', blurb: 'Warm up in the sunny square. First team to the splat limit wins.', star3: { text: 'Splat 10 enemies', test: (t) => t.kills >= 10 } },
  { world: 'paper', mode: 'ctf', diff: 0, mutators: ['bighead'], title: 'Paper Chase', blurb: 'Big heads, bigger flags. Raid the cardboard castle across the river.', star3: { text: 'Capture a flag yourself', test: (t) => t.caps >= 1 } },
  { world: 'comic', mode: 'koth', diff: 1, mutators: [], title: 'Hold the Press', blurb: 'Grab the zone in the middle of the page and don’t let go.', star3: { text: 'Hold the zone for 30 s', test: (t) => t.zoneTime >= 30 } },
  { world: 'toy', mode: 'duck', diff: 1, mutators: ['lowgrav'], title: 'Rubber Ducky Rumble', blurb: 'Moon gravity in the bedroom. Whoever holds the duck scores.', star3: { text: 'Carry the duck for 15 s', test: (t) => t.duckTime >= 15 } },
  { world: 'neon', mode: 'elim', diff: 1, mutators: [], title: 'Neon Showdown', blurb: 'The final. No respawns on the rooftops. Mind the gaps.', star3: { text: 'Splat 6 enemies', test: (t) => t.kills >= 6 } },
];

export const TOUR_TIERS = [
  { name: 'Casual', base: 0, medal: '🥉', xp: 800 },
  { name: 'Standard', base: 1, medal: '🥈', xp: 1500 },
  { name: 'Brutal', base: 2, medal: '🥇', xp: 2500 },
];
export const TOUR_HEARTS = 3;
export const TOUR_STOP_XP = 300;
export const TOUR_SCORE_SCALE = 0.75;

export interface TourState {
  active: boolean;
  tier: number;
  stop: number;
  hearts: number;
  /** best stars per stop, kept across runs */
  stars: number[];
  /** highest tier completed, -1 if none */
  best: number;
  completions: number;
}

export function tourState(): TourState {
  const p = profile as unknown as { tour?: TourState };
  if (!p.tour) p.tour = { active: false, tier: 0, stop: 0, hearts: TOUR_HEARTS, stars: TOUR.map(() => 0), best: -1, completions: 0 };
  const t = p.tour;
  while (t.stars.length < TOUR.length) t.stars.push(0);
  return t;
}

export function tourDifficulty(tier: number, stop: number) {
  return Math.min(3, TOUR_TIERS[tier].base + TOUR[stop].diff);
}

export function startTour(tier: number) {
  const t = tourState();
  t.active = true;
  t.tier = tier;
  t.stop = 0;
  t.hearts = TOUR_HEARTS;
  saveProfile();
}

export function abandonTour() {
  const t = tourState();
  t.active = false;
  t.stop = 0;
  t.hearts = TOUR_HEARTS;
  saveProfile();
}

export function tourChampion() {
  return tourState().completions > 0;
}

export interface TourOutcome {
  stop: number;
  tier: number;
  won: boolean;
  draw: boolean;
  /** stars earned this match: win, MVP, stop goal */
  stars: [boolean, boolean, boolean];
  newBest: boolean;
  hearts: number;
  finished: boolean;
  failed: boolean;
  firstTrophy: boolean;
  xp: { label: string; value: number }[];
}

/** Record a finished tour match and advance the tour. */
export function applyTourResult(stop: number, won: boolean, draw: boolean, mvp: boolean, tally: MatchTally): TourOutcome {
  const t = tourState();
  const def = TOUR[stop];
  const stars: [boolean, boolean, boolean] = [won, won && mvp, won && def.star3.test(tally)];
  const n = stars.filter(Boolean).length;
  const newBest = n > t.stars[stop];
  t.stars[stop] = Math.max(t.stars[stop], n);
  const xp: { label: string; value: number }[] = [];
  let finished = false, failed = false, firstTrophy = false;
  if (won) {
    xp.push({ label: `Tour stop ${stop + 1} cleared`, value: TOUR_STOP_XP });
    if (stars[1]) xp.push({ label: '★ MVP star', value: 100 });
    if (stars[2]) xp.push({ label: `★ ${def.star3.text}`, value: 150 });
    if (stop >= TOUR.length - 1) {
      finished = true;
      firstTrophy = t.completions === 0;
      t.completions++;
      t.best = Math.max(t.best, t.tier);
      t.active = false;
      xp.push({ label: `${TOUR_TIERS[t.tier].medal} ${TOUR_TIERS[t.tier].name} World Tour complete!`, value: TOUR_TIERS[t.tier].xp });
      t.stop = 0;
      t.hearts = TOUR_HEARTS;
    } else t.stop = stop + 1;
  } else if (!draw) {
    t.hearts--;
    if (t.hearts <= 0) {
      failed = true;
      t.active = false;
      t.stop = 0;
      t.hearts = TOUR_HEARTS;
    }
  }
  saveProfile();
  return { stop, tier: t.tier, won, draw, stars, newBest, hearts: failed ? 0 : t.hearts, finished, failed, firstTrophy, xp };
}

/** Leaving (restart / quit) a tour stop after it started counts as a loss. */
export function forfeitTourStop(): { failed: boolean; hearts: number } {
  const t = tourState();
  if (!t.active) return { failed: false, hearts: t.hearts };
  t.hearts--;
  let failed = false;
  if (t.hearts <= 0) {
    failed = true;
    t.active = false;
    t.stop = 0;
    t.hearts = TOUR_HEARTS;
  }
  saveProfile();
  return { failed, hearts: failed ? 0 : t.hearts };
}
