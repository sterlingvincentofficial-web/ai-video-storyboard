import * as THREE from 'three';
import { canvasTexture } from '../../render/Materials';
import { mulberry } from '../../core/utils';

export const FONT_TOON = '"Luckiest Guy", "Bangers", Impact, "Arial Black", sans-serif';
export const FONT_TECH = '900 {s}px Orbitron, "Luckiest Guy", "Arial Black", sans-serif';

type G = CanvasRenderingContext2D;

/** Redraw a canvas texture once web fonts are ready (menus may build the world before fonts load). */
export function redrawWhenFontsReady(tex: THREE.CanvasTexture, draw: (g: G, w: number, h: number) => void) {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  const loads = ['40px "Luckiest Guy"', '900 40px Orbitron', '40px Bangers'].map((f) => fonts.load(f).catch(() => []));
  Promise.all(loads).then((res) => {
    if (!res.some((r) => (r as FontFace[]).length)) return;
    const c = tex.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    draw(g, c.width, c.height);
    tex.needsUpdate = true;
  });
}

/* ------------------------------------------------------------------ floors */

/**
 * Rooftop floor: dark tiles with glowing grid lines. Returns a colour map and an
 * emissive map (white lines, tinted by the material's emissive colour). One repeat = one tile.
 */
export function floorTextures(base: string, seam: string, seed: number, sub = 2) {
  const size = 256;
  const map = canvasTexture(size, size, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.03})`;
      g.fillRect(r() * w, r() * h, 20 + r() * 60, 10 + r() * 40);
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
      g.fillRect(r() * w, r() * h, 20 + r() * 60, 10 + r() * 40);
    }
    // faint sub-grid
    g.strokeStyle = seam;
    g.lineWidth = 2;
    for (let i = 1; i < sub; i++) {
      const p = (i / sub) * w;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
    }
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.5;
    g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
    g.globalAlpha = 1;
  }, { repeat: true });
  const emis = canvasTexture(size, size, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    // soft halo then bright core, on every tile edge (neighbouring tiles complete the line)
    const grad = (x0: number, y0: number, x1: number, y1: number) => {
      const lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(255,255,255,0.4)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      return lg;
    };
    const hw = 7;
    g.fillStyle = grad(0, 0, 0, hw); g.fillRect(0, 0, w, hw);
    g.fillStyle = grad(0, h, 0, h - hw); g.fillRect(0, h - hw, w, hw);
    g.fillStyle = grad(0, 0, hw, 0); g.fillRect(0, 0, hw, h);
    g.fillStyle = grad(w, 0, w - hw, 0); g.fillRect(w - hw, 0, hw, h);
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(w - 3, 0, 3, h);
    // sub-grid glints
    g.fillStyle = 'rgba(255,255,255,0.1)';
    for (let i = 1; i < sub; i++) {
      const p = (i / sub) * w;
      g.fillRect(p - 1, 0, 2, h);
      g.fillRect(0, p - 1, w, 2);
    }
  }, { repeat: true });
  return { map, emis };
}

/* ------------------------------------------------------------------ facades */

const WIN_COLORS = ['#ffc96b', '#62f0ff', '#ff6fd2', '#b79cff', '#ffe9c4', '#ff8a5c'];

/**
 * Building facade tile (8m x 8m): 4 floors x 4 windows. Top of the tile is the roof line
 * (a parapet band). Returns colour map + emissive map (lit windows).
 */
export function facadeTextures(wall: string, band: string, seed: number, litChance = 0.4) {
  const r = mulberry(seed);
  const cols = 4, rows = 4;
  const lit: (string | null)[] = [];
  for (let i = 0; i < cols * rows; i++) lit.push(r() < litChance ? WIN_COLORS[Math.floor(r() * WIN_COLORS.length)] : null);
  const blinds: number[] = lit.map(() => r());
  const drawWindows = (g: G, w: number, h: number, emissive: boolean) => {
    const cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const wx = x * cw + cw * 0.2, wy = y * ch + ch * 0.28, ww = cw * 0.6, wh = ch * 0.52;
        const c = lit[i];
        if (emissive) {
          if (!c) continue;
          g.fillStyle = c;
          g.fillRect(wx, wy, ww, wh);
          if (blinds[i] > 0.6) {
            g.fillStyle = 'rgba(0,0,0,0.55)';
            g.fillRect(wx, wy, ww, wh * (blinds[i] - 0.5));
          }
          continue;
        }
        g.fillStyle = '#0c0824';
        g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        if (c) {
          g.fillStyle = c;
          g.fillRect(wx, wy, ww, wh);
          if (blinds[i] > 0.6) {
            g.fillStyle = 'rgba(0,0,0,0.5)';
            g.fillRect(wx, wy, ww, wh * (blinds[i] - 0.5));
          }
        } else {
          const lg = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
          lg.addColorStop(0, '#231a56');
          lg.addColorStop(1, '#100a2c');
          g.fillStyle = lg;
          g.fillRect(wx, wy, ww, wh);
          g.fillStyle = 'rgba(160,140,255,0.12)';
          g.fillRect(wx + ww * 0.1, wy + wh * 0.1, ww * 0.12, wh * 0.8);
        }
        // mullion
        g.fillStyle = emissive ? '#000' : '#0c0824';
        g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
      }
  };
  const map = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.07})`;
      g.fillRect(r() * w, r() * h, 8 + r() * 30, 4 + r() * 14);
    }
    // floor slabs
    g.fillStyle = band;
    for (let y = 0; y < rows; y++) g.fillRect(0, y * (h / rows), w, 5);
    // parapet band at the roof line (top of the tile)
    g.fillRect(0, 0, w, 12);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, 12, w, 2);
    drawWindows(g, w, h, false);
  }, { repeat: true });
  const emis = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    drawWindows(g, w, h, true);
  }, { repeat: true });
  return { map, emis };
}

