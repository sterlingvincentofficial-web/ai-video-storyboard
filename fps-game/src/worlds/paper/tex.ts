import * as THREE from 'three';
import { canvasTexture } from '../../render/Materials';
import { mulberry } from '../../core/utils';

/** Hand-lettering font stack (Permanent Marker is loaded by index.html; fallbacks keep the look). */
export const MARKER = '"Permanent Marker", "Comic Sans MS", "Chalkboard SE", cursive';

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/**
 * Canvas texture that is redrawn once the marker web-font has loaded
 * (world build is synchronous, fonts usually arrive a moment later).
 */
export function markerTexture(w: number, h: number, draw: Draw, opts: { repeat?: boolean } = {}) {
  const tex = canvasTexture(w, h, draw, opts);
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts && typeof fonts.load === 'function') {
    fonts.load(`40px ${MARKER.split(',')[0]}`).then((f) => {
      if (!f.length) return;
      const c = tex.image as HTMLCanvasElement;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, w, h);
      draw(g, w, h);
      tex.needsUpdate = true;
    }).catch(() => undefined);
  }
  return tex;
}

/** Random paper fibres over the current canvas. */
export function fibres(g: CanvasRenderingContext2D, w: number, h: number, seed: number, n = 900, alpha = 0.12, dark = '70,55,35') {
  const r = mulberry(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, l = 2 + r() * 9, a = r() * Math.PI;
    g.strokeStyle = r() > 0.45 ? `rgba(${dark},${r() * alpha})` : `rgba(255,255,255,${r() * alpha * 1.4})`;
    g.lineWidth = 0.5 + r() * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
}

/** Wobbly hand-drawn line. */
export function wobbleLine(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, r: () => number, amp = 1.5) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 18));
  g.beginPath();
  g.moveTo(x0 + (r() - 0.5) * amp, y0 + (r() - 0.5) * amp);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    g.lineTo(x0 + (x1 - x0) * t + (r() - 0.5) * amp, y0 + (y1 - y0) * t + (r() - 0.5) * amp);
  }
  g.stroke();
}

/** Torn (ragged) polygon path around a rectangle. */
export function tornRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number, amp = 4, step = 7) {
  g.beginPath();
  const pts: [number, number][] = [];
  for (let t = 0; t < w; t += step) pts.push([x + t, y + (r() - 0.3) * amp]);
  for (let t = 0; t < h; t += step) pts.push([x + w - (r() - 0.3) * amp, y + t]);
  for (let t = 0; t < w; t += step) pts.push([x + w - t, y + h - (r() - 0.3) * amp]);
  for (let t = 0; t < h; t += step) pts.push([x + (r() - 0.3) * amp, y + h - t]);
  pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
  g.closePath();
}

/** Crown emblem (marker style). */
export function drawCrown(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string, line: string, lw = 4) {
  g.save();
  g.translate(cx, cy);
  g.beginPath();
  g.moveTo(-s, s * 0.45);
  g.lineTo(-s, -s * 0.35);
  g.lineTo(-s * 0.5, s * 0.05);
  g.lineTo(0, -s * 0.6);
  g.lineTo(s * 0.5, s * 0.05);
  g.lineTo(s, -s * 0.35);
  g.lineTo(s, s * 0.45);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineJoin = 'round';
  g.strokeStyle = line;
  g.lineWidth = lw;
  g.stroke();
  g.fillStyle = line;
  for (const [px, py] of [[-s, -s * 0.35], [0, -s * 0.6], [s, -s * 0.35]]) {
    g.beginPath();
    g.arc(px, py - s * 0.08, s * 0.11, 0, Math.PI * 2);
    g.fill();
  }
  g.fillRect(-s, s * 0.45, s * 2, s * 0.18);
  g.restore();
}

