import * as THREE from 'three';
import { canvasTexture, type MaterialKit } from '../render/Materials';
import { boxGeo, type Batcher } from '../render/Batcher';
import { mulberry } from '../core/utils';
import type { BoxDef, RampDef } from '../world/Level';

/** Gradient sky sphere. */
export function skyDome(o: {
  top: number;
  horizon: number;
  bottom: number;
  sunColor?: number;
  sunDir?: [number, number, number];
  sunSize?: number;
  /** Retro sunset stripes on the sun (neon). */
  stripes?: boolean;
  radius?: number;
}) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(o.top) },
      horizon: { value: new THREE.Color(o.horizon) },
      bottom: { value: new THREE.Color(o.bottom) },
      sunColor: { value: new THREE.Color(o.sunColor ?? 0xffffff) },
      sunDir: { value: new THREE.Vector3(...(o.sunDir ?? [0.3, 0.5, -1])).normalize() },
      sunSize: { value: o.sunColor !== undefined ? (o.sunSize ?? 0.06) : 0 },
      stripes: { value: o.stripes ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
      uniform vec3 sunColor; uniform vec3 sunDir; uniform float sunSize; uniform float stripes;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 c = y > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.7, y), 0.8)) : mix(horizon, bottom, smoothstep(0.0, 0.25, -y));
        if (sunSize > 0.0) {
          float d = distance(normalize(vDir), sunDir);
          float disc = 1.0 - smoothstep(sunSize * 0.97, sunSize, d);
          if (stripes > 0.5) {
            float rel = (vDir.y - sunDir.y) / sunSize; // -1 bottom .. 1 top
            float band = step(0.5, fract(rel * 5.0 + 0.5 * rel * rel));
            disc *= rel > -0.1 ? 1.0 : band;
            vec3 sc = mix(vec3(1.0, 0.25, 0.6), sunColor, smoothstep(-1.0, 0.8, rel));
            c = mix(c, sc, disc);
          } else {
            c = mix(c, sunColor, disc);
          }
          c += sunColor * 0.25 * (1.0 - smoothstep(sunSize, sunSize * 4.0, d));
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(o.radius ?? 420, 32, 16), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/** Puffy cartoon cloud made from spheres. */
export function cloud(mats: MaterialKit, color = 0xffffff, seed = 1, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const r = mulberry(seed);
  const mat = mats.mat(color);
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const s = (1.6 + r() * 1.8) * scale;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 2), mat);
    m.position.set((i - n / 2) * 2.1 * scale + r(), r() * 1.2 * scale, (r() - 0.5) * 2 * scale);
    m.scale.y = 0.8;
    g.add(m);
  }
  return g;
}

