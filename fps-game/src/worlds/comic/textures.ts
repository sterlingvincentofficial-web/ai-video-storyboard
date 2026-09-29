import * as THREE from 'three';
import { canvasTexture } from '../../render/Materials';
import { mulberry } from '../../core/utils';

/** Canvas textures for Ink City: everything is hand-"inked" with dark outlines and Ben-Day dots. */

export const INK = '#17111f';
export const FONT = '"Bangers", "Luckiest Guy", Impact, "Arial Black", sans-serif';
type G = CanvasRenderingContext2D;
type Draw = (g: G, w: number, h: number) => void;

/**
 * Canvas texture that redraws itself once the comic web fonts are ready
 * (the world may be built before Google Fonts finished loading).
 */
export function inkTex(w: number, h: number, draw: Draw, opts: { repeat?: boolean } = {}, usesFont = false) {
  const t = canvasTexture(w, h, draw, opts);
  const fonts = (typeof document !== 'undefined' ? (document as Document).fonts : undefined) as FontFaceSet | undefined;
  if (usesFont && fonts?.load) {
    Promise.all([fonts.load('64px "Bangers"'), fonts.load('64px "Luckiest Guy"')])
      .then((res) => {
        if (!res.some((r) => r.length)) return;
        const c = t.image as HTMLCanvasElement;
        const g = c.getContext('2d')!;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, w, h);
        draw(g, w, h);
        t.needsUpdate = true;
      })
      .catch(() => {});
  }
  return t;
}

// ------------------------------------------------------------------ drawing helpers

export function fitFont(g: G, lines: string[], size: number, maxW: number, font = FONT) {
  let s = size;
  for (;;) {
    g.font = `${s}px ${font}`;
    const mw = Math.max(...lines.map((l) => g.measureText(l).width));
    if (mw <= maxW || s < 8) return s;
    s -= 2;
  }
}

export interface TextOpts {
  fill: string;
  stroke?: string;
  lw?: number;
  shadow?: string;
  off?: number;
  maxW?: number;
  font?: string;
  skew?: number;
  rot?: number;
  lh?: number;
}