/** Grass/path patch detail: near-white paper with torn, shadowed edges. Multiplied by vertex colour. */
export function patchTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = mulberry(21);
    g.fillStyle = '#f5f2ea';
    g.fillRect(0, 0, w, h);
    // soft blotches
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '90,80,50'},${r() * 0.06})`;
      g.beginPath();
      g.arc(r() * w, r() * h, 10 + r() * 40, 0, Math.PI * 2);
      g.fill();
    }
    fibres(g, w, h, 5, 1300, 0.16);
    // shadow band along bottom + right (neighbour overlaps)
    g.fillStyle = 'rgba(40,30,10,0.22)';
    tornRect(g, -10, h - 9, w + 20, 30, r, 6, 6);
    g.fill();
    tornRect(g, w - 9, -10, 30, h + 20, r, 6, 6);
    g.fill();
    // light fibrous torn rim along top + left (white paper core)
    g.fillStyle = 'rgba(255,255,255,0.75)';
    tornRect(g, -10, -24, w + 20, 29, r, 7, 5);
    g.fill();
    tornRect(g, -24, -10, 29, h + 20, r, 7, 5);
    g.fill();
    g.strokeStyle = 'rgba(70,55,30,0.25)';
    g.lineWidth = 1.5;
    wobbleLine(g, 0, 6, w, 5, r, 3);
    wobbleLine(g, 6, 0, 5, h, r, 3);
  }, { repeat: true });
}

/** Cardboard castle bricks drawn with marker. */
export function castleTexture(seed = 3, base = '#c99a5f') {
  return canvasTexture(512, 512, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // corrugation shading (vertical flutes)
    for (let x = 0; x < w; x += 9) {
      g.fillStyle = `rgba(90,55,20,${0.05 + r() * 0.03})`;
      g.fillRect(x, 0, 3, h);
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,235,200' : '80,45,15'},${r() * 0.08})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 20 + r() * 60, 10 + r() * 30, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // bricks
    const rows = 8, bw = 128, bh = h / rows;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * (bw / 2);
      for (let x = -1; x < w / bw + 1; x++) {
        const bx = x * bw + off, by = y * bh;
        const tone = r();
        if (tone > 0.72) {
          g.fillStyle = `rgba(${tone > 0.86 ? '255,230,190' : '110,65,25'},0.14)`;
          g.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
        }
      }
    }
    g.strokeStyle = 'rgba(78,46,20,0.7)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let y = 0; y <= rows; y++) wobbleLine(g, -4, y * bh + 1, w + 4, y * bh + 1, r, 2.5);
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * (bw / 2);
      for (let x = 0; x <= w / bw; x++) wobbleLine(g, x * bw + off, y * bh + 2, x * bw + off + (r() - 0.5) * 3, (y + 1) * bh - 1, r, 2);
    }
    // peeled patches exposing corrugation
    for (let i = 0; i < 4; i++) {
      const px = r() * (w - 90), py = r() * (h - 70), pw = 40 + r() * 50, ph = 25 + r() * 35;
      g.save();
      tornRect(g, px, py, pw, ph, r, 6, 6);
      g.fillStyle = '#e2c290';
      g.fill();
      g.clip();
      g.fillStyle = 'rgba(120,80,35,0.35)';
      for (let x = px; x < px + pw; x += 6) g.fillRect(x, py, 2.5, ph);
      g.restore();
      g.strokeStyle = 'rgba(90,55,25,0.5)';
      g.lineWidth = 1.5;
      tornRect(g, px, py, pw, ph, r, 6, 6);
      g.stroke();
    }
    fibres(g, w, h, seed + 9, 1400, 0.1, '60,35,10');
  }, { repeat: true });
}

/** Plain kraft cardboard with flutes (tops, ramps, planks). */
export function kraftTexture(seed = 4, base = '#d2a86e', planks = 0) {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 7) {
      g.fillStyle = `rgba(110,70,30,${0.05 + r() * 0.04})`;
      g.fillRect(0, y, w, 2.5);
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,240,210' : '90,55,20'},${r() * 0.08})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 10 + r() * 30, 6 + r() * 16, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    if (planks > 0) {
      g.strokeStyle = 'rgba(70,40,15,0.75)';
      g.lineWidth = 3;
      const s = w / planks;
      for (let i = 0; i <= planks; i++) wobbleLine(g, i * s + 1, -2, i * s + 1 + (r() - 0.5) * 3, h + 2, r, 2);
      // nail dots
      g.fillStyle = 'rgba(60,35,15,0.8)';
      for (let i = 0; i < planks; i++) for (const yy of [0.12, 0.88]) {
        g.beginPath(); g.arc(i * s + s / 2, yy * h, 3, 0, Math.PI * 2); g.fill();
      }
    }
    fibres(g, w, h, seed + 1, 700, 0.12, '60,35,10');
  }, { repeat: true });
}

/** Shipping box face: kraft, tape strip, stamps. UV 0..1 per face. */
export function boxTexture(seed = 8) {
  return markerTexture(256, 256, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = '#c8955a';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 7) {
      g.fillStyle = 'rgba(110,70,30,0.06)';
      g.fillRect(0, y, w, 2.5);
    }
    // edge shading
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,240,210,0.18)');
    grd.addColorStop(1, 'rgba(60,30,5,0.18)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // tape
    g.fillStyle = 'rgba(232,205,150,0.9)';
    g.fillRect(w * 0.42, 0, w * 0.16, h);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(w * 0.44, 0, w * 0.03, h);
    // stamp
    g.save();
    g.translate(w * 0.24, h * 0.72);
    g.rotate(-0.25);
    g.strokeStyle = 'rgba(200,40,30,0.8)';
    g.lineWidth = 3;
    g.strokeRect(-38, -14, 76, 28);
    g.fillStyle = 'rgba(200,40,30,0.85)';
    g.font = `20px ${MARKER}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('FRAGILE', 0, 1);
    g.restore();
    // this-side-up arrows
    g.strokeStyle = 'rgba(40,25,10,0.8)';
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (const ax of [w * 0.72, w * 0.84]) {
      wobbleLine(g, ax, h * 0.36, ax, h * 0.14, r, 1.5);
      wobbleLine(g, ax - 9, h * 0.22, ax, h * 0.13, r, 1);
      wobbleLine(g, ax + 9, h * 0.22, ax, h * 0.13, r, 1);
    }
    g.strokeStyle = 'rgba(60,30,10,0.55)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    fibres(g, w, h, seed + 3, 500, 0.12, '60,35,10');
  });
}

