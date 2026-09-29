import type { Quality, WorldId } from '../worlds/types';
import { isMobileLike } from './utils';

export interface SettingsData {
  sensitivity: number; // mouse
  touchSensitivity: number;
  invertY: boolean;
  fov: number;
  quality: Quality;
  renderScale: number; // 0.5..1
  master: number;
  music: number;
  sfx: number;
  showFps: boolean;
  damageNumbers: boolean;
  aimAssist: boolean;
  autoFire: boolean; // mobile: fire automatically when crosshair is on an enemy
  touchScale: number;
  playerName: string;
  hat: string;
  lastWorld: WorldId;
  lastMode: string;
  difficulty: number; // 0 easy .. 3 insane
  scoreLimitScale: number; // 0.5 / 1 / 1.5
  mutators: string[];
  screenShake: boolean;
  crosshair: number;
}

const KEY = 'toonfire.settings.v1';

function defaults(): SettingsData {
  const mobile = isMobileLike();
  return {
    sensitivity: 1,
    touchSensitivity: 1,
    invertY: false,
    fov: mobile ? 80 : 90,
    quality: mobile ? 'medium' : 'high',
    renderScale: 1,
    master: 0.8,
    music: 0.55,
    sfx: 0.85,
    showFps: false,
    damageNumbers: true,
    aimAssist: mobile,
    autoFire: false,
    touchScale: 1,
    playerName: 'You',
    hat: 'default',
    lastWorld: 'plaza',
    lastMode: 'tdm',
    difficulty: 1,
    scoreLimitScale: 1,
    mutators: [],
    screenShake: true,
    crosshair: 0,
  };
}

export const settings: SettingsData = (() => {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...d, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return d;
})();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function resetSettings() {
  Object.assign(settings, defaults());
  saveSettings();
}
