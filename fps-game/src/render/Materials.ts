import * as THREE from 'three';
import type { MaterialStyle } from '../worlds/types';
import { mulberry } from '../core/utils';

/** Toon gradient ramps (DataTexture with nearest filtering). */
const gradCache = new Map<string, THREE.DataTexture>();
export function gradientMap(steps: number[]): THREE.DataTexture {
  const key = steps.join(',');
  let t = gradCache.get(key);
  if (t) return t;
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(v * 255);
    data[i * 4 + 3] = 255;
  });
  t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  gradCache.set(key, t);
  return t;
}

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, opts: { repeat?: boolean; srgb?: boolean; mip?: boolean } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (opts.mip === false) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
  }
  return t;
}

/** Grey paper fibre texture (to be multiplied by material colour). */
let paperTex: THREE.Texture | null = null;
export function paperTexture() {
  if (paperTex) return paperTex;
  paperTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#f4f1ea';
    g.fillRect(0, 0, w, h);
    const r = mulberry(7);
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = r() * h, l = 2 + r() * 10, a = r() * Math.PI;
      const c = 200 + Math.floor(r() * 55);
      g.strokeStyle = `rgba(${c - 30},${c - 34},${c - 40},${0.08 + r() * 0.18})`;
      g.lineWidth = 0.6 + r();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(120,110,95,${r() * 0.12})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
  }, { repeat: true });
  paperTex.repeat.set(1, 1);
  return paperTex;
}

/** Corrugated cardboard stripes. */
let cardTex: THREE.Texture | null = null;
export function cardboardTexture() {
  if (cardTex) return cardTex;
  cardTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#efe6d6';
    g.fillRect(0, 0, w, h);
    const r = mulberry(11);
    for (let y = 0; y < h; y += 8) {
      g.fillStyle = `rgba(150,120,80,${0.08 + r() * 0.05})`;
      g.fillRect(0, y, w, 3);
    }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(110,85,50,${r() * 0.12})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1);
    }
  }, { repeat: true });
  return cardTex;
}

export interface MatOpts {
  emissive?: number;
  emissiveIntensity?: number;
  map?: THREE.Texture | null;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  /** Override the theme material style for this material. */
  style?: MaterialStyle;
  roughness?: number;
  flatShading?: boolean;
  vertexColors?: boolean;
  /** Skip lighting entirely. */
  unlit?: boolean;
  fog?: boolean;
}

/** Theme-aware cached material factory. */
export class MaterialKit {
  private cache = new Map<string, THREE.Material>();
  envMap: THREE.Texture | null = null;

  constructor(public style: MaterialStyle) {}

  mat(color: number, o: MatOpts = {}): THREE.Material {
    const style = o.style ?? this.style;
    const key = [style, color, o.emissive ?? '', o.emissiveIntensity ?? '', o.map?.uuid ?? '', o.transparent ? 1 : 0, o.opacity ?? 1, o.side ?? 0, o.roughness ?? '', o.flatShading ? 1 : 0, o.vertexColors ? 1 : 0, o.unlit ? 1 : 0, o.fog === false ? 0 : 1].join('|');
    let m = this.cache.get(key);
    if (m) return m;
    m = this.create(style, color, o);
    this.cache.set(key, m);
    return m;
  }

  private create(style: MaterialStyle, color: number, o: MatOpts): THREE.Material {
    const common = {
      color,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
      vertexColors: o.vertexColors ?? false,
      fog: o.fog ?? true,
    };
    if (o.unlit) return new THREE.MeshBasicMaterial({ ...common, map: o.map ?? null });
    switch (style) {
      case 'glossy': {
        const m = new THREE.MeshPhysicalMaterial({
          ...common,
          map: o.map ?? null,
          roughness: o.roughness ?? 0.32,
          metalness: 0,
          clearcoat: 0.8,
          clearcoatRoughness: 0.2,
          emissive: o.emissive ?? 0x000000,
          emissiveIntensity: o.emissiveIntensity ?? 1,
          flatShading: o.flatShading ?? false,
        });
        if (this.envMap) m.envMap = this.envMap;
        m.envMapIntensity = 0.7;
        return m;
      }
      case 'paper':
        return new THREE.MeshToonMaterial({
          ...common,
          map: o.map === undefined ? paperTexture() : o.map,
          gradientMap: gradientMap([0.55, 0.8, 1]),
          emissive: o.emissive ?? 0x000000,
          emissiveIntensity: o.emissiveIntensity ?? 1,
        });
      case 'comic':
        return new THREE.MeshToonMaterial({
          ...common,
          map: o.map ?? null,
          gradientMap: gradientMap([0.42, 1]),
          emissive: o.emissive ?? 0x000000,
          emissiveIntensity: o.emissiveIntensity ?? 1,
        });
      case 'neon':
        return new THREE.MeshToonMaterial({
          ...common,
          map: o.map ?? null,
          gradientMap: gradientMap([0.35, 0.7, 1]),
          emissive: o.emissive ?? 0x000000,
          emissiveIntensity: o.emissiveIntensity ?? 1,
        });
      case 'toon':
      default:
        return new THREE.MeshToonMaterial({
          ...common,
          map: o.map ?? null,
          gradientMap: gradientMap([0.5, 0.78, 1]),
          emissive: o.emissive ?? 0x000000,
          emissiveIntensity: o.emissiveIntensity ?? 1,
        });
    }
  }

  /** Emissive glowing material (neon signs, pickups). Unaffected by lights. */
  glow(color: number, intensity = 1): THREE.Material {
    const key = `glow|${color}|${intensity}`;
    let m = this.cache.get(key);
    if (m) return m;
    const c = new THREE.Color(color).multiplyScalar(intensity);
    m = new THREE.MeshBasicMaterial({ color: c, fog: false, toneMapped: false });
    this.cache.set(key, m);
    return m;
  }

  dispose() {
    this.cache.forEach((m) => m.dispose());
    this.cache.clear();
  }
}

/** Text drawn onto a canvas texture (signs, posters, flags). */
export function textTexture(
  text: string,
  o: { w?: number; h?: number; bg?: string; fg?: string; font?: string; stroke?: string; strokeWidth?: number; border?: string; lines?: string[]; tilt?: number } = {},
) {
  const w = o.w ?? 512, h = o.h ?? 256;
  return canvasTexture(w, h, (g) => {
    if (o.bg) {
      g.fillStyle = o.bg;
      g.fillRect(0, 0, w, h);
    }
    if (o.border) {
      g.strokeStyle = o.border;
      g.lineWidth = Math.max(6, w * 0.02);
      g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
    }
    const lines = o.lines ?? text.split('\n');
    const font = o.font ?? '900 {s}px "Luckiest Guy", "Bangers", Impact, sans-serif';
    let size = Math.floor(h / (lines.length + 0.6));
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.save();
    g.translate(w / 2, h / 2);
    if (o.tilt) g.rotate(o.tilt);
    for (;;) {
      g.font = font.replace('{s}', String(size));
      const maxW = Math.max(...lines.map((l) => g.measureText(l).width));
      if (maxW < w * 0.9 || size < 10) break;
      size -= 4;
    }
    lines.forEach((l, i) => {
      const y = (i - (lines.length - 1) / 2) * size * 1.05;
      if (o.stroke) {
        g.lineJoin = 'round';
        g.strokeStyle = o.stroke;
        g.lineWidth = o.strokeWidth ?? size * 0.14;
        g.strokeText(l, 0, y);
      }
      g.fillStyle = o.fg ?? '#fff';
      g.fillText(l, 0, y);
    });
    g.restore();
  });
}