/** Cardboard "wooden" crate: planks + brace drawn in marker. UV 0..1 per face. */
export function crateTexture2(seed = 12) {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = '#c28a4c';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 42) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,230,190' : '90,50,15'},${0.08 + r() * 0.08})`;
      g.fillRect(0, y, w, 42);
    }
    g.strokeStyle = 'rgba(70,38,12,0.8)';
    g.lineWidth = 3;
    for (let y = 42; y < h; y += 42) wobbleLine(g, 0, y, w, y, r, 2);
    // frame + brace
    g.fillStyle = '#a8703a';
    const b = 26;
    g.fillRect(0, 0, w, b); g.fillRect(0, h - b, w, b); g.fillRect(0, 0, b, h); g.fillRect(w - b, 0, b, h);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-Math.PI / 4);
    g.fillRect(-w * 0.68, -b / 2, w * 1.36, b);
    g.strokeRect(-w * 0.68, -b / 2, w * 1.36, b);
    g.restore();
    g.strokeStyle = 'rgba(60,32,10,0.85)';
    g.lineWidth = 3.5;
    g.strokeRect(b, b, w - 2 * b, h - 2 * b);
    g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = 'rgba(50,30,10,0.9)';
    for (const [x, y] of [[13, 13], [w - 13, 13], [13, h - 13], [w - 13, h - 13]]) {
      g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
    }
    fibres(g, w, h, seed + 5, 600, 0.12, '60,35,10');
  });
}

/** Team banner (crown emblem). Drawn full-rect; geometry provides the swallow-tail cut. */
export function bannerTexture(color: string, dark: string) {
  return canvasTexture(128, 256, (g, w, h) => {
    const r = mulberry(color.length * 7 + 3);
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    fibres(g, w, h, 17, 500, 0.18, '20,10,40');
    g.strokeStyle = dark;
    g.lineWidth = 5;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.lineWidth = 2;
    wobbleLine(g, 18, 20, w - 18, 20, r, 2);
    drawCrown(g, w / 2, h * 0.4, 34, '#fff6e0', dark, 5);
    // hand-drawn doodle lines
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 3;
    wobbleLine(g, 26, h * 0.62, w - 26, h * 0.62, r, 3);
    wobbleLine(g, 34, h * 0.68, w - 34, h * 0.68, r, 3);
  });
}