/** Distant skyline tile (16m x 16m): tiny windows, rendered unlit. */
export function skylineTexture(wall: string, seed: number, litChance: number) {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    const n = 8;
    const s = w / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const lit = r() < litChance;
        g.fillStyle = lit ? WIN_COLORS[Math.floor(r() * WIN_COLORS.length)] : 'rgba(0,0,0,0.25)';
        g.globalAlpha = lit ? 0.55 + r() * 0.45 : 1;
        g.fillRect(x * s + s * 0.25, y * s + s * 0.3, s * 0.5, s * 0.45);
      }
    g.globalAlpha = 1;
  }, { repeat: true });
}

/** Steel deck plates for bridges. */
export function deckTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const r = mulberry(5);
    g.fillStyle = '#2b2459';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.06})`;
      g.fillRect(r() * w, r() * h, 6 + r() * 20, 2 + r() * 6);
    }
    // diamond tread
    g.strokeStyle = 'rgba(160,140,255,0.18)';
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 16)
      for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
        g.beginPath(); g.moveTo(x, y + 3); g.lineTo(x + 6, y + 9); g.stroke();
      }
    g.strokeStyle = '#140f33';
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);
  }, { repeat: true });
}

/** Girder / truss side panels (ramps, perch, bridges). */
export function trussTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#1b1540';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3a2f82';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(w, h);
    g.moveTo(w, 0); g.lineTo(0, h);
    g.stroke();
    g.lineWidth = 12;
    g.strokeRect(0, 0, w, h);
    g.fillStyle = '#5a4bb8';
    for (const [x, y] of [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8], [w / 2, h / 2]]) {
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
  }, { repeat: true });
}

/** Chunky crate side with a glowing cat stencil. */
export function crateTexture(accent: string) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#231d4d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#16123a';
    g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    g.strokeStyle = accent;
    g.shadowColor = accent;
    g.shadowBlur = 8;
    g.lineWidth = 5;
    catPath(g, w / 2, h / 2 + 4, 30);
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = accent;
    g.fillRect(14, h - 26, w - 28, 5);
  });
}

/* ------------------------------------------------------------------ drawing helpers */

/** Cat head outline path centred at cx, cy with half-size s. */
export function catPath(g: G, cx: number, cy: number, s: number) {
  g.beginPath();
  g.moveTo(cx - 0.95 * s, cy + 0.05 * s);
  g.lineTo(cx - 0.82 * s, cy - 0.98 * s);
  g.lineTo(cx - 0.3 * s, cy - 0.55 * s);
  g.quadraticCurveTo(cx, cy - 0.65 * s, cx + 0.3 * s, cy - 0.55 * s);
  g.lineTo(cx + 0.82 * s, cy - 0.98 * s);
  g.lineTo(cx + 0.95 * s, cy + 0.05 * s);
  g.bezierCurveTo(cx + 0.98 * s, cy + 0.85 * s, cx - 0.98 * s, cy + 0.85 * s, cx - 0.95 * s, cy + 0.05 * s);
  g.closePath();
}

/** Glowing cat head (outline + eyes + nose + whiskers). */
export function neonCat(g: G, cx: number, cy: number, s: number, color: string, core = '#ffffff') {
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const pass of [0, 1]) {
    g.shadowColor = color;
    g.shadowBlur = pass ? s * 0.12 : s * 0.35;
    g.strokeStyle = pass ? core : color;
    g.lineWidth = pass ? s * 0.05 : s * 0.13;
    catPath(g, cx, cy, s);
    g.stroke();
    // eyes (slanted)
    g.beginPath();
    g.moveTo(cx - 0.55 * s, cy - 0.05 * s); g.quadraticCurveTo(cx - 0.35 * s, cy - 0.28 * s, cx - 0.15 * s, cy - 0.05 * s);
    g.moveTo(cx + 0.15 * s, cy - 0.05 * s); g.quadraticCurveTo(cx + 0.35 * s, cy - 0.28 * s, cx + 0.55 * s, cy - 0.05 * s);
    // nose + mouth
    g.moveTo(cx - 0.08 * s, cy + 0.15 * s); g.lineTo(cx + 0.08 * s, cy + 0.15 * s); g.lineTo(cx, cy + 0.25 * s); g.closePath();
    g.moveTo(cx, cy + 0.25 * s); g.quadraticCurveTo(cx - 0.12 * s, cy + 0.42 * s, cx - 0.25 * s, cy + 0.32 * s);
    g.moveTo(cx, cy + 0.25 * s); g.quadraticCurveTo(cx + 0.12 * s, cy + 0.42 * s, cx + 0.25 * s, cy + 0.32 * s);
    // whiskers
    for (const sg of [-1, 1]) {
      g.moveTo(cx + sg * 0.42 * s, cy + 0.2 * s); g.lineTo(cx + sg * 1.12 * s, cy + 0.08 * s);
      g.moveTo(cx + sg * 0.42 * s, cy + 0.3 * s); g.lineTo(cx + sg * 1.12 * s, cy + 0.36 * s);
    }
    g.stroke();
  }
  g.restore();
}

/** Mix a #rrggbb colour toward white. */
export function lighten(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v + (255 - v) * amt);
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/** Neon tube text: coloured glow + stroke with a hot, lightly tinted core. Shrinks to fit maxW. */
export function neonText(g: G, text: string, x: number, y: number, size: number, color: string, o: { maxW?: number; font?: string; core?: string; tilt?: number; tube?: boolean } = {}) {
  g.save();
  const fontT = o.font ?? `{s}px ${FONT_TOON}`;
  let s = size;
  const setFont = () => { g.font = fontT.replace('{s}', String(Math.round(s))); };
  setFont();
  while (o.maxW && g.measureText(text).width > o.maxW && s > 8) { s -= 2; setFont(); }
  g.translate(x, y);
  if (o.tilt) g.rotate(o.tilt);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.shadowColor = color;
  g.shadowBlur = s * 0.45;
  g.strokeStyle = color;
  g.lineWidth = s * 0.14;
  g.strokeText(text, 0, 0);
  g.shadowBlur = s * 0.2;
  if (o.tube) {
    g.lineWidth = s * 0.05;
    g.strokeStyle = o.core ?? lighten(color, 0.6);
    g.strokeText(text, 0, 0);
  } else {
    g.fillStyle = o.core ?? lighten(color, 0.55);
    g.fillText(text, 0, 0);
  }
  g.restore();
  return s;
}

function roundRect(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Dark sign panel with a glowing neon border. */
function panel(g: G, x: number, y: number, w: number, h: number, color: string, bg = '#120a2e', pad = 6) {
  g.save();
  g.fillStyle = '#05020f';
  g.fillRect(x, y, w, h);
  const lg = g.createLinearGradient(0, y, 0, y + h);
  lg.addColorStop(0, bg);
  lg.addColorStop(1, '#070318');
  g.fillStyle = lg;
  roundRect(g, x + pad, y + pad, w - pad * 2, h - pad * 2, Math.min(w, h) * 0.08);
  g.fill();
  g.shadowColor = color;
  g.shadowBlur = 10;
  g.strokeStyle = color;
  g.lineWidth = 4;
  roundRect(g, x + pad + 3, y + pad + 3, w - pad * 2 - 6, h - pad * 2 - 6, Math.min(w, h) * 0.07);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 1.5;
  g.stroke();
  g.restore();
}

/* ------------------------------------------------------------------ atlases */

export interface Atlas {
  tex: THREE.CanvasTexture;
  /** uv rect [u0, v0, u1, v1] for a named slot. */
  uv(slot: string): [number, number, number, number];
  /** Pixel aspect ratio (w/h) of a slot. */
  aspect(slot: string): number;
}

function makeAtlas(size: number, slots: Record<string, [number, number, number, number]>, draw: (g: G, s: Record<string, [number, number, number, number]>) => void): Atlas {
  const fn = (g: G) => draw(g, slots);
  const tex = canvasTexture(size, size, (g) => fn(g));
  redrawWhenFontsReady(tex, (g) => fn(g));
  return {
    tex,
    uv(slot) {
      const [x, y, w, h] = slots[slot];
      return [x / size, 1 - (y + h) / size, (x + w) / size, 1 - y / size];
    },
    aspect(slot) {
      const s = slots[slot];
      return s[2] / s[3];
    },
  };
}

export const CYAN = '#2ee6ff';
export const PINK = '#ff3fa8';
export const MAGENTA = '#e040ff';
export const HOTRED = '#ff2d6f';
export const LIME = '#7dff6a';
export const GOLD = '#ffc23d';

/** Big billboards & team signs. */
export function billboardAtlas(): Atlas {
  return makeAtlas(512, {
    dreams: [0, 0, 512, 128],
    vibes: [0, 128, 512, 128],
    nights: [0, 256, 512, 128],
    blue: [0, 384, 256, 128],
    red: [256, 384, 256, 128],
  }, (g, s) => {
    let [x, y, w, h] = s.dreams;
    panel(g, x, y, w, h, PINK);
    neonText(g, 'BIGGER DREAMS', x + w / 2, y + h * 0.32, 52, PINK, { maxW: w * 0.86 });
    neonText(g, 'BRIGHTER BATTLES', x + w / 2, y + h * 0.7, 52, MAGENTA, { maxW: w * 0.86 });

    [x, y, w, h] = s.vibes;
    panel(g, x, y, w, h, CYAN, '#0a1238');
    neonText(g, 'GOOD VIBES WIN', x + w * 0.56, y + h / 2 + 4, 66, CYAN, { maxW: w * 0.72 });
    crown(g, x + w * 0.1, y + h / 2, 30, '#8a7dff');

    [x, y, w, h] = s.nights;
    panel(g, x, y, w, h, MAGENTA);
    neonText(g, 'NEON', x + w * 0.3, y + h * 0.34, 56, PINK, { maxW: w * 0.5 });
    neonText(g, 'TOON NIGHTS', x + w * 0.38, y + h * 0.7, 46, CYAN, { maxW: w * 0.62, tilt: -0.04 });
    neonCat(g, x + w * 0.84, y + h / 2, 38, PINK);

    for (const [slot, col, label] of [['blue', CYAN, 'BLUE'], ['red', HOTRED, 'RED']] as const) {
      [x, y, w, h] = s[slot];
      panel(g, x, y, w, h, col, slot === 'blue' ? '#07123a' : '#2a0718');
      neonCat(g, x + w * 0.24, y + h / 2 + 4, 34, col);
      neonText(g, label, x + w * 0.64, y + h / 2 + 4, 64, col, { maxW: w * 0.5, font: FONT_TECH });
    }
  });
}

function crown(g: G, cx: number, cy: number, s: number, color: string) {
  g.save();
  g.shadowColor = color;
  g.shadowBlur = 12;
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(cx - s, cy + s * 0.6);
  g.lineTo(cx - s, cy - s * 0.5);
  g.lineTo(cx - s * 0.5, cy);
  g.lineTo(cx, cy - s * 0.8);
  g.lineTo(cx + s * 0.5, cy);
  g.lineTo(cx + s, cy - s * 0.5);
  g.lineTo(cx + s, cy + s * 0.6);
  g.closePath();
  g.stroke();
  g.strokeStyle = '#fff';
  g.lineWidth = 1.5;
  g.stroke();
  g.restore();
}

/** Vending machine faces, vertical signs, small signs and cat logos. */
export function propAtlas(): Atlas {
  return makeAtlas(512, {
    drinks: [0, 0, 128, 256],
    snacks: [128, 0, 128, 256],
    hotel: [256, 0, 64, 256],
    ramen: [320, 0, 64, 256],
    arcade: [384, 0, 64, 256],
    open: [448, 0, 64, 256],
    glowy: [0, 256, 256, 64],
    zap: [256, 256, 256, 64],
    score: [0, 320, 256, 64],
    pizza: [256, 320, 256, 64],
    catc: [0, 384, 128, 128],
    catp: [128, 384, 128, 128],
    exit: [256, 384, 128, 64],
    cafe: [384, 384, 128, 64],
    radical: [256, 448, 256, 64],
  }, (g, s) => {
    vendingFace(g, s.drinks, 'PLASMA', 'DRINKS', CYAN, PINK, 0);
    vendingFace(g, s.snacks, 'SNACKS', '', GOLD, PINK, 1);
    const vert = (slot: [number, number, number, number], text: string, col: string) => {
      const [x, y, w, h] = slot;
      panel(g, x, y, w, h, col, '#0d0626', 3);
      const letters = text.split('');
      const step = (h - 30) / letters.length;
      letters.forEach((ch, i) => neonText(g, ch, x + w / 2, y + 18 + step * (i + 0.5), Math.min(step * 0.95, 40), col, { maxW: w * 0.7 }));
    };
    vert(s.hotel, 'HOTEL', PINK);
    vert(s.ramen, 'RAMEN', GOLD);
    vert(s.arcade, 'ARCADE', CYAN);
    vert(s.open, 'OPEN', LIME);
    const small = (slot: [number, number, number, number], text: string, col: string, bg = '#100828') => {
      const [x, y, w, h] = slot;
      panel(g, x, y, w, h, col, bg, 3);
      neonText(g, text, x + w / 2, y + h / 2 + 2, h * 0.52, col, { maxW: w * 0.84 });
    };
    small(s.glowy, 'STAY GLOWY', MAGENTA);
    small(s.zap, 'ZAP RESPONSIBLY', CYAN);
    small(s.score, 'HIGH SCORE CITY', GOLD);
    small(s.pizza, 'PIXEL PIZZA', '#ff7a3d');
    small(s.exit, 'EXIT', LIME, '#06180c');
    small(s.cafe, 'CAT CAFE', PINK);
    small(s.radical, 'KEEP IT RADICAL', '#8a7dff');
    for (const [slot, col] of [[s.catc, CYAN], [s.catp, PINK]] as const) {
      const [x, y, w, h] = slot;
      g.fillStyle = '#000';
      g.fillRect(x, y, w, h);
      neonCat(g, x + w / 2, y + h / 2 + 6, w * 0.36, col);
    }
  });
}

function vendingFace(g: G, slot: [number, number, number, number], l1: string, l2: string, col: string, col2: string, seed: number) {
  const [x, y, w, h] = slot;
  const r = mulberry(40 + seed);
  g.save();
  g.fillStyle = '#0d0a24';
  g.fillRect(x, y, w, h);
  // header
  const hh = l2 ? 64 : 48;
  const lg = g.createLinearGradient(0, y, 0, y + hh);
  lg.addColorStop(0, '#1b0f3d');
  lg.addColorStop(1, '#0b0620');
  g.fillStyle = lg;
  g.fillRect(x + 4, y + 4, w - 8, hh);
  neonText(g, l1, x + w / 2, y + (l2 ? 22 : 30), 30, col, { maxW: w * 0.84 });
  if (l2) neonText(g, l2, x + w / 2, y + 50, 26, col2, { maxW: w * 0.84 });
  // glass
  const gy = y + hh + 10, gh = h - hh - 64;
  const glass = g.createLinearGradient(x, gy, x + w, gy + gh);
  glass.addColorStop(0, '#3a2c8a');
  glass.addColorStop(1, '#1c1450');
  g.fillStyle = glass;
  g.fillRect(x + 8, gy, w - 34, gh);
  const rows = 4, cols = 3;
  const cols2 = [CYAN, PINK, GOLD, LIME, '#ff7a3d', MAGENTA];
  for (let ry = 0; ry < rows; ry++) {
    const shelfY = gy + ((ry + 1) / rows) * gh - 4;
    g.fillStyle = '#6b5cd6';
    g.fillRect(x + 8, shelfY, w - 34, 3);
    for (let cx = 0; cx < cols; cx++) {
      const c = cols2[Math.floor(r() * cols2.length)];
      const bx = x + 14 + cx * ((w - 44) / cols), bw = (w - 44) / cols - 6;
      const by = shelfY - gh / rows + 10, bh = gh / rows - 14;
      g.fillStyle = c;
      if (seed === 0) {
        // bottles
        g.fillRect(bx + bw * 0.2, by + bh * 0.3, bw * 0.6, bh * 0.7);
        g.fillRect(bx + bw * 0.38, by + bh * 0.05, bw * 0.24, bh * 0.3);
      } else {
        // snack bags
        g.beginPath();
        g.moveTo(bx, by + bh); g.lineTo(bx + 2, by + bh * 0.15); g.lineTo(bx + bw - 2, by + bh * 0.15); g.lineTo(bx + bw, by + bh);
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillRect(bx + bw * 0.25, by + bh * 0.4, 2, bh * 0.4);
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.beginPath(); g.moveTo(x + 10, gy); g.lineTo(x + 34, gy); g.lineTo(x + 10, gy + 60); g.fill();
  // keypad column
  g.fillStyle = '#1a1440';
  g.fillRect(x + w - 24, gy, 18, gh);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? col : col2;
    g.fillRect(x + w - 20, gy + 10 + i * 12, 10, 6);
  }
  // pickup slot
  g.fillStyle = '#05030e';
  g.fillRect(x + 12, y + h - 46, w - 24, 26);
  g.strokeStyle = col;
  g.shadowColor = col;
  g.shadowBlur = 8;
  g.lineWidth = 3;
  g.strokeRect(x + 12, y + h - 46, w - 24, 26);
  g.restore();
}

/** Radial glow sprite (white centre -> transparent). */
export function glowSprite() {
  return canvasTexture(128, 128, (g, w, h) => {
    const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
  });
}

/** Vertical fade (for light beams / haze): opaque at bottom -> transparent at top. */
export function fadeTexture() {
  return canvasTexture(16, 128, (g, w, h) => {
    const lg = g.createLinearGradient(0, h, 0, 0);
    lg.addColorStop(0, 'rgba(255,255,255,1)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);
  });
}

/** Pale synthwave moon with soft craters and a halo. */
export function moonTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    const halo = g.createRadialGradient(cx, cy, w * 0.2, cx, cy, w / 2);
    halo.addColorStop(0, 'rgba(255,170,240,0.5)');
    halo.addColorStop(1, 'rgba(255,120,220,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, w, h);
    const body = g.createLinearGradient(0, cy - 60, 0, cy + 60);
    body.addColorStop(0, '#fff2ff');
    body.addColorStop(1, '#ffb8ec');
    g.fillStyle = body;
    g.beginPath(); g.arc(cx, cy, w * 0.23, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(200,120,220,0.35)';
    for (const [x, y, r] of [[-18, -14, 12], [16, 10, 16], [-6, 26, 7], [22, -22, 6], [-26, 12, 5]]) {
      g.beginPath(); g.arc(cx + x, cy + y, r, 0, Math.PI * 2); g.fill();
    }
  });
}
