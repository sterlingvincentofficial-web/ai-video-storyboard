import * as THREE from 'three';
import { canvasTexture } from '../../render/Materials';
import { mulberry } from '../../core/utils';

/** Font stack for chunky toy lettering (falls back gracefully when web fonts are unavailable). */
export const TOY_FONT = '"Luckiest Guy", "Fredoka", "Arial Black", "Arial Rounded MT Bold", sans-serif';

export function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner = 0.48, points = 5, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/** Rounded star (soft plush / plastic embossed star). */
export function softStar(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, shadow?: string) {
  g.save();
  g.lineJoin = 'round';
  if (shadow) {
    g.fillStyle = shadow;
    g.strokeStyle = shadow;
    g.lineWidth = r * 0.22;
    starPath(g, cx + r * 0.06, cy + r * 0.1, r * 0.9);
    g.fill();
    g.stroke();
  }
  g.fillStyle = fill;
  g.strokeStyle = fill;
  g.lineWidth = r * 0.22;
  starPath(g, cx, cy, r * 0.9);
  g.fill();
  g.stroke();
  g.restore();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  if (amt > 0) c.lerp(new THREE.Color(1, 1, 1), amt);
  else c.multiplyScalar(1 + amt);
  return '#' + c.getHexString();
}

// ---------------------------------------------------------------------------------------------
// Alphabet / star / dice block atlas: 5x5 cells.
export const ATLAS_N = 5;
export type CellSpec =
  | { k: 'glyph'; bg: string; fg: string; t: string }
  | { k: 'star'; bg: string; fg: string }
  | { k: 'heart'; bg: string; fg: string }
  | { k: 'moon'; bg: string; fg: string }
  | { k: 'dice'; n: number; bg: string; fg: string }
  | { k: 'plain'; bg: string };

export const CELLS: CellSpec[] = [
  { k: 'glyph', bg: '#ff6b6b', fg: '#fff7e0', t: 'A' },
  { k: 'glyph', bg: '#4d9bff', fg: '#fff7e0', t: 'B' },
  { k: 'glyph', bg: '#ffd23f', fg: '#ff6b3d', t: 'C' },
  { k: 'glyph', bg: '#5ccf6b', fg: '#fff7e0', t: 'T' },
  { k: 'glyph', bg: '#ff9f43', fg: '#fff7e0', t: 'O' },
  { k: 'glyph', bg: '#a98bff', fg: '#fff7e0', t: 'Y' },
  { k: 'glyph', bg: '#ff8fb8', fg: '#fff7e0', t: '1' },
  { k: 'glyph', bg: '#6ec6ff', fg: '#ffffff', t: '2' },
  { k: 'glyph', bg: '#ffd23f', fg: '#4d7cff', t: '3' },
  { k: 'star', bg: '#4d9bff', fg: '#ffe27a' },
  { k: 'star', bg: '#ff6b6b', fg: '#fff1c9' },
  { k: 'star', bg: '#ffd23f', fg: '#ffffff' },
  { k: 'star', bg: '#5ccf6b', fg: '#fff4a8' },
  { k: 'heart', bg: '#ff8fb8', fg: '#ffffff' },
  { k: 'moon', bg: '#6c7cff', fg: '#fff3b0' },
  { k: 'dice', n: 1, bg: '#fffaf0', fg: '#ff4b5c' },
  { k: 'dice', n: 2, bg: '#fffaf0', fg: '#27305a' },
  { k: 'dice', n: 3, bg: '#fffaf0', fg: '#27305a' },
  { k: 'dice', n: 4, bg: '#fffaf0', fg: '#27305a' },
  { k: 'dice', n: 5, bg: '#fffaf0', fg: '#27305a' },
  { k: 'dice', n: 6, bg: '#fffaf0', fg: '#27305a' },
  { k: 'plain', bg: '#4d9bff' },
  { k: 'plain', bg: '#ff6b6b' },
  { k: 'plain', bg: '#ffd23f' },
  { k: 'plain', bg: '#5ccf6b' },
];
export const CELL = {
  A: 0, B: 1, C: 2, T: 3, O: 4, Y: 5, N1: 6, N2: 7, N3: 8,
  starBlue: 9, starRed: 10, starYellow: 11, starGreen: 12, heart: 13, moon: 14,
  d1: 15, d2: 16, d3: 17, d4: 18, d5: 19, d6: 20,
  plainBlue: 21, plainRed: 22, plainYellow: 23, plainGreen: 24,
};

