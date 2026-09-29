import type * as THREE from 'three';
import type { LevelData } from '../world/Level';
import type { MaterialKit } from '../render/Materials';
import type { Batcher } from '../render/Batcher';

export type WorldId = 'plaza' | 'paper' | 'comic' | 'toy' | 'neon';
export type Quality = 'low' | 'medium' | 'high' | 'ultra';

/** Post-processing look. Every value is interpreted by render/Pipeline.ts. */
export interface StyleParams {
  outlineColor: number;
  /** Pixels (scaled by resolution). 0 disables outlines. */
  outlineWidth: number;
  /** 0..1 opacity of outlines. */
  outlineStrength: number;
  /** Higher = more edges detected (creases). ~1 is default. */
  outlineSensitivity: number;
  /** 0..1: outline colour taken from the (brightened) scene colour instead — neon glow lines. */
  neonEdges: number;
  saturation: number;
  contrast: number;
  brightness: number;
  /** Multiplied into the final colour. */
  tint: number;
  /** 0..1 comic Ben-Day dots in shadows. */
  halftone: number;
  /** Dot cell size in pixels. */
  halftoneScale: number;
  /** 0..1 paper fibre texture overlay. */
  paper: number;
  /** 0..1 film grain. */
  grain: number;
  /** 0..1 vignette. */
  vignette: number;
  /** 0 = off, otherwise number of colour levels per channel. */
  posterize: number;
  bloom: { strength: number; radius: number; threshold: number } | null;
  exposure: number;
}

export interface TeamPalette {
  name: string;
  primary: number;
  secondary: number;
  dark: number;
  light: number;
}

export type MaterialStyle = 'toon' | 'glossy' | 'paper' | 'neon' | 'comic';
export type ImpactStyle = 'paint' | 'paper' | 'ink' | 'dart' | 'laser';
export type HatStyle = 'cap' | 'helmet' | 'mask' | 'army' | 'visor';

export interface CharacterStyle {
  /** Default headgear for bots in this world (player cosmetics can override). */
  hat: HatStyle;
  skin: number;
  glove: number;
  shoe: number;
  /** Flat paper-cutout look (squashes characters in depth). */
  flat?: boolean;
  /** Show backpack. */
  backpack?: boolean;
  /** Emblem shape drawn on chest: star, splat, crown, bolt, cat. */
  emblem?: 'star' | 'splat' | 'crown' | 'bolt' | 'cat';
  /** Material override for characters (e.g. glossy vinyl toys). */
  material?: MaterialStyle;
}

export interface WorldTheme {
  id: WorldId;
  name: string;
  tagline: string;
  /** Menu art image URL. */
  image: string;
  teams: [TeamPalette, TeamPalette];
  style: StyleParams;
  material: MaterialStyle;
  /** CSS class applied to <body> while this world is active: hud-plaza etc. */
  hudClass: string;
  impact: ImpactStyle;
  character: CharacterStyle;
  botNames: [string[], string[]];
  background: number;
  fog: { color: number; near: number; far: number } | null;
  sun: { color: number; intensity: number; dir: [number, number, number] };
  hemi: { sky: number; ground: number; intensity: number };
  ambient?: number;
  /** Words that pop out of hits (POW!, SPLAT!...). */
  hitWords: string[];
  /** Weapon display names per world. */
  weaponNames?: Partial<Record<'blaster' | 'scatter' | 'boomer' | 'zapper', string>>;
  /** Colour of neutral objects like pickups & flags pole. */
  accent: number;
}

export interface WorldBuildContext {
  scene: THREE.Scene;
  level: LevelData;
  mats: MaterialKit;
  batch: Batcher;
  quality: Quality;
  /** Register a per-frame animation callback (clouds, flickering signs...). */
  animate(fn: (dt: number, time: number) => void): void;
}

export interface WorldDef {
  theme: WorldTheme;
  /** Deterministic collision layout. */
  level(): LevelData;
  /** Build visuals: environment meshes, sky, lights are created by the engine from theme. */
  build(ctx: WorldBuildContext): void;
}