/** Multi-line comic lettering: ink outline + offset drop shadow. Returns final size. */
export function inkText(g: G, text: string | string[], x: number, y: number, size: number, o: TextOpts) {
  const lines = Array.isArray(text) ? text : text.split('\n');
  const font = o.font ?? FONT;
  const s = o.maxW ? fitFont(g, lines, size, o.maxW, font) : size;
  g.font = `${s}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const lh = (o.lh ?? 1.0) * s;
  g.save();
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  if (o.skew) g.transform(1, 0, o.skew, 1, 0, 0);
  lines.forEach((l, i) => {
    const ly = (i - (lines.length - 1) / 2) * lh;
    const lw = o.lw ?? s * 0.16;
    if (o.shadow) {
      const d = o.off ?? s * 0.08;
      g.fillStyle = o.shadow;
      g.strokeStyle = o.shadow;
      g.lineWidth = lw;
      g.strokeText(l, d, ly + d);
      g.fillText(l, d, ly + d);
    }
    if (o.stroke) {
      g.strokeStyle = o.stroke;
      g.lineWidth = lw;
      g.strokeText(l, 0, ly);
    }
    g.fillStyle = o.fill;
    g.fillText(l, 0, ly);
  });
  g.restore();
  return s;
}

export function burstPath(g: G, cx: number, cy: number, r0: number, r1: number, n: number, seed = 1, sy = 1) {
  const r = mulberry(seed);
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r0 * (0.9 + r() * 0.2) : r1 * (0.82 + r() * 0.3);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * sy;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
}

export function burst(g: G, cx: number, cy: number, r0: number, r1: number, n: number, fill: string, stroke?: string, lw = 4, seed = 1, sy = 1) {
  burstPath(g, cx, cy, r0, r1, n, seed, sy);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.lineJoin = 'miter';
    g.stroke();
  }
}

export function starPath(g: G, cx: number, cy: number, R: number, r: number, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r : R;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
}

export function star(g: G, cx: number, cy: number, R: number, fill: string, stroke?: string, lw = 4) {
  starPath(g, cx, cy, R, R * 0.45);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.stroke();
  }
}

/** Sunburst rays filling a rect. */
export function rays(g: G, x: number, y: number, w: number, h: number, cx: number, cy: number, n: number, c1: string, c2: string) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = c1;
  g.fillRect(x, y, w, h);
  g.fillStyle = c2;
  const R = Math.hypot(w, h) * 2;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = a0 + Math.PI / n;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    g.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** Ben-Day dot field. */
export function dots(g: G, x: number, y: number, w: number, h: number, step: number, rad: number, color: string, fade = false) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = color;
  let row = 0;
  for (let yy = y; yy < y + h + step; yy += step * 0.866, row++) {
    const off = row % 2 ? step / 2 : 0;
    const rr = fade ? rad * Math.max(0.15, (yy - y) / h) : rad;
    for (let xx = x - off; xx < x + w + step; xx += step) {
      g.beginPath();
      g.arc(xx, yy, rr, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** Cartoon skyline silhouette standing on baseline y. */
export function skylineSil(g: G, x: number, y: number, w: number, hmax: number, color: string, seed: number, ink = true) {
  const r = mulberry(seed);
  g.fillStyle = color;
  g.strokeStyle = INK;
  g.lineWidth = 3;
  let xx = x;
  while (xx < x + w) {
    const bw = w * (0.06 + r() * 0.09);
    const bh = hmax * (0.35 + r() * 0.65);
    g.beginPath();
    g.moveTo(xx, y);
    g.lineTo(xx, y - bh);
    if (r() > 0.6) {
      g.lineTo(xx + bw * 0.25, y - bh);
      g.lineTo(xx + bw * 0.5, y - bh - hmax * 0.25);
      g.lineTo(xx + bw * 0.75, y - bh);
    }
    g.lineTo(xx + bw, y - bh);
    g.lineTo(xx + bw, y);
    g.closePath();
    g.fill();
    if (ink) g.stroke();
    xx += bw * (0.8 + r() * 0.3);
  }
}

function roughRect(g: G, x: number, y: number, w: number, h: number, lw = 3) {
  g.strokeStyle = INK;
  g.lineWidth = lw;
  g.strokeRect(x, y, w, h);
}

function hatch(g: G, x: number, y: number, n: number, len: number, gap: number, alpha = 0.35) {
  g.save();
  g.strokeStyle = INK;
  g.globalAlpha = alpha;
  g.lineWidth = 1.6;
  for (let j = 0; j < n; j++) {
    g.beginPath();
    g.moveTo(x + j * gap, y);
    g.lineTo(x + j * gap - len * 0.6, y + len);
    g.stroke();
  }
  g.restore();
}

// ------------------------------------------------------------------ building facades

export interface FacadeStyle {
  wall: string;
  wall2: string;
  mortar: string;
  frame: string;
  lintel: string;
  glass: string;
  kind: 'brick' | 'stone';
  lit: number;
}

export const FACADES: FacadeStyle[] = [
  { wall: '#b9442c', wall2: '#a53a25', mortar: '#6e2417', frame: '#f3e6c8', lintel: '#e8d5aa', glass: '#2c4c86', kind: 'brick', lit: 0.3 },
  { wall: '#8c4f36', wall2: '#7d452f', mortar: '#4f2a1b', frame: '#ecdcb4', lintel: '#caa878', glass: '#274676', kind: 'stone', lit: 0.25 },
  { wall: '#d4834a', wall2: '#c4743e', mortar: '#8a4c26', frame: '#fff0d2', lintel: '#f0dbaf', glass: '#2e5893', kind: 'brick', lit: 0.3 },
  { wall: '#d8cbac', wall2: '#cabc9c', mortar: '#9a8e74', frame: '#3f5f8f', lintel: '#bba986', glass: '#2a4a74', kind: 'stone', lit: 0.2 },
];

/** 512² facade = 8m × 8m (two 4m floors, four 2m bays). */
export function facadeTex(st: FacadeStyle, seed: number, windows = true) {
  return inkTex(512, 512, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = st.wall;
    g.fillRect(0, 0, w, h);
    if (st.kind === 'brick') {
      const bh = 12, bw = 30;
      for (let y = 0, row = 0; y < h; y += bh, row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let x = -off; x < w; x += bw) {
          const v = r();
          if (v < 0.28) {
            g.fillStyle = st.wall2;
            g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
          } else if (v > 0.94) {
            g.fillStyle = 'rgba(255,235,210,0.2)';
            g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
          }
          g.fillStyle = st.mortar;
          g.globalAlpha = 0.5;
          g.fillRect(x, y, 2, bh);
          g.globalAlpha = 1;
        }
        g.fillStyle = st.mortar;
        g.globalAlpha = 0.55;
        g.fillRect(0, y, w, 2);
        g.globalAlpha = 1;
      }
    } else {
      const bh = 32;
      for (let y = 0, row = 0; y < h; y += bh, row++) {
        g.fillStyle = st.mortar;
        g.globalAlpha = 0.45;
        g.fillRect(0, y, w, 2);
        const off = row % 2 ? 40 : 0;
        for (let x = off; x < w; x += 80) g.fillRect(x, y, 2, bh);
        g.globalAlpha = 1;
        if (r() > 0.5) {
          g.fillStyle = st.wall2;
          g.fillRect(r() * w, y + 2, 60, bh - 4);
        }
      }
    }
    // comic hatching clusters
    for (let k = 0; k < 16; k++) hatch(g, r() * w, r() * h, 4 + Math.floor(r() * 4), 10 + r() * 8, 5, 0.3);
    for (let f = 0; f < (windows ? 2 : 0); f++) {
      const fy = h - (f + 1) * 256;
      // string course
      g.fillStyle = st.lintel;
      g.fillRect(0, fy + 244, w, 10);
      g.fillStyle = INK;
      g.globalAlpha = 0.7;
      g.fillRect(0, fy + 244, w, 2);
      g.fillRect(0, fy + 253, w, 2);
      g.globalAlpha = 1;
      for (let b = 0; b < 4; b++) {
        const wx = b * 128 + 30, wy = fy + 56, ww = 68, wh = 142;
        // shadow under lintel/sill
        g.fillStyle = 'rgba(20,10,20,0.28)';
        g.fillRect(wx - 5, wy - 5, ww + 16, wh + 16);
        // lintel & sill
        g.fillStyle = st.lintel;
        g.fillRect(wx - 11, wy - 20, ww + 22, 15);
        roughRect(g, wx - 11, wy - 20, ww + 22, 15, 2.5);
        g.fillRect(wx - 9, wy + wh + 4, ww + 18, 10);
        roughRect(g, wx - 9, wy + wh + 4, ww + 18, 10, 2.5);
        // frame
        g.fillStyle = st.frame;
        g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
        // glass
        const lit = r() < st.lit;
        const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
        if (lit) {
          gr.addColorStop(0, '#ffe98a');
          gr.addColorStop(1, '#ffab3d');
        } else {
          gr.addColorStop(0, '#5f86c4');
          gr.addColorStop(0.45, st.glass);
          gr.addColorStop(1, '#162845');
        }
        g.fillStyle = gr;
        g.fillRect(wx, wy, ww, wh);
        // blinds / curtains
        const blind = r();
        if (blind < 0.35) {
          const bh2 = wh * (0.2 + r() * 0.45);
          g.fillStyle = lit ? '#f7d9a0' : '#e9dcb8';
          g.fillRect(wx, wy, ww, bh2);
          g.strokeStyle = INK;
          g.globalAlpha = 0.4;
          g.lineWidth = 1.2;
          for (let yy = wy + 6; yy < wy + bh2; yy += 6) {
            g.beginPath();
            g.moveTo(wx, yy);
            g.lineTo(wx + ww, yy);
            g.stroke();
          }
          g.globalAlpha = 1;
        } else if (blind < 0.5) {
          g.fillStyle = r() > 0.5 ? '#c8423a' : '#3f8a5a';
          g.fillRect(wx, wy, ww * 0.22, wh);
          g.fillRect(wx + ww * 0.78, wy, ww * 0.22, wh);
        }
        if (!lit) {
          g.strokeStyle = 'rgba(255,255,255,0.55)';
          g.lineWidth = 5;
          g.beginPath();
          g.moveTo(wx + ww * 0.15, wy + wh * 0.55);
          g.lineTo(wx + ww * 0.55, wy + wh * 0.2);
          g.stroke();
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(wx + ww * 0.3, wy + wh * 0.7);
          g.lineTo(wx + ww * 0.7, wy + wh * 0.35);
          g.stroke();
        }
        // mullions
        g.fillStyle = st.frame;
        g.fillRect(wx + ww / 2 - 2.5, wy, 5, wh);
        g.fillRect(wx, wy + wh * 0.5 - 2.5, ww, 5);
        roughRect(g, wx - 5, wy - 5, ww + 10, wh + 10, 3);
        roughRect(g, wx, wy, ww, wh, 1.5);
      }
    }
  }, { repeat: true });
}

/** Two storefront variants stacked (each 512×256 = 8m × 4m). */
export function storefrontTex() {
  return inkTex(512, 512, (g) => {
    const r = mulberry(21);
    const variant = (y0: number, frame: string, frame2: string, awnCol: string) => {
      g.fillStyle = frame;
      g.fillRect(0, y0, 512, 256);
      // sign band shadow
      g.fillStyle = frame2;
      g.fillRect(0, y0, 512, 34);
      g.fillStyle = INK;
      g.fillRect(0, y0 + 32, 512, 3);
      for (const [x0, x1] of [[18, 222], [290, 494]]) {
        // windows
        const wy = y0 + 52, wh = 138;
        g.fillStyle = '#e6f1ff';
        g.fillRect(x0, wy, x1 - x0, wh);
        const gr = g.createLinearGradient(x0, wy, x1, wy + wh);
        gr.addColorStop(0, '#9cc3ef');
        gr.addColorStop(0.5, '#4f79b8');
        gr.addColorStop(1, '#27416e');
        g.fillStyle = gr;
        g.fillRect(x0, wy, x1 - x0, wh);
        // display goods
        for (let k = 0; k < 7; k++) {
          const gx = x0 + 10 + k * ((x1 - x0 - 20) / 7), gh = 20 + r() * 40, gw = 16 + r() * 10;
          g.fillStyle = ['#ffcf3a', '#e8412f', '#3fa35b', '#f7f1e3', '#ff8a2b', '#8a5ad6'][Math.floor(r() * 6)];
          g.fillRect(gx, wy + wh - 14 - gh, gw, gh);
          roughRect(g, gx, wy + wh - 14 - gh, gw, gh, 2);
        }
        g.fillStyle = frame2;
        g.fillRect(x0, wy + wh - 14, x1 - x0, 14);
        // reflections
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(x0 + 20, wy + wh - 30);
        g.lineTo(x0 + 70, wy + 10);
        g.stroke();
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x0 + 50, wy + wh - 20);
        g.lineTo(x0 + 100, wy + 20);
        g.stroke();
        // lettering on glass
        inkText(g, r() > 0.5 ? 'OPEN' : 'SALE!', (x0 + x1) / 2 + 30, wy + 28, 26, { fill: '#ffd21f', stroke: INK, lw: 4 });
        roughRect(g, x0, wy, x1 - x0, wh, 4);
        // bulkhead panel
        g.fillStyle = frame2;
        g.fillRect(x0, wy + wh + 10, x1 - x0, 50);
        roughRect(g, x0 + 8, wy + wh + 18, x1 - x0 - 16, 34, 2.5);
        roughRect(g, x0, wy + wh + 10, x1 - x0, 50, 3);
      }
      // door
      g.fillStyle = frame2;
      g.fillRect(232, y0 + 46, 48, 210);
      g.fillStyle = '#2b4574';
      g.fillRect(238, y0 + 54, 36, 120);
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(242, y0 + 150);
      g.lineTo(266, y0 + 70);
      g.stroke();
      roughRect(g, 238, y0 + 54, 36, 120, 2.5);
      g.fillStyle = '#f3c93b';
      g.beginPath();
      g.arc(270, y0 + 190, 5, 0, Math.PI * 2);
      g.fill();
      roughRect(g, 232, y0 + 46, 48, 210, 3.5);
      // pilasters
      g.fillStyle = frame2;
      g.fillRect(0, y0 + 34, 12, 222);
      g.fillRect(500, y0 + 34, 12, 222);
      roughRect(g, 0, y0 + 34, 12, 222, 2);
      roughRect(g, 500, y0 + 34, 12, 222, 2);
      void awnCol;
    };
    variant(0, '#2f6e52', '#1f4f3a', '#e33');
    variant(256, '#8e2c2c', '#5f1b1d', '#33e');
  }, { repeat: true }, true);
}

export const SIGN_NAMES = ['DINER', 'COMICS', 'BAKERY', 'DELI', 'HARDWARE', 'BOOKS', 'SODA SHOP', 'TAXI', 'ZIP-ZAP DELIVERY', 'NEWS', 'LOADING', 'TO OUR HEROES', 'HERO PATROL', 'MAIL', 'PHONE', 'GOON SQUAD'];
const SIGN_COLS = ['#ffd21f', '#e8322b', '#2a62d8', '#ffffff', '#35a060', '#ff8a1f', '#f7e7c4', '#ffd21f', '#ffffff', '#1f3f8f', '#ffd21f', '#c9a15a', '#1f4fd0', '#2553b8', '#ffffff', '#1a1420'];
/** 16 signs in one atlas: each 512×32 row pair... (256px wide × 64px tall, 2 columns × 8 rows). */
export function signAtlas() {
  return inkTex(512, 512, (g) => {
    SIGN_NAMES.forEach((name, i) => {
      const cx = (i % 2) * 256, cy = Math.floor(i / 2) * 64;
      const bg = SIGN_COLS[i];
      g.fillStyle = bg;
      g.fillRect(cx, cy, 256, 64);
      g.strokeStyle = INK;
      g.lineWidth = 5;
      g.strokeRect(cx + 3, cy + 3, 250, 58);
      const light = bg === '#ffffff' || bg === '#ffd21f' || bg === '#f7e7c4' || bg === '#8fd0ff' || bg === '#c9a15a';
      inkText(g, name, cx + 128, cy + 34, 46, { fill: light ? '#e8322b' : '#ffffff', stroke: INK, lw: 6, shadow: light ? undefined : INK, off: 3, maxW: 230 });
    });
  }, {}, true);
}
/** UV rect for sign i in the atlas. */
export function signUV(i: number): [number, number, number, number] {
  const u0 = (i % 2) * 0.5, v1 = 1 - Math.floor(i / 2) / 8;
  return [u0, v1 - 1 / 8, u0 + 0.5, v1];
}

// ------------------------------------------------------------------ posters & billboards

type PosterFn = (g: G, x: number, y: number, s: number) => void;

const heroPosters: PosterFn[] = [
  (g, x, y, s) => {
    rays(g, x, y, s, s, x + s / 2, y + s * 0.95, 22, '#ffd21f', '#ffe45c');
    skylineSil(g, x, y + s, s, s * 0.3, '#2a62d8', 11);
    burst(g, x + s * 0.8, y + s * 0.78, s * 0.08, s * 0.16, 10, '#ff5a2a', INK, 3, 4);
    inkText(g, ['A BRIGHTER', 'TOMORROW', 'TOGETHER'], x + s / 2, y + s * 0.38, s * 0.2, { fill: '#1d4fd0', stroke: INK, lw: 5, shadow: '#fff6d8', off: 4, maxW: s * 0.9, lh: 0.95 });
  },
  (g, x, y, s) => {
    g.fillStyle = '#f5ecd2';
    g.fillRect(x, y, s, s);
    dots(g, x, y, s, s * 0.6, 9, 2.4, 'rgba(42,98,216,0.35)');
    skylineSil(g, x, y + s, s, s * 0.42, '#1b3c8c', 23);
    inkText(g, ['JUSTICE', 'BUILDS', 'STRONGER', 'CITIES'], x + s / 2, y + s * 0.34, s * 0.17, { fill: '#e8322b', stroke: INK, lw: 5, maxW: s * 0.8, lh: 0.92 });
  },
  (g, x, y, s) => {
    g.fillStyle = '#e8322b';
    g.fillRect(x, y, s, s);
    dots(g, x, y, s, s, 12, 3.4, 'rgba(255,255,255,0.28)', true);
    star(g, x + s / 2, y + s * 0.64, s * 0.26, '#ffffff', INK, 5);
    star(g, x + s / 2, y + s * 0.64, s * 0.14, '#2a62d8');
    inkText(g, ['EVERY CITIZEN', 'A HERO!'], x + s / 2, y + s * 0.2, s * 0.16, { fill: '#ffd21f', stroke: INK, lw: 5, shadow: INK, off: 4, maxW: s * 0.9 });
  },
  (g, x, y, s) => {
    rays(g, x, y, s, s, x + s * 0.5, y + s * 0.5, 16, '#2a62d8', '#3a78ee');
    for (let k = 0; k < 6; k++) burst(g, x + s * (0.15 + 0.14 * k), y + s * (0.2 + (k % 2) * 0.62), 3, 12, 4, '#fff6b0', undefined, 0, k + 3);
    inkText(g, ['KEEP', 'INK CITY', 'SHINING!'], x + s / 2, y + s / 2, s * 0.2, { fill: '#ffd21f', stroke: INK, lw: 5, shadow: INK, off: 4, maxW: s * 0.86, lh: 0.95 });
  },
];

const villainPosters: PosterFn[] = [
  (g, x, y, s) => {
    g.fillStyle = '#ecd9ac';
    g.fillRect(x, y, s, s);
    inkText(g, 'WANTED', x + s / 2, y + s * 0.14, s * 0.2, { fill: INK, maxW: s * 0.85 });
    g.fillStyle = '#2d2433';
    g.beginPath();
    g.arc(x + s / 2, y + s * 0.48, s * 0.15, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x + s * 0.28, y + s * 0.58, s * 0.44, s * 0.2);
    g.fillStyle = '#e8322b';
    g.fillRect(x + s * 0.33, y + s * 0.43, s * 0.34, s * 0.06);
    inkText(g, ['BARON BLAM', 'REWARD $1,000,000'], x + s / 2, y + s * 0.87, s * 0.09, { fill: '#8e1b1b', maxW: s * 0.9, lh: 1.15 });
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.strokeRect(x + 8, y + 8, s - 16, s - 16);
  },
  (g, x, y, s) => {
    rays(g, x, y, s, s, x + s / 2, y + s * 0.6, 18, '#5d2a8a', '#7a3db0');
    burst(g, x + s / 2, y + s * 0.62, s * 0.18, s * 0.34, 12, '#9cff4a', INK, 4, 9);
    inkText(g, ['VILLAINS', 'UNITE!'], x + s / 2, y + s * 0.3, s * 0.22, { fill: '#9cff4a', stroke: INK, lw: 6, shadow: INK, off: 5, maxW: s * 0.88 });
  },
  (g, x, y, s) => {
    g.fillStyle = '#16121c';
    g.fillRect(x, y, s, s);
    dots(g, x, y, s, s, 10, 3, 'rgba(232,50,43,0.5)', true);
    g.fillStyle = '#e8322b';
    g.beginPath();
    g.moveTo(x + s * 0.55, y + s * 0.4);
    g.lineTo(x + s * 0.36, y + s * 0.7);
    g.lineTo(x + s * 0.5, y + s * 0.7);
    g.lineTo(x + s * 0.42, y + s * 0.95);
    g.lineTo(x + s * 0.68, y + s * 0.6);
    g.lineTo(x + s * 0.54, y + s * 0.6);
    g.lineTo(x + s * 0.64, y + s * 0.4);
    g.closePath();
    g.fill();
    inkText(g, ['OBEY', 'THE BARON'], x + s / 2, y + s * 0.2, s * 0.17, { fill: '#e8322b', stroke: '#fff', lw: 4, maxW: s * 0.86 });
  },
  (g, x, y, s) => {
    rays(g, x, y, s, s, x + s / 2, y + s / 2, 20, '#ff8a1f', '#ffb02e');
    inkText(g, ['MWAHAHA!', 'TOMORROW', 'IS OURS'], x + s / 2, y + s / 2, s * 0.2, { fill: '#e8322b', stroke: INK, lw: 6, shadow: '#ffe', off: 4, maxW: s * 0.88, lh: 0.95 });
  },
];

/** 2×2 poster atlas (hero = 0, villain = 1). */
export function posterAtlas(set: 0 | 1) {
  const fns = set === 0 ? heroPosters : villainPosters;
  return inkTex(512, 512, (g) => {
    fns.forEach((fn, i) => {
      const x = (i % 2) * 256, y = Math.floor(i / 2) * 256;
      fn(g, x, y, 256);
      g.strokeStyle = INK;
      g.lineWidth = 6;
      g.strokeRect(x + 3, y + 3, 250, 250);
    });
  }, {}, true);
}
export function posterUV(i: number): [number, number, number, number] {
  const u0 = (i % 2) * 0.5, v1 = 1 - Math.floor(i / 2) * 0.5;
  return [u0, v1 - 0.5, u0 + 0.5, v1];
}

/** Four wide billboards stacked (each 512×128). */
export function billboardAtlas() {
  return inkTex(512, 512, (g) => {
    const W = 512, H = 128;
    // 0: brighter tomorrow
    rays(g, 0, 0, W, H, W * 0.18, H * 0.9, 26, '#ffd21f', '#ffe56a');
    skylineSil(g, 0, H, W * 0.36, H * 0.55, '#2a62d8', 5);
    burst(g, W * 0.18, H * 0.38, 16, 34, 11, '#ff5a2a', INK, 3, 2);
    inkText(g, ['A BRIGHTER TOMORROW', 'TOGETHER'], W * 0.66, H * 0.5, 52, { fill: '#1d4fd0', stroke: INK, lw: 5, shadow: '#fff6d8', off: 3, maxW: W * 0.6, lh: 0.95 });
    // 1: justice
    g.fillStyle = '#2a62d8';
    g.fillRect(0, H, W, H);
    dots(g, 0, H, W, H, 10, 2.6, 'rgba(255,255,255,0.22)');
    star(g, 64, H + 64, 46, '#ffffff', INK, 4);
    star(g, 64, H + 64, 24, '#e8322b');
    inkText(g, ['JUSTICE BUILDS', 'STRONGER CITIES'], W * 0.6, H * 1.5, 52, { fill: '#ffd21f', stroke: INK, lw: 5, shadow: INK, off: 3, maxW: W * 0.7, lh: 0.95 });
    // 2: kapow cola
    g.fillStyle = '#e8322b';
    g.fillRect(0, H * 2, W, H);
    rays(g, 0, H * 2, W * 0.3, H, W * 0.15, H * 2.5, 14, '#ffd21f', '#ffe56a');
    g.fillStyle = '#b11f1f';
    g.fillRect(W * 0.1, H * 2 + 22, 30, 84);
    g.fillStyle = '#ffffff';
    g.fillRect(W * 0.1, H * 2 + 52, 30, 18);
    roughRect(g, W * 0.1, H * 2 + 22, 30, 84, 3);
    inkText(g, ['KAPOW COLA!', 'IT PACKS A PUNCH'], W * 0.64, H * 2.5, 54, { fill: '#ffffff', stroke: INK, lw: 5, shadow: INK, off: 3, maxW: W * 0.62, lh: 0.95 });
    // 3: visit ink city
    g.fillStyle = '#f5ecd2';
    g.fillRect(0, H * 3, W, H);
    dots(g, 0, H * 3, W, H, 9, 2.2, 'rgba(232,50,43,0.25)');
    skylineSil(g, W * 0.6, H * 4, W * 0.4, H * 0.8, '#e8322b', 77);
    inkText(g, ['VISIT INK CITY', 'HOME OF HEROES'], W * 0.32, H * 3.5, 50, { fill: '#1d4fd0', stroke: INK, lw: 5, shadow: '#ffd21f', off: 3, maxW: W * 0.58, lh: 0.95 });
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = INK;
      g.lineWidth = 6;
      g.strokeRect(3, k * H + 3, W - 6, H - 6);
    }
  }, {}, true);
}
export function billboardUV(i: number): [number, number, number, number] {
  const v1 = 1 - i / 4;
  return [0, v1 - 0.25, 1, v1];
}

/** Two giant rooftop sound-effect bursts (POW! / ZAP!) side by side, transparent background. */
export function sfxAtlas() {
  return inkTex(512, 256, (g) => {
    burst(g, 128, 128, 70, 124, 14, '#ffd21f', INK, 7, 11);
    burst(g, 128, 128, 48, 92, 14, '#ff8a1f', undefined, 0, 12);
    inkText(g, 'POW!', 128, 134, 84, { fill: '#e8322b', stroke: INK, lw: 9, shadow: INK, off: 6, rot: -0.12, maxW: 190 });
    burst(g, 384, 128, 70, 124, 12, '#7fd4ff', INK, 7, 21);
    burst(g, 384, 128, 48, 92, 12, '#ffffff', undefined, 0, 22);
    inkText(g, 'ZAP!', 384, 134, 84, { fill: '#1d4fd0', stroke: INK, lw: 9, shadow: '#ffd21f', off: 6, rot: 0.1, maxW: 190 });
  }, {}, true);
}

/** HQ marquee signs: row 0 hero, row 1 villain (each 512×128) + two emblem cells below. */
export function hqAtlas() {
  return inkTex(512, 512, (g) => {
    rays(g, 0, 0, 512, 128, 256, 64, 24, '#1d4fd0', '#2a62d8');
    star(g, 60, 64, 44, '#ffd21f', INK, 4);
    star(g, 452, 64, 44, '#ffd21f', INK, 4);
    inkText(g, 'HERO HQ', 256, 68, 92, { fill: '#ffffff', stroke: INK, lw: 7, shadow: INK, off: 5, maxW: 300 });
    rays(g, 0, 128, 512, 128, 256, 192, 24, '#b3121c', '#e8322b');
    inkText(g, 'VILLAINS INC.', 256, 196, 86, { fill: '#ffd21f', stroke: INK, lw: 7, shadow: INK, off: 5, maxW: 440 });
    for (let k = 0; k < 2; k++) {
      g.strokeStyle = INK;
      g.lineWidth = 8;
      g.strokeRect(4, k * 128 + 4, 504, 120);
    }
    // row 2: team banners (blue star / red bolt), 128×256 each
    const banner = (x: number, col: string, emblem: 'star' | 'bolt') => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(x, 256);
      g.lineTo(x + 128, 256);
      g.lineTo(x + 128, 512);
      g.lineTo(x + 64, 470);
      g.lineTo(x, 512);
      g.closePath();
      g.fill();
      dots(g, x, 256, 128, 256, 10, 2.5, 'rgba(0,0,0,0.18)', true);
      g.fillStyle = '#ffffff';
      g.fillRect(x + 10, 266, 108, 8);
      if (emblem === 'star') {
        star(g, x + 64, 360, 44, '#ffffff', INK, 4);
        star(g, x + 64, 360, 20, '#ffd21f');
      } else {
        g.fillStyle = '#ffd21f';
        g.beginPath();
        g.moveTo(x + 76, 306); g.lineTo(x + 38, 370); g.lineTo(x + 62, 370); g.lineTo(x + 48, 420);
        g.lineTo(x + 92, 350); g.lineTo(x + 68, 350); g.lineTo(x + 84, 306);
        g.closePath();
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = 4;
        g.stroke();
      }
      g.strokeStyle = INK;
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(x + 2, 258); g.lineTo(x + 126, 258); g.lineTo(x + 126, 508); g.lineTo(x + 64, 468); g.lineTo(x + 2, 508);
      g.closePath();
      g.stroke();
    };
    banner(0, '#1d4fd0', 'star');
    banner(128, '#e8322b', 'bolt');
    // plaque "TO OUR HEROES" + "HERO LINE" boards
    g.fillStyle = '#c9a15a';
    g.fillRect(256, 256, 256, 96);
    inkText(g, ['TO OUR', 'HEROES'], 384, 304, 40, { fill: '#5a3a12', maxW: 220, lh: 1 });
    g.strokeStyle = '#5a3a12';
    g.lineWidth = 6;
    g.strokeRect(262, 262, 244, 84);
    // newspaper front page
    g.fillStyle = '#f2ede0';
    g.fillRect(256, 352, 256, 160);
    inkText(g, 'INK CITY GAZETTE', 384, 372, 26, { fill: INK, maxW: 236 });
    g.fillStyle = INK;
    g.fillRect(264, 388, 240, 3);
    inkText(g, 'HEROES SAVE THE DAY!', 384, 412, 30, { fill: '#e8322b', maxW: 236 });
    g.fillStyle = '#9aa0a8';
    g.fillRect(266, 432, 110, 70);
    for (let k = 0; k < 8; k++) g.fillRect(386, 436 + k * 8, 116, 3);
  }, {}, true);
}

// ------------------------------------------------------------------ ground

export function asphaltTex() {
  return inkTex(512, 512, (g, w, h) => {
    const r = mulberry(5);
    g.fillStyle = '#737987';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = r() > 0.5 ? `rgba(20,20,40,${0.04 + r() * 0.06})` : `rgba(255,255,255,${0.03 + r() * 0.05})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 20 + r() * 60, 10 + r() * 30, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = r() > 0.55 ? 'rgba(25,20,35,0.5)' : 'rgba(220,220,230,0.35)';
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // repaired patches
    for (let i = 0; i < 4; i++) {
      const x = r() * w, y = r() * h, pw = 40 + r() * 70, ph = 30 + r() * 60;
      g.fillStyle = r() > 0.5 ? 'rgba(40,40,60,0.18)' : 'rgba(255,255,255,0.08)';
      g.fillRect(x, y, pw, ph);
      g.strokeStyle = INK;
      g.globalAlpha = 0.45;
      g.lineWidth = 2;
      g.strokeRect(x, y, pw, ph);
      g.globalAlpha = 1;
    }
    // streaky ink hatching (like the concept's printed road)
    g.strokeStyle = INK;
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, len = 20 + r() * 80;
      g.globalAlpha = 0.16 + r() * 0.22;
      g.lineWidth = 1 + r() * 1.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 8, y + len);
      g.stroke();
    }
    // cross-hatched clusters
    for (let i = 0; i < 10; i++) {
      const x = r() * w, y = r() * h;
      g.globalAlpha = 0.3;
      g.lineWidth = 1.4;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.moveTo(x + k * 5, y);
        g.lineTo(x + k * 5 - 12, y + 18);
        g.stroke();
      }
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(x + k * 6, y + 18);
        g.lineTo(x + k * 6 + 12, y);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    // cracks
    for (let i = 0; i < 5; i++) {
      let x = r() * w, y = r() * h;
      g.strokeStyle = INK;
      g.globalAlpha = 0.6;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (r() - 0.5) * 40;
        y += (r() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
      g.globalAlpha = 1;
    }
  }, { repeat: true });
}