/** Blue paper river with doodled ripples (tiles along x). */
export function riverTexture() {
  return canvasTexture(256, 128, (g, w, h) => {
    const r = mulberry(31);
    g.fillStyle = '#3f8fe0';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '10,40,120'},${r() * 0.12})`;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 20 + r() * 40, 5 + r() * 10, 0, 0, Math.PI * 2);
      g.fill();
    }
    fibres(g, w, h, 8, 600, 0.16, '10,30,90');
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x = r() * w, y = 10 + r() * (h - 20), l = 18 + r() * 30;
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x + l * 0.3, y - 6, x + l * 0.6, y + 6, x + l, y);
      g.stroke();
    }
  }, { repeat: true });
}

/** Layered paper bank edge (green lip over brown cardboard). */
export function bankTexture() {
  return canvasTexture(256, 64, (g, w, h) => {
    const r = mulberry(41);
    g.fillStyle = '#9b6a3a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8d6b0';
    tornRect(g, -5, h * 0.28, w + 10, h * 0.2, r, 5, 6);
    g.fill();
    g.fillStyle = '#6aa23c';
    tornRect(g, -5, -10, w + 10, h * 0.36 + 10, r, 5, 6);
    g.fill();
    fibres(g, w, h, 3, 300, 0.15);
  }, { repeat: true });
}

/**
 * Sign atlas: rows of cardboard signs with marker lettering.
 * Returns the texture and a function giving the UV rect of row i.
 */
export function signAtlas(lines: { text: string; color: string; bg?: string }[]) {
  const rows = lines.length;
  const W = 512, RH = 128;
  const tex = markerTexture(W, RH * rows, (g) => {
    lines.forEach((l, i) => {
      const r = mulberry(i * 13 + 5);
      const y = i * RH;
      g.fillStyle = l.bg ?? '#d9b27a';
      g.fillRect(0, y, W, RH);
      for (let k = 0; k < RH; k += 7) {
        g.fillStyle = 'rgba(110,70,30,0.06)';
        g.fillRect(0, y + k, W, 2.5);
      }
      g.strokeStyle = 'rgba(70,40,15,0.7)';
      g.lineWidth = 5;
      g.strokeRect(6, y + 6, W - 12, RH - 12);
      const parts = l.text.split('\n');
      g.fillStyle = l.color;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      let size = parts.length > 1 ? 44 : 60;
      g.font = `${size}px ${MARKER}`;
      while (Math.max(...parts.map((p) => g.measureText(p).width)) > W * 0.88 && size > 14) {
        size -= 3;
        g.font = `${size}px ${MARKER}`;
      }
      parts.forEach((p, k) => {
        g.save();
        g.translate(W / 2, y + RH / 2 + (k - (parts.length - 1) / 2) * size * 1.02);
        g.rotate((r() - 0.5) * 0.04);
        g.fillText(p, 0, 2);
        g.restore();
      });
      fibres(g, W, RH, i + 30, 250, 0.12, '60,35,10');
    });
  });
  const uv = (i: number) => ({ u0: 0, u1: 1, v0: 1 - (i + 1) / rows, v1: 1 - i / rows });
  return { tex, uv };
}

/** Crown doodle decal (transparent background). */
export function crownDecal(color: string) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-0.08);
    g.beginPath();
    const s = 92;
    g.moveTo(-s, s * 0.5);
    g.lineTo(-s, -s * 0.4);
    g.lineTo(-s * 0.5, s * 0.05);
    g.lineTo(0, -s * 0.7);
    g.lineTo(s * 0.5, s * 0.05);
    g.lineTo(s, -s * 0.4);
    g.lineTo(s, s * 0.5);
    g.closePath();
    g.strokeStyle = color;
    g.lineWidth = 13;
    g.stroke();
    g.beginPath();
    g.moveTo(-s * 0.9, s * 0.72);
    g.lineTo(s * 0.9, s * 0.72);
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.arc(0, s * 0.1, 11, 0, Math.PI * 2);
    g.fill();
    g.restore();
  });
}

/** Crumpled-paper shading map: creases and highlights (for rocks & clouds). */
export function crumpleTexture(seed = 51, base = '#f2efe8') {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const x = r() * w, y = r() * h, l = 20 + r() * 70, a = r() * Math.PI;
      g.strokeStyle = `rgba(60,55,50,${0.08 + r() * 0.14})`;
      g.lineWidth = 1 + r() * 1.5;
      g.beginPath();
      g.moveTo(x, y);
      let px = x, py = y;
      for (let k = 0; k < 3; k++) {
        px += Math.cos(a + (r() - 0.5) * 0.9) * l / 3;
        py += Math.sin(a + (r() - 0.5) * 0.9) * l / 3;
        g.lineTo(px, py);
      }
      g.stroke();
      g.strokeStyle = `rgba(255,255,255,${0.2 + r() * 0.3})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + 2, y + 2);
      g.lineTo(px + 2, py + 2);
      g.stroke();
    }
    fibres(g, w, h, seed + 2, 700, 0.14);
  }, { repeat: true });
}

/** Tube texture: kraft with a spiral seam. */
export function tubeTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = mulberry(61);
    g.fillStyle = '#b98449';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 6) {
      g.fillStyle = `rgba(90,50,15,${0.04 + r() * 0.04})`;
      g.fillRect(x, 0, 2, h);
    }
    g.strokeStyle = 'rgba(70,38,12,0.6)';
    g.lineWidth = 3;
    for (let k = -2; k < 3; k++) wobbleLine(g, -10, k * 110 + 20, w + 10, k * 110 + 20 + h * 0.5, r, 2);
    fibres(g, w, h, 63, 600, 0.12, '60,35,10');
  }, { repeat: true });
}

export function setUV(geo: THREE.BufferGeometry, fn: (u: number, v: number) => [number, number]) {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const [a, b] = fn(uv.getX(i), uv.getY(i));
    uv.setXY(i, a, b);
  }
  uv.needsUpdate = true;
  return geo;
}