export function blockAtlas() {
  return canvasTexture(510, 510, (g, w) => {
    const cs = w / ATLAS_N;
    CELLS.forEach((c, i) => {
      const x = (i % ATLAS_N) * cs, y = Math.floor(i / ATLAS_N) * cs;
      g.save();
      g.translate(x, y);
      g.fillStyle = c.bg;
      g.fillRect(0, 0, cs, cs);
      // soft bevel: lighter top-left, darker bottom-right rim
      const grd = g.createLinearGradient(0, 0, cs, cs);
      grd.addColorStop(0, 'rgba(255,255,255,0.22)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = grd;
      g.fillRect(0, 0, cs, cs);
      if (c.k !== 'dice') {
        g.strokeStyle = shade(c.bg, 0.35);
        g.lineWidth = 5;
        roundRect(g, 10, 10, cs - 20, cs - 20, 12);
        g.stroke();
      }
      const cx = cs / 2, cy = cs / 2;
      if (c.k === 'glyph') {
        g.font = `900 ${Math.floor(cs * 0.7)}px ${TOY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillText(c.t, cx + 3, cy + 6);
        g.fillStyle = c.fg;
        g.fillText(c.t, cx, cy + 3);
      } else if (c.k === 'star') {
        softStar(g, cx, cy + 2, cs * 0.34, c.fg, 'rgba(0,0,0,0.14)');
      } else if (c.k === 'heart') {
        g.fillStyle = c.fg;
        g.beginPath();
        const s = cs * 0.3;
        g.moveTo(cx, cy + s * 0.9);
        g.bezierCurveTo(cx - s * 1.4, cy - s * 0.1, cx - s * 0.7, cy - s * 1.2, cx, cy - s * 0.45);
        g.bezierCurveTo(cx + s * 0.7, cy - s * 1.2, cx + s * 1.4, cy - s * 0.1, cx, cy + s * 0.9);
        g.fill();
      } else if (c.k === 'moon') {
        g.fillStyle = c.fg;
        g.beginPath();
        g.arc(cx, cy, cs * 0.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = c.bg;
        g.beginPath();
        g.arc(cx + cs * 0.13, cy - cs * 0.08, cs * 0.26, 0, Math.PI * 2);
        g.fill();
      } else if (c.k === 'dice') {
        const pos: Record<number, [number, number][]> = {
          1: [[0, 0]],
          2: [[-1, -1], [1, 1]],
          3: [[-1, -1], [0, 0], [1, 1]],
          4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
          5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
          6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
        };
        for (const [px, py] of pos[c.n]) {
          g.fillStyle = c.fg;
          g.beginPath();
          g.arc(cx + px * cs * 0.24, cy + py * cs * 0.24, cs * (c.n === 1 ? 0.13 : 0.085), 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.beginPath();
          g.arc(cx + px * cs * 0.24 - 3, cy + py * cs * 0.24 - 3, cs * 0.025, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    });
  });
}

/** UV rect [u0, v0, u1, v1] of an atlas cell (with a small inset to avoid bleeding). */
export function cellUV(i: number, inset = 0.012): [number, number, number, number] {
  const s = 1 / ATLAS_N;
  const cx = i % ATLAS_N, cy = Math.floor(i / ATLAS_N);
  const u0 = cx * s + inset, u1 = (cx + 1) * s - inset;
  // canvas row 0 is at the top => v near 1
  const v1 = 1 - cy * s - inset, v0 = 1 - (cy + 1) * s + inset;
  return [u0, v0, u1, v1];
}

// ---------------------------------------------------------------------------------------------
/** Big patterned carpet covering the arena. Canvas top = -Z (red side), bottom = +Z (blue side). */
export function rugTexture() {
  return canvasTexture(356, 512, (g, w, h) => {
    const r = mulberry(21);
    g.fillStyle = '#efdcb8';
    g.fillRect(0, 0, w, h);
    const wave = (y0: number, amp: number, freq: number, phase: number, thick: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      for (let x = -4; x <= w + 4; x += 4) {
        const y = y0 + Math.sin(x * freq + phase) * amp;
        if (x === -4) g.moveTo(x, y - thick / 2);
        else g.lineTo(x, y - thick / 2);
      }
      for (let x = w + 4; x >= -4; x -= 4) {
        const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase) * amp * 0.12;
        g.lineTo(x, y + thick / 2);
      }
      g.closePath();
      g.fill();
    };
    // colour-coded halves: blue waves near the blue base (bottom), coral near red (top)
    const blueA = '#6fa8ee', blueB = '#3f7fd9', yel = '#ffc94a', coral = '#ff9a7e', coralB = '#f7725f', mint = '#9fdcbc';
    const bands: [number, string, number][] = [
      [30, coralB, 26], [62, yel, 18], [96, coral, 30], [138, mint, 14], [176, yel, 22],
      [336, yel, 22], [374, mint, 14], [416, blueA, 30], [450, yel, 18], [482, blueB, 26],
    ];
    bands.forEach(([y, c, t], i) => wave(y, 10 + (i % 3) * 3, 0.035 + (i % 2) * 0.01, i * 1.3, t, c));
    // central medallion
    const cx = w / 2, cy = h / 2;
    g.fillStyle = '#ffe7a6';
    g.beginPath();
    g.arc(cx, cy, 70, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = blueA;
    g.beginPath();
    g.arc(cx, cy, 64, 0, Math.PI);
    g.stroke();
    g.strokeStyle = coral;
    g.beginPath();
    g.arc(cx, cy, 64, Math.PI, Math.PI * 2);
    g.stroke();
    g.lineWidth = 5;
    g.strokeStyle = '#fff8e8';
    g.beginPath();
    g.arc(cx, cy, 50, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      softStar(g, cx + Math.cos(a) * 58, cy + Math.sin(a) * 58, 5, '#fff8e8');
    }
    // swirl blobs on the sides (soft wave shapes like the concept rug)
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = 200 + r() * 112;
      g.fillStyle = [blueA, yel, coral, mint][i % 4];
      g.globalAlpha = 0.55;
      g.beginPath();
      g.ellipse(x, y, 14 + r() * 18, 5 + r() * 6, (r() - 0.5) * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // scattered stars
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h;
      if (Math.hypot(x - cx, y - cy) < 80) continue;
      const top = y < h / 2;
      softStar(g, x, y, 3 + r() * 4, r() > 0.5 ? '#fffaf0' : top ? '#ff9f8a' : '#7fb0f0');
    }
    // border
    g.lineWidth = 10;
    g.strokeStyle = '#f2d9a8';
    g.strokeRect(5, 5, w - 10, h - 10);
  });
}

/** Warm honey wooden floor boards (repeating). */
export function woodFloorTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = mulberry(5);
    const rows = 4;
    const rh = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 120;
      while (x < w) {
        const len = 90 + r() * 110;
        const tone = 0.9 + r() * 0.16;
        const c = new THREE.Color('#e4b27a').multiplyScalar(tone);
        g.fillStyle = '#' + c.getHexString();
        g.fillRect(x, i * rh, len, rh);
        for (let k = 0; k < 6; k++) {
          g.strokeStyle = `rgba(120,70,30,${0.06 + r() * 0.08})`;
          g.lineWidth = 1 + r() * 1.5;
          g.beginPath();
          const yy = i * rh + 6 + r() * (rh - 12);
          g.moveTo(x, yy);
          g.bezierCurveTo(x + len * 0.3, yy + (r() - 0.5) * 8, x + len * 0.6, yy + (r() - 0.5) * 8, x + len, yy);
          g.stroke();
        }
        g.fillStyle = 'rgba(90,50,20,0.55)';
        g.fillRect(x, i * rh, 2, rh);
        x += len;
      }
      g.fillStyle = 'rgba(90,50,20,0.5)';
      g.fillRect(0, i * rh, w, 2);
    }
  }, { repeat: true });
}

/** Pastel wallpaper with little stars and clouds (repeating). */
export function wallpaperTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#f5efe6';
    g.fillRect(0, 0, w, h);
    // soft vertical stripes
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = 'rgba(160,200,238,0.35)';
      g.fillRect(x, 0, 12, h);
    }
    const r = mulberry(8);
    for (let i = 0; i < 6; i++) {
      const x = ((i % 3) + 0.5) * (w / 3) + (i > 2 ? w / 6 : 0), y = (i > 2 ? 0.72 : 0.25) * h;
      softStar(g, x % w, y, 11, i % 2 ? '#ffd98a' : '#a9cdf2');
    }
    for (let i = 0; i < 18; i++) {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.arc(r() * w, r() * h, 2 + r() * 2, 0, Math.PI * 2);
      g.fill();
    }
  }, { repeat: true });
}

/** Navy blanket / curtain fabric with white stars (repeating). */
export function starFabricTexture(bg = '#3f6fd8', star = '#ffffff', stripe = 'rgba(255,255,255,0.07)') {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = stripe;
      g.fillRect(0, y, w, 6);
    }
    const pts: [number, number, number][] = [[40, 50, 26], [170, 30, 18], [110, 130, 24], [220, 150, 28], [50, 200, 20], [180, 230, 16], [0, 120, 14], [256, 120, 14]];
    for (const [x, y, s] of pts) softStar(g, x, y, s, star, 'rgba(0,0,0,0.12)');
  }, { repeat: true });
}

/** View out of the window: bright sky, puffy clouds, tree tops, a distant rooftop. */
export function windowViewTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#6fb8ff');
    grd.addColorStop(0.6, '#bfe4ff');
    grd.addColorStop(1, '#eaf7ff');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const r = mulberry(4);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < 5; i++) {
      const x = r() * w, y = 30 + r() * 90;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(x + k * 13 - 26, y + Math.sin(k * 1.7) * 5, 12 + r() * 8, 0, Math.PI * 2);
        g.fill();
      }
    }
    // tree tops
    for (let i = 0; i < 9; i++) {
      const x = (i / 8) * w, y = h * 0.78 + r() * 20;
      g.fillStyle = i % 2 ? '#6fcf6a' : '#58b85c';
      g.beginPath();
      g.arc(x, y, 30 + r() * 22, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#4aa352';
    g.fillRect(0, h * 0.9, w, h * 0.1);
  });
}

/** Colourful book spines (for bookshelves). */
export function bookSpinesTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    const r = mulberry(12);
    const cols = ['#ff6b6b', '#4d9bff', '#ffd23f', '#5ccf6b', '#a98bff', '#ff9f43', '#ff8fb8', '#6ec6ff', '#fffaf0', '#27305a'];
    let x = 0;
    g.fillStyle = '#6b4a2e';
    g.fillRect(0, 0, w, h);
    while (x < w) {
      const bw = 10 + r() * 16;
      const bh = h * (0.72 + r() * 0.28);
      const c = cols[Math.floor(r() * cols.length)];
      g.fillStyle = c;
      g.fillRect(x, h - bh, bw - 1, bh);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(x + 2, h - bh + 8, bw - 5, 3);
      g.fillRect(x + 2, h - 14, bw - 5, 3);
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(x + bw - 3, h - bh, 2, bh);
      x += bw;
    }
  }, { repeat: true });
}

/** Posters atlas: DREAM PLAY GROW / TO THE STARS / BE KIND rainbow / TOYS chest label. */
export const POSTER = {
  dream: [0, 0, 256, 352] as const,
  stars: [256, 0, 512, 352] as const,
  kind: [0, 352, 256, 512] as const,
  toys: [256, 352, 512, 512] as const,
};
export function posterAtlas() {
  return canvasTexture(512, 512, (g) => {
    // --- DREAM PLAY GROW
    {
      const [x0, y0, x1, y1] = POSTER.dream;
      const w = x1 - x0, h = y1 - y0;
      g.save();
      g.translate(x0, y0);
      g.fillStyle = '#fff9ee';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 10;
      g.strokeRect(8, 8, w - 16, h - 16);
      const words: [string, string[]][] = [
        ['DREAM', ['#4d9bff', '#6c7cff', '#4d9bff', '#6c7cff', '#4d9bff']],
        ['PLAY', ['#ff6b6b', '#ff9f43', '#ff6b6b', '#ff9f43']],
        ['GROW', ['#5ccf6b', '#34b35b', '#5ccf6b', '#34b35b']],
      ];
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      words.forEach(([word, cols], wi) => {
        const size = wi === 0 ? 50 : 58;
        g.font = `900 ${size}px ${TOY_FONT}`;
        const total = g.measureText(word).width;
        let x = w / 2 - total / 2;
        const y = 78 + wi * 96;
        for (let i = 0; i < word.length; i++) {
          const cw = g.measureText(word[i]).width;
          g.fillStyle = 'rgba(0,0,0,0.12)';
          g.fillText(word[i], x + cw / 2 + 3, y + 4 + (i % 2 ? -3 : 3));
          g.fillStyle = cols[i % cols.length];
          g.fillText(word[i], x + cw / 2, y + (i % 2 ? -3 : 3));
          x += cw;
        }
      });
      for (let i = 0; i < 6; i++) softStar(g, 26 + (i % 3) * 102, i < 3 ? 30 : h - 30, 9, ['#ffd23f', '#ff8fb8', '#6ec6ff'][i % 3]);
      g.restore();
    }
    // --- TO THE STARS rocket poster
    {
      const [x0, y0, x1, y1] = POSTER.stars;
      const w = x1 - x0, h = y1 - y0;
      g.save();
      g.translate(x0, y0);
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#2b2f7a');
      grd.addColorStop(1, '#5b4fc4');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      const r = mulberry(33);
      for (let i = 0; i < 40; i++) softStar(g, r() * w, r() * h * 0.8, 2 + r() * 4, '#fff3b0');
      // planet
      g.fillStyle = '#ff9f43';
      g.beginPath(); g.arc(200, 90, 30, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffd23f'; g.lineWidth = 6;
      g.beginPath(); g.ellipse(200, 90, 48, 12, -0.3, 0, Math.PI * 2); g.stroke();
      // rocket
      g.save();
      g.translate(110, 190);
      g.rotate(0.35);
      g.fillStyle = '#ff6b3d';
      g.beginPath(); g.moveTo(0, 90); g.lineTo(-22, 125); g.lineTo(22, 125); g.closePath(); g.fill();
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.moveTo(-14, 118); g.lineTo(0, 160); g.lineTo(14, 118); g.closePath(); g.fill();
      g.fillStyle = '#fffaf0';
      g.beginPath(); g.ellipse(0, 20, 28, 80, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff4b5c';
      g.beginPath(); g.moveTo(-26, -20); g.quadraticCurveTo(0, -95, 26, -20); g.closePath(); g.fill();
      g.fillStyle = '#4d9bff';
      g.beginPath(); g.arc(0, 10, 14, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff4b5c';
      g.beginPath(); g.moveTo(-27, 50); g.lineTo(-46, 98); g.lineTo(-20, 90); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(27, 50); g.lineTo(46, 98); g.lineTo(20, 90); g.closePath(); g.fill();
      g.restore();
      g.font = `900 40px ${TOY_FONT}`;
      g.textAlign = 'center';
      g.fillStyle = '#ffd23f';
      g.fillText('TO THE', w / 2, h - 62);
      g.fillStyle = '#ffffff';
      g.fillText('STARS!', w / 2, h - 22);
      g.restore();
    }
    // --- BE KIND rainbow
    {
      const [x0, y0, x1, y1] = POSTER.kind;
      const w = x1 - x0, h = y1 - y0;
      g.save();
      g.translate(x0, y0);
      g.fillStyle = '#fff5f8';
      g.fillRect(0, 0, w, h);
      const cols = ['#ff6b6b', '#ff9f43', '#ffd23f', '#5ccf6b', '#4d9bff', '#a98bff'];
      cols.forEach((c, i) => {
        g.strokeStyle = c;
        g.lineWidth = 11;
        g.beginPath();
        g.arc(w / 2, h - 18, 110 - i * 11, Math.PI, 0);
        g.stroke();
      });
      g.fillStyle = '#ffffff';
      for (const cx of [w / 2 - 105, w / 2 + 105]) {
        for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(cx + (k - 1) * 14, h - 20, 14, 0, Math.PI * 2); g.fill(); }
      }
      g.font = `900 34px ${TOY_FONT}`;
      g.textAlign = 'center';
      g.fillStyle = '#ff5a8a';
      g.fillText('BE KIND', w / 2, h - 36);
      g.restore();
    }
    // --- TOYS chest label
    {
      const [x0, y0, x1, y1] = POSTER.toys;
      const w = x1 - x0, h = y1 - y0;
      g.save();
      g.translate(x0, y0);
      g.fillStyle = '#ffd23f';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fffaf0';
      roundRect(g, 6, 6, w - 12, h - 12, 26);
      g.fill();
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 8;
      roundRect(g, 14, 14, w - 28, h - 28, 20);
      g.stroke();
      g.font = `900 84px ${TOY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const cols = ['#ff6b6b', '#4d9bff', '#ffd23f', '#5ccf6b'];
      'TOYS'.split('').forEach((c, i) => {
        g.fillStyle = 'rgba(0,0,0,0.15)';
        g.fillText(c, 56 + i * 48 + 3, h / 2 + 6 + (i % 2 ? -5 : 5));
        g.fillStyle = cols[i];
        g.fillText(c, 56 + i * 48, h / 2 + 2 + (i % 2 ? -5 : 5));
      });
      g.restore();
    }
  });
}

/** Map a plane geometry's UVs to a pixel rect of a 512x512 atlas. */
export function atlasRectUV(geo: THREE.BufferGeometry, rect: readonly [number, number, number, number], size = 512) {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const [x0, y0, x1, y1] = rect;
  const u0 = x0 / size, u1 = x1 / size, v0 = 1 - y1 / size, v1 = 1 - y0 / size;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  uv.needsUpdate = true;
  return geo;
}

/** Soft fur noise (teddy bear, plush). */
export function furTexture(base: string) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const r = mulberry(17);
    for (let i = 0; i < 1400; i++) {
      const x = r() * w, y = r() * h;
      g.strokeStyle = r() > 0.5 ? 'rgba(255,240,220,0.12)' : 'rgba(80,40,10,0.12)';
      g.lineWidth = 1 + r();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 5, y + 3 + r() * 4);
      g.stroke();
    }
  }, { repeat: true });
}

/** Fort name signs: row 0 = blue fort, row 1 = red fort. */
export function fortSignTexture() {
  return canvasTexture(512, 256, (g, w) => {
    const rows: [string, string, string][] = [['FORT BLUEBERRY', '#3a86ff', '#1f5fd6'], ['FORT CHERRY', '#ff4b5c', '#d62839']];
    rows.forEach(([t, c, d], i) => {
      const y = i * 128;
      g.fillStyle = '#ffd23f';
      roundRect(g, 4, y + 6, w - 8, 116, 30);
      g.fill();
      g.fillStyle = c;
      roundRect(g, 14, y + 16, w - 28, 96, 24);
      g.fill();
      g.strokeStyle = d;
      g.lineWidth = 4;
      roundRect(g, 22, y + 24, w - 44, 80, 18);
      g.stroke();
      g.font = `900 58px ${TOY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillText(t, w / 2 + 3, y + 70, w - 70);
      g.fillStyle = '#ffffff';
      g.fillText(t, w / 2, y + 66, w - 70);
      softStar(g, 44, y + 64, 16, '#ffd23f');
      softStar(g, w - 44, y + 64, 16, '#ffd23f');
    });
  });
}