export function sidewalkTex(base = '#cfc8b8') {
  return inkTex(256, 256, (g, w, h) => {
    const r = mulberry(8);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.06})`;
      g.fillRect((i % 3) * (w / 3), Math.floor(i / 3) * (h / 3), w / 3, h / 3);
    }
    for (let i = 0; i < 700; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(40,30,40,0.25)' : 'rgba(255,255,255,0.35)';
      g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    g.strokeStyle = INK;
    g.globalAlpha = 0.55;
    g.lineWidth = 2.5;
    for (let i = 0; i <= 3; i++) {
      g.beginPath(); g.moveTo(0, (i * h) / 3); g.lineTo(w, (i * h) / 3); g.stroke();
      g.beginPath(); g.moveTo((i * w) / 3, 0); g.lineTo((i * w) / 3, h); g.stroke();
    }
    g.globalAlpha = 0.4;
    g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      let x = r() * w, y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (r() - 0.5) * 30;
        y += (r() - 0.5) * 30;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }, { repeat: true });
}

export function paverTex() {
  return inkTex(256, 256, (g, w, h) => {
    const r = mulberry(12);
    g.fillStyle = '#d9a46a';
    g.fillRect(0, 0, w, h);
    const s = 32;
    for (let y = 0; y < h; y += s / 2)
      for (let x = 0; x < w; x += s) {
        const off = (y / (s / 2)) % 2 ? s / 2 : 0;
        g.fillStyle = ['#d9a46a', '#cf955c', '#e3b27a', '#c88b55'][Math.floor(r() * 4)];
        g.fillRect(x + off, y, s, s / 2);
        g.strokeStyle = INK;
        g.globalAlpha = 0.45;
        g.lineWidth = 1.5;
        g.strokeRect(x + off, y, s, s / 2);
        g.globalAlpha = 1;
      }
  }, { repeat: true });
}

/** Tar-paper roof with seams, patches and gravel. 256² = 8m. */
export function roofTex() {
  return inkTex(256, 256, (g, w, h) => {
    const r = mulberry(17);
    g.fillStyle = '#8f8793';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(40,30,50,0.16)' : 'rgba(255,255,255,0.1)';
      g.fillRect(r() * w, r() * h, 20 + r() * 50, 14 + r() * 30);
    }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(30,20,40,0.35)' : 'rgba(255,255,255,0.3)';
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    g.strokeStyle = INK;
    g.globalAlpha = 0.5;
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 42) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    for (let k = 0; k < 6; k++) hatch(g, r() * w, r() * h, 5, 12, 5, 0.3);
  }, { repeat: true });
}

export function checkerTex() {
  return inkTex(64, 16, (g, w, h) => {
    for (let x = 0; x < w / 8; x++)
      for (let y = 0; y < 2; y++) {
        g.fillStyle = (x + y) % 2 ? '#ffffff' : '#15121a';
        g.fillRect(x * 8, y * 8, 8, 8);
      }
  }, { repeat: true });
}

export function hazardTex() {
  return inkTex(128, 32, (g, w, h) => {
    g.fillStyle = '#ffd21f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#15121a';
    for (let x = -h; x < w + h; x += 32) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 16, h);
      g.lineTo(x + 16 + h, 0);
      g.lineTo(x + h, 0);
      g.closePath();
      g.fill();
    }
  }, { repeat: true });
}

export function planksTex() {
  return inkTex(256, 256, (g, w, h) => {
    const r = mulberry(31);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = ['#c79a5e', '#b98b52', '#d3a86b'][Math.floor(r() * 3)];
      g.fillRect(x, 0, 32, h);
      g.strokeStyle = INK;
      g.lineWidth = 2.5;
      g.strokeRect(x, 0, 32, h);
      for (let k = 0; k < 3; k++) {
        g.globalAlpha = 0.3;
        g.beginPath();
        const yy = r() * h;
        g.moveTo(x + 6, yy);
        g.quadraticCurveTo(x + 16, yy + 10, x + 26, yy);
        g.stroke();
        g.globalAlpha = 1;
      }
      g.fillStyle = '#3a2a1a';
      g.fillRect(x + 14, 20, 4, 4);
      g.fillRect(x + 14, h - 24, 4, 4);
    }
  }, { repeat: true });
}

export function shutterTex() {
  return inkTex(128, 128, (g, w, h) => {
    g.fillStyle = '#9aa6b4';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, y, w, 3);
      g.fillStyle = INK;
      g.globalAlpha = 0.55;
      g.fillRect(0, y + 8, w, 2);
      g.globalAlpha = 1;
    }
  }, { repeat: true });
}

/** Skyscraper window grid (tileable). */
export function towerTex(wall: string, win: string, seed: number) {
  return inkTex(256, 256, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    const cols = 8, rows = 8;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const wx = x * (w / cols) + 7, wy = y * (h / rows) + 6;
        g.fillStyle = r() < 0.12 ? '#ffe27a' : win;
        g.fillRect(wx, wy, w / cols - 14, h / rows - 12);
      }
    // vertical piers
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let x = 0; x < cols; x++) g.fillRect(x * (w / cols), 0, 4, h);
    g.strokeStyle = INK;
    g.globalAlpha = 0.35;
    g.lineWidth = 2;
    for (let x = 0; x < cols; x++) {
      g.beginPath();
      g.moveTo(x * (w / cols) + 1, 0);
      g.lineTo(x * (w / cols) + 1, h);
      g.stroke();
    }
    g.globalAlpha = 1;
  }, { repeat: true });
}

/** Wood-stave water tower tank. */
export function staveTex() {
  return inkTex(128, 128, (g, w, h) => {
    const r = mulberry(4);
    for (let x = 0; x < w; x += 12) {
      g.fillStyle = ['#8d5b34', '#9a6a3e', '#835230'][Math.floor(r() * 3)];
      g.fillRect(x, 0, 12, h);
      g.fillStyle = INK;
      g.globalAlpha = 0.5;
      g.fillRect(x, 0, 1.5, h);
      g.globalAlpha = 1;
    }
  }, { repeat: true });
}

export function uvRectGeo(geo: THREE.BufferGeometry, rect: [number, number, number, number]) {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
  uv.needsUpdate = true;
  return geo;
}

/** Plane with UVs mapped to an atlas sub-rectangle. */
export function atlasPlane(w: number, h: number, rect: [number, number, number, number]) {
  return uvRectGeo(new THREE.PlaneGeometry(w, h), rect);
}
