import type { WorldDef } from './types';
import { layout } from './neon/layout';
import { build } from './neon/build';
import img from '../assets/neon.webp';

export const neon: WorldDef = {
  theme: {
    id: 'neon',
    name: 'Neon Rooftops',
    tagline: 'Synthwave laser tag across glowing city rooftops.',
    image: img,
    teams: [
      { name: 'Blue', primary: 0x19c8ff, secondary: 0x0a6cff, dark: 0x0b1a4a, light: 0xa6f2ff },
      { name: 'Red', primary: 0xff2d6f, secondary: 0xd4135a, dark: 0x4a0b25, light: 0xffa6c8 },
    ],
    style: {
      outlineColor: 0x0a0420,
      outlineWidth: 1.4,
      outlineStrength: 1,
      outlineSensitivity: 1,
      neonEdges: 0.9,
      saturation: 1.2,
      contrast: 1.06,
      brightness: 0,
      tint: 0xeee4ff,
      halftone: 0,
      halftoneScale: 5,
      paper: 0,
      grain: 0.02,
      vignette: 0.35,
      posterize: 0,
      bloom: { strength: 0.95, radius: 0.5, threshold: 0.68 },
      exposure: 1,
    },
    material: 'neon',
    hudClass: 'hud-neon',
    impact: 'laser',
    character: { hat: 'visor', skin: 0xffd0b5, glove: 0x1a1638, shoe: 0x141030, emblem: 'cat' },
    botNames: [
      ['Spark', 'Zephyr', 'Nova', 'Glitch', 'Pixel', 'Echo'],
      ['Blaze', 'Volt', 'Raven', 'Ember', 'Vixen', 'Havoc'],
    ],
    background: 0x1a0b3d,
    fog: { color: 0x2b1260, near: 45, far: 200 },
    sun: { color: 0xff9ad5, intensity: 1.6, dir: [0.35, 0.85, -0.55] },
    hemi: { sky: 0x7a6cff, ground: 0xff4fb8, intensity: 1.1 },
    ambient: 0.2,
    hitWords: ['ZAP!', 'BZZT!', 'PEW!', 'KRZZT!', 'FZZT!'],
    weaponNames: { blaster: 'Pulse Blaster', scatter: 'Prism Scatter', boomer: 'Plasma Boomer', zapper: 'Laser Zapper' },
    accent: 0xff4fd8,
  },
  level: layout,
  build,
};