/** Tiled floor texture. */
export function tileTexture(c1: string, c2: string, grout: string, tiles = 4, size = 512, jitter = 0.06, seed = 3) {
  return canvasTexture(size, size, (g, w, h) => {
    const r = mulberry(seed);
    const s = w / tiles;
    for (let y = 0; y < tiles; y++)
      for (let x = 0; x < tiles; x++) {
        g.fillStyle = (x + y) % 2 ? c1 : c2;
        g.fillRect(x * s, y * s, s, s);
        // subtle tone variation
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${r() * jitter})`;
        g.fillRect(x * s, y * s, s, s);
      }
    g.strokeStyle = grout;
    g.lineWidth = Math.max(2, s * 0.05);
    for (let i = 0; i <= tiles; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke();
    }
  }, { repeat: true });
}

/** Wooden crate texture with planks and a cross brace. */
export function crateTexture(base = '#c98a4b', dark = '#7a4a22', line = '#3b2412') {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = dark;
    g.lineWidth = 4;
    for (let y = 0; y < h; y += 42) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    g.fillStyle = dark;
    const b = 26;
    g.fillRect(0, 0, w, b); g.fillRect(0, h - b, w, b); g.fillRect(0, 0, b, h); g.fillRect(w - b, 0, b, h);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI / 4);
    g.fillRect(-w * 0.72, -b / 2, w * 1.44, b);
    g.restore();
    g.strokeStyle = line;
    g.lineWidth = 5;
    g.strokeRect(2.5, 2.5, w - 5, h - 5);
  });
}

/** Striped awning texture. */
export function stripeTexture(a: string, b: string, stripes = 6, vertical = true) {
  return canvasTexture(128, 128, (g, w, h) => {
    const s = (vertical ? w : h) / stripes;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? a : b;
      if (vertical) g.fillRect(i * s, 0, s, h);
      else g.fillRect(0, i * s, w, s);
    }
  }, { repeat: true });
}

/** Facade with windows. */
export function facadeTexture(wall: string, win: string, frame: string, cols = 3, rows = 2, seed = 5, trim?: string) {
  return canvasTexture(256, 256, (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 6 + r() * 20, 4 + r() * 10);
    }
    const cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const wx = x * cw + cw * 0.25, wy = y * ch + ch * 0.22, ww = cw * 0.5, wh = ch * 0.56;
        g.fillStyle = frame;
        g.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
        g.fillStyle = win;
        g.beginPath();
        g.moveTo(wx, wy + wh);
        g.lineTo(wx, wy + ww / 2);
        g.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
        g.lineTo(wx + ww, wy + wh);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(wx + ww * 0.15, wy + ww * 0.4, ww * 0.12, wh * 0.4);
        g.fillStyle = frame;
        g.fillRect(wx + ww / 2 - 2, wy + ww * 0.2, 4, wh - ww * 0.2);
      }
    if (trim) {
      g.fillStyle = trim;
      g.fillRect(0, 0, w, 10);
    }
  }, { repeat: true });
}

/** Palm tree built into a batcher. */
export function palmTree(batch: Batcher, mats: MaterialKit, x: number, y: number, z: number, h = 6, seed = 1, trunkColor = 0xa0703c, leafColor = 0x3cb44a) {
  const r = mulberry(seed);
  const trunk = mats.mat(trunkColor);
  const leaf = mats.mat(leafColor, { side: THREE.DoubleSide });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const segs = 6;
  let px = x, pz = z;
  const lean = (r() - 0.5) * 0.12, leanZ = (r() - 0.5) * 0.12;
  for (let i = 0; i < segs; i++) {
    const g = new THREE.CylinderGeometry(0.22 - i * 0.012, 0.28 - i * 0.012, h / segs + 0.05, 7);
    px += lean * (h / segs);
    pz += leanZ * (h / segs);
    m.compose(new THREE.Vector3(px, y + (i + 0.5) * (h / segs), pz), q.identity(), new THREE.Vector3(1, 1, 1));
    batch.add(g, trunk, m);
  }
  const topY = y + h;
  const leafGeo = new THREE.ConeGeometry(0.6, 3.4, 4, 1, true);
  leafGeo.rotateZ(-Math.PI / 2);
  leafGeo.translate(1.7, 0, 0);
  leafGeo.scale(1, 0.25, 1);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r();
    const e = new THREE.Euler(0, a, -0.35 - r() * 0.3);
    m.compose(new THREE.Vector3(px, topY, pz), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
    batch.add(leafGeo, leaf, m);
  }
  const coco = new THREE.IcosahedronGeometry(0.22, 1);
  for (let i = 0; i < 3; i++) {
    m.makeTranslation(px + Math.cos(i * 2.1) * 0.25, topY - 0.25, pz + Math.sin(i * 2.1) * 0.25);
    batch.add(coco, mats.mat(0x6b4423), m);
  }
}

/** Pine / fir tree (stacked cones). */
export function pineTree(batch: Batcher, mats: MaterialKit, x: number, y: number, z: number, h = 7, color = 0x2f8f3a, trunkColor = 0x7a5230, sides = 7) {
  const m = new THREE.Matrix4();
  batch.add(new THREE.CylinderGeometry(0.25, 0.35, h * 0.3, 6), mats.mat(trunkColor), m.makeTranslation(x, y + h * 0.15, z));
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const rad = (1.9 - i * 0.45) * (h / 7);
    const ch = h * 0.42;
    const g = new THREE.ConeGeometry(rad, ch, sides);
    batch.add(g, mats.mat(color), m.makeTranslation(x, y + h * 0.3 + i * h * 0.2 + ch / 2, z));
  }
}

/** String of triangular bunting flags between two points (visual only). */
export function bunting(scene: THREE.Object3D, mats: MaterialKit, a: THREE.Vector3, b: THREE.Vector3, colors: number[], sag = 1.2, count = 14, batch?: Batcher) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.03, 4), mats.mat(0x333333));
  if (batch) batch.addMesh(line);
  else scene.add(line);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.3, 0, 0, 0.3, 0, 0, 0, -0.6, 0], 3));
  tri.computeVertexNormals();
  const dir = b.clone().sub(a).normalize();
  const yaw = Math.atan2(dir.x, dir.z) - Math.PI / 2;
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const p = curve.getPoint(t);
    const f = new THREE.Mesh(tri, mats.mat(colors[i % colors.length], { side: THREE.DoubleSide }));
    f.position.copy(p);
    f.rotation.y = -yaw;
    if (batch) batch.addMesh(f);
    else scene.add(f);
  }
}

/** Visual for a plain level box using a material. */
export function boxVisual(batch: Batcher, mat: THREE.Material, b: BoxDef, inset = 0) {
  const sx = b.max[0] - b.min[0] - inset * 2, sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2] - inset * 2;
  batch.box(mat, (b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2, sx, sy, sz);
}

/** Wedge geometry for a ramp. */
export function rampGeometry(r: RampDef): THREE.BufferGeometry {
  const x0 = r.min[0], x1 = r.max[0], z0 = r.min[2], z1 = r.max[2], y0 = r.min[1];
  const hAt = (x: number, z: number) => {
    const a = r.axis === 'x' ? x : z;
    const lo = r.axis === 'x' ? x0 : z0, hi = r.axis === 'x' ? x1 : z1;
    let t = (a - lo) / (hi - lo);
    if (r.dir === -1) t = 1 - t;
    return r.h0 + (r.h1 - r.h0) * t;
  };
  const top = [
    new THREE.Vector3(x0, hAt(x0, z0), z0), new THREE.Vector3(x1, hAt(x1, z0), z0),
    new THREE.Vector3(x1, hAt(x1, z1), z1), new THREE.Vector3(x0, hAt(x0, z1), z1),
  ];
  const bot = [new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y0, z0), new THREE.Vector3(x1, y0, z1), new THREE.Vector3(x0, y0, z1)];
  const pos: number[] = [];
  const uv: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    for (const v of [a, b, c, a, c, d]) pos.push(v.x, v.y, v.z);
    const w = a.distanceTo(b) * 0.25, h = b.distanceTo(c) * 0.25;
    uv.push(0, 0, w, 0, w, h, 0, 0, w, h, 0, h);
  };
  quad(top[3], top[2], top[1], top[0]); // top (ccw from above)
  quad(bot[0], bot[1], top[1], top[0]); // -z side
  quad(bot[2], bot[3], top[3], top[2]); // +z side
  quad(bot[3], bot[0], top[0], top[3]); // -x side
  quad(bot[1], bot[2], top[2], top[1]); // +x side
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Rounded box geometry (cartoon chunky look). */
export function roundedBox(w: number, h: number, d: number, r: number, seg = 2) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2 + 1, seg * 2 + 1, seg * 2 + 1);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const c = new THREE.Vector3(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    const n = v.clone().sub(c);
    if (n.lengthSq() > 1e-9) n.normalize().multiplyScalar(r);
    pos.setXYZ(i, c.x + n.x, c.y + n.y, c.z + n.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A flat sign/poster plane with a texture, facing +Z by default. */
export function sign(tex: THREE.Texture, w: number, h: number, mats: MaterialKit, unlit = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.mat(0xffffff, { map: tex, unlit, side: THREE.DoubleSide }));
  return m;
}

export { boxGeo };
