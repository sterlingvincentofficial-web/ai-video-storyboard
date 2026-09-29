import type { WorldDef } from './types';
import img from '../assets/comic.webp';
import { layout } from './comic/layout';
import { buildComic, BLUE, RED } from './comic/build';

export const comic: WorldDef = {
  theme: {
    id: 'comic',
    name: 'Ink City',
    tagline: 'A living comic-book page: heroes and villains brawl across a retro city block.',
    image: img,
    teams: [
      { name: 'Blue', primary: BLUE, secondary: 0x0b3aa8, dark: 0x06205e, light: 0x8cb6ff },
      { name: 'Red', primary: RED, secondary: 0xa3101a, dark: 0x5c0710, light: 0xff9c9c },
    ],
    style: {
      outlineColor: 0x120c18,
      outlineWidth: 2.4,
      outlineStrength: 1,
      outlineSensitivity: 1.15,
      neonEdges: 0,
      saturation: 1.32,
      contrast: 1.12,
      brightness: 0.0,
      tint: 0xfffaf0,
      halftone: 0.85,
      halftoneScale: 5.5,
      paper: 0.1,
      grain: 0,
      vignette: 0.18,
      posterize: 0,
      bloom: null,
      exposure: 1.02,
    },
    material: 'comic',
    hudClass: 'hud-comic',
    impact: 'ink',
    character: { hat: 'mask', skin: 0xf6c9a0, glove: 0xffffff, shoe: 0xffffff, emblem: 'star', backpack: false },
    botNames: [
      ['CaptainKapow', 'BlueBolt', 'StarSpangle', 'MightyMo', 'JusticeJet', 'ZipZoom'],
      ['DoctorDread', 'CrimsonCrook', 'MadameMayhem', 'BaronBlam', 'RedRascal', 'ViperVex'],
    ],
    background: 0x9fd2ff,
    fog: { color: 0xc6e4ff, near: 95, far: 280 },
    sun: { color: 0xfff1d8, intensity: 2.7, dir: [0.55, 1, 0.3] },
    hemi: { sky: 0xd4e8ff, ground: 0xe6cfa6, intensity: 1.25 },
    hitWords: ['POW!', 'ZAP!', 'BAM!', 'KAPOW!', 'WHAM!', 'BIFF!', 'THWACK!'],
    weaponNames: { blaster: 'Ray Blaster', scatter: 'Scatter Zapper', boomer: 'Kaboom Cannon', zapper: 'Justice Beam' },
    accent: 0xffd21f,
  },
  level: layout,
  build: buildComic,
};
