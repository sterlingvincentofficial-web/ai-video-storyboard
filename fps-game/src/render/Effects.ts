import * as THREE from 'three';
import { canvasTexture } from './Materials';
import type { ImpactStyle } from '../worlds/types';
import { rand, mulberry } from '../core/utils';

const MAX_P = 700;
const MAX_DECALS = 220;

interface P {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  s0: number; s1: number;
  g: number; drag: number;
  r: number; gc: number; b: number;
  spin: number; rot: number;
  flat: number;
}

class ParticleLayer {
  mesh: THREE.InstancedMesh;
  ps: P[] = [];
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private p = new THREE.Vector3();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, n = MAX_P) {
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color());
    parent.add(this.mesh);
    for (let i = 0; i < n; i++)
      this.ps.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 0, g: 0, drag: 0, r: 1, gc: 1, b: 1, spin: 0, rot: 0, flat: 0 });
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, color: number, g = 0, drag = 0, flat = 0) {
    const p = this.ps[this.next];
    this.next = (this.next + 1) % this.ps.length;
    p.alive = true;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.max = life; p.s0 = s0; p.s1 = s1; p.g = g; p.drag = drag;
    this.c.setHex(color);
    p.r = this.c.r; p.gc = this.c.g; p.b = this.c.b;
    p.spin = rand(-8, 8); p.rot = rand(0, 6);
    p.flat = flat;
  }

  update(dt: number, floorY = -999) {
    let n = 0;
    for (const p of this.ps) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k - p.g * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < floorY) { p.y = floorY; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      p.rot += p.spin * dt;
      const t = 1 - p.life / p.max;
      const sc = p.s0 + (p.s1 - p.s0) * t;
      this.e.set(p.rot, p.rot * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.s.set(sc, p.flat ? sc * 0.15 : sc, sc);
      this.m.compose(this.p.set(p.x, p.y, p.z), this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.c.setRGB(p.r, p.gc, p.b);
      this.mesh.setColorAt(n, this.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const p of this.ps) p.alive = false;
    this.mesh.count = 0;
  }
}

interface Tracer { mesh: THREE.Mesh; life: number; max: number; w: number }
interface Pop { spr: THREE.Sprite; life: number; max: number; base: number; vy: number }
interface Ring { mesh: THREE.Mesh; life: number; max: number; size: number }

function splatTexture(kind: ImpactStyle) {
  return canvasTexture(128, 128, (g, w, h) => {
    const r = mulberry(kind.length * 17 + 3);
    g.translate(w / 2, h / 2);
    g.fillStyle = '#fff';
    if (kind === 'laser') {
      const grad = g.createRadialGradient(0, 0, 2, 0, 0, 60);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(-64, -64, 128, 128);
      return;
    }
    if (kind === 'paper') {
      g.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const rr = 20 + r() * 16;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      return;
    }
    // blob splat
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 11; i++) {
      const a = r() * Math.PI * 2;
      const d = 26 + r() * 22;
      g.beginPath();
      g.arc(Math.cos(a) * d, Math.sin(a) * d, 4 + r() * 9, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a - 0.15) * d, Math.sin(a - 0.15) * d);
      g.lineTo(Math.cos(a + 0.15) * d, Math.sin(a + 0.15) * d);
      g.fill();
    }
  });
}

const popCache = new Map<string, THREE.Texture>();
export function popTexture(word: string, fill = '#ffe12b', text = '#ff2d2d') {
  const key = word + fill + text;
  let t = popCache.get(key);
  if (t) return t;
  t = canvasTexture(256, 160, (g, w, h) => {
    g.translate(w / 2, h / 2);
    g.beginPath();
    const spikes = 14;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = i % 2 ? 50 : 76;
      g.lineTo(Math.cos(a) * rr * 1.5, Math.sin(a) * rr * 0.95);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#111';
    g.stroke();
    g.font = '900 54px "Bangers", "Luckiest Guy", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.lineJoin = 'round';
    g.strokeStyle = '#111';
    g.rotate(-0.08);
    g.strokeText(word, 0, 4);
    g.fillStyle = text;
    g.fillText(word, 0, 4);
  }, { mip: false });
  popCache.set(key, t);
  return t;
}

/** All transient visual effects: particles, tracers, decals, text pops, explosion rings. */
export class Effects {
  group = new THREE.Group();
  solid: ParticleLayer;
  glow: ParticleLayer;
  confetti: ParticleLayer;
  private tracers: Tracer[] = [];
  private tIdx = 0;
  private pops: Pop[] = [];
  private pIdx = 0;
  private rings: Ring[] = [];
  private rIdx = 0;
  private decals: THREE.InstancedMesh;
  private dIdx = 0;
  private dCount = 0;
  private darts: THREE.InstancedMesh | null = null;
  private dartIdx = 0;
  private dartCount = 0;
  light: THREE.PointLight;
  private lightT = 0;
  private shots: THREE.InstancedMesh;
  private shotData: { fx: number; fy: number; fz: number; tx: number; ty: number; tz: number; t: number; dur: number; r: number; g: number; b: number; len: number }[] = [];
  private shotIdx = 0;
  impact: ImpactStyle = 'paint';
  hitWords: string[] = ['POW!'];

  constructor(scene: THREE.Object3D, solidMat: THREE.Material, impact: ImpactStyle, hitWords: string[]) {
    this.impact = impact;
    this.hitWords = hitWords;
    scene.add(this.group);
    this.solid = new ParticleLayer(new THREE.IcosahedronGeometry(0.5, 0), solidMat, this.group);
    this.glow = new ParticleLayer(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }), this.group, 400);
    this.confetti = new ParticleLayer(new THREE.PlaneGeometry(1, 0.6), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), this.group, 400);

    const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    tracerGeo.translate(0, 0.5, 0);
    tracerGeo.rotateX(Math.PI / 2); // along +Z from origin
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 1, w: 0.03 });
    }
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false }));
      s.visible = false;
      s.renderOrder = 20;
      this.group.add(s);
      this.pops.push({ spr: s, life: 0, max: 1, base: 1, vy: 0 });
    }
    const ringGeo = new THREE.RingGeometry(0.8, 1, 32);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.visible = false;
      this.group.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, size: 1 });
    }
    const dmat = new THREE.MeshBasicMaterial({
      map: splatTexture(impact), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      blending: impact === 'laser' ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dmat, MAX_DECALS);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.setColorAt(0, new THREE.Color());
    this.group.add(this.decals);
    if (impact === 'dart') {
      const g = new THREE.CylinderGeometry(0.045, 0.045, 0.34, 6);
      g.translate(0, 0.17, 0);
      const tip = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8);
      tip.translate(0, 0.02, 0);
      const merged = new THREE.BufferGeometry();
      // simple: use body only, tip via colour — keep it cheap
      merged.copy(g);
      this.darts = new THREE.InstancedMesh(merged, solidMat, 120);
      this.darts.count = 0;
      this.darts.setColorAt(0, new THREE.Color());
      this.group.add(this.darts);
    }
    this.light = new THREE.PointLight(0xffaa55, 0, 18, 2);
    this.group.add(this.light);

    // visible "bullets" for hitscan weapons, styled per world
    let sg: THREE.BufferGeometry;
    let smat: THREE.Material = solidMat;
    switch (impact) {
      case 'dart': sg = new THREE.CapsuleGeometry(0.06, 0.3, 3, 6); break;
      case 'paper': sg = new THREE.IcosahedronGeometry(0.13, 0); break;
      case 'paint': sg = new THREE.SphereGeometry(0.11, 8, 6); break;
      case 'ink': sg = new THREE.CapsuleGeometry(0.035, 0.7, 2, 5); smat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }); break;
      case 'laser': default: sg = new THREE.CapsuleGeometry(0.03, 0.9, 2, 5); smat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }); break;
    }
    sg.rotateX(Math.PI / 2); // long axis along Z
    this.shots = new THREE.InstancedMesh(sg, smat, 64);
    this.shots.count = 0;
    this.shots.frustumCulled = false;
    this.shots.setColorAt(0, new THREE.Color());
    this.group.add(this.shots);
    for (let i = 0; i < 64; i++) this.shotData.push({ fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, t: 1, dur: 1, r: 1, g: 1, b: 1, len: 1 });
  }

  /** A visible projectile flying from a to b (purely cosmetic; hitscan already resolved). */
  shot(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const d = this.shotData[this.shotIdx];
    this.shotIdx = (this.shotIdx + 1) % this.shotData.length;
    d.fx = from.x; d.fy = from.y; d.fz = from.z;
    d.tx = to.x; d.ty = to.y; d.tz = to.z;
    const dist = from.distanceTo(to);
    const speed = this.impact === 'laser' || this.impact === 'ink' ? 260 : 150;
    d.dur = Math.max(0.03, dist / speed);
    d.t = 0;
    this._c.setHex(color);
    if (this.impact === 'laser' || this.impact === 'ink') this._c.multiplyScalar(1.6);
    d.r = this._c.r; d.g = this._c.g; d.b = this._c.b;
    d.len = dist;
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: number, width = 0.03, life = 0.09) {
    const t = this.tracers[this.tIdx];
    this.tIdx = (this.tIdx + 1) % this.tracers.length;
    const len = from.distanceTo(to);
    if (len < 0.1) return;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.w = width;
    t.mesh.scale.set(width, width, len);
    (t.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (t.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    t.mesh.visible = true;
    t.life = t.max = life;
  }

  private _q = new THREE.Quaternion();
  private _m = new THREE.Matrix4();
  private _v = new THREE.Vector3();
  private _s = new THREE.Vector3();
  private _c = new THREE.Color();
  private _z = new THREE.Vector3(0, 0, 1);
  private _y = new THREE.Vector3(0, 1, 0);

  decal(point: THREE.Vector3, normal: THREE.Vector3, color: number, size: number) {
    if (this.impact === 'dart' && this.darts) {
      // foam dart stuck in the surface
      this._q.setFromUnitVectors(this._y, this._v.copy(normal).multiplyScalar(-1).add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3))).normalize().negate());
      this._m.compose(this._v.copy(point), this._q, this._s.set(1, 1, 1));
      this.darts.setMatrixAt(this.dartIdx, this._m);
      this.darts.setColorAt(this.dartIdx, this._c.setHex(color));
      this.dartIdx = (this.dartIdx + 1) % 120;
      this.dartCount = Math.min(120, this.dartCount + 1);
      this.darts.count = this.dartCount;
      this.darts.instanceMatrix.needsUpdate = true;
      if (this.darts.instanceColor) this.darts.instanceColor.needsUpdate = true;
      return;
    }
    this._q.setFromUnitVectors(this._z, normal);
    const roll = new THREE.Quaternion().setFromAxisAngle(normal, Math.random() * Math.PI * 2);
    this._q.premultiply(roll);
    this._m.compose(this._v.copy(point).addScaledVector(normal, 0.015 + Math.random() * 0.01), this._q, this._s.set(size, size, size));
    this.decals.setMatrixAt(this.dIdx, this._m);
    this.decals.setColorAt(this.dIdx, this._c.setHex(color));
    this.dIdx = (this.dIdx + 1) % MAX_DECALS;
    this.dCount = Math.min(MAX_DECALS, this.dCount + 1);
    this.decals.count = this.dCount;
    this.decals.instanceMatrix.needsUpdate = true;
    if (this.decals.instanceColor) this.decals.instanceColor.needsUpdate = true;
  }

  /** Bullet hitting world geometry. */
  impactWorld(point: THREE.Vector3, normal: THREE.Vector3, color: number, big = false) {
    const n = big ? 10 : 5;
    switch (this.impact) {
      case 'paint':
        this.decal(point, normal, color, big ? 2.2 : rand(0.6, 1.1));
        for (let i = 0; i < n; i++) this.solid.spawn(point.x, point.y, point.z, normal.x * 3 + rand(-2.5, 2.5), normal.y * 3 + rand(0, 3.5), normal.z * 3 + rand(-2.5, 2.5), rand(0.3, 0.6), rand(0.1, 0.18), 0.02, color, 14, 1);
        break;
      case 'ink':
        this.decal(point, normal, 0x111111, big ? 2 : rand(0.4, 0.8));
        for (let i = 0; i < n; i++) this.glow.spawn(point.x, point.y, point.z, normal.x * 4 + rand(-3, 3), normal.y * 4 + rand(-1, 4), normal.z * 4 + rand(-3, 3), rand(0.15, 0.3), 0.12, 0, i % 2 ? 0xffe12b : 0xffffff, 10, 2);
        break;
      case 'paper':
        this.decal(point, normal, 0x3a2a1a, big ? 1.4 : rand(0.25, 0.4));
        for (let i = 0; i < n; i++) this.confetti.spawn(point.x, point.y, point.z, normal.x * 3 + rand(-2, 2), normal.y * 3 + rand(0, 3), normal.z * 3 + rand(-2, 2), rand(0.6, 1.1), 0.18, 0.12, i % 2 ? 0xf4ecd8 : color, 7, 2);
        break;
      case 'dart':
        this.decal(point, normal, color, 1);
        for (let i = 0; i < 3; i++) this.solid.spawn(point.x, point.y, point.z, rand(-1, 1), rand(0, 2), rand(-1, 1), 0.3, 0.12, 0.02, 0xffffff, 3, 2);
        break;
      case 'laser':
        this.decal(point, normal, color, big ? 2 : rand(0.4, 0.7));
        for (let i = 0; i < n + 2; i++) this.glow.spawn(point.x, point.y, point.z, normal.x * 5 + rand(-4, 4), normal.y * 5 + rand(-2, 5), normal.z * 5 + rand(-4, 4), rand(0.15, 0.35), 0.08, 0, color, 12, 3);
        break;
    }
  }

  /** Bullet hitting a character. */
  impactActor(point: THREE.Vector3, color: number, head: boolean) {
    const n = head ? 12 : 6;
    for (let i = 0; i < n; i++) {
      if (this.impact === 'laser' || this.impact === 'ink')
        this.glow.spawn(point.x, point.y, point.z, rand(-4, 4), rand(-1, 5), rand(-4, 4), rand(0.15, 0.35), 0.11, 0, i % 3 ? color : 0xffffff, 10, 3);
      else if (this.impact === 'paper')
        this.confetti.spawn(point.x, point.y, point.z, rand(-3, 3), rand(0, 4), rand(-3, 3), rand(0.5, 0.9), 0.15, 0.1, i % 2 ? color : 0xffffff, 7, 2);
      else this.solid.spawn(point.x, point.y, point.z, rand(-3.5, 3.5), rand(0, 4.5), rand(-3.5, 3.5), rand(0.3, 0.55), rand(0.09, 0.17), 0.02, color, 14, 1);
    }
    if (head) for (let i = 0; i < 5; i++) this.glow.spawn(point.x, point.y + 0.2, point.z, rand(-2, 2), rand(2, 4), rand(-2, 2), 0.6, 0.18, 0.05, 0xffee44, 4, 2);
  }

  muzzle(p: THREE.Vector3, color: number) {
    for (let i = 0; i < 2; i++) this.glow.spawn(p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.06, 0.18, 0.05, color, 0, 0);
  }

  explosion(p: THREE.Vector3, color: number, radius: number) {
    const puff = this.impact === 'laser' ? 0x3a2a5a : this.impact === 'ink' ? 0xffffff : this.impact === 'paper' ? 0xf1e7d0 : 0xffffff;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9;
      const sp = rand(2, 6);
      this.solid.spawn(p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1, Math.sin(a) * Math.cos(e) * sp, rand(0.45, 0.8), rand(0.6, 1.1) * radius * 0.35, rand(1.2, 1.6) * radius * 0.35, i % 4 === 0 ? color : puff, -1.5, 3);
    }
    for (let i = 0; i < 18; i++) this.glow.spawn(p.x, p.y, p.z, rand(-10, 10), rand(-2, 12), rand(-10, 10), rand(0.25, 0.6), 0.22, 0.02, i % 2 ? 0xffe066 : color, 14, 1.5);
    if (this.impact === 'paper') for (let i = 0; i < 20; i++) this.confetti.spawn(p.x, p.y, p.z, rand(-7, 7), rand(2, 10), rand(-7, 7), rand(0.8, 1.6), 0.28, 0.2, i % 3 ? 0xf4ecd8 : color, 8, 1.5);
    this.ring(p, color, radius * 1.3);
    this.light.position.copy(p);
    this.light.color.setHex(color);
    this.light.intensity = 60;
    this.lightT = 0.2;
    this.pop(p.clone().add(new THREE.Vector3(0, 0.8, 0)), this.impact === 'ink' ? 'KABOOM!' : 'BOOM!', 2.2);
  }

  ring(p: THREE.Vector3, color: number, size: number) {
    const r = this.rings[this.rIdx];
    this.rIdx = (this.rIdx + 1) % this.rings.length;
    r.mesh.position.set(p.x, p.y + 0.1, p.z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    r.mesh.visible = true;
    r.life = r.max = 0.35;
    r.size = size;
  }

  /** Cartoon death poof: smoke puffs, stars and confetti. */
  poof(p: THREE.Vector3, teamColor: number) {
    const smoke = this.impact === 'laser' ? 0x7755aa : 0xffffff;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.solid.spawn(p.x + Math.cos(a) * 0.3, p.y + rand(0.3, 1.4), p.z + Math.sin(a) * 0.3, Math.cos(a) * rand(1.5, 3), rand(0.5, 2), Math.sin(a) * rand(1.5, 3), rand(0.5, 0.8), rand(0.35, 0.5), rand(0.7, 0.9), smoke, -0.5, 3.5);
    }
    for (let i = 0; i < 26; i++) this.confetti.spawn(p.x, p.y + 1.2, p.z, rand(-4, 4), rand(3, 8), rand(-4, 4), rand(1, 1.8), 0.16, 0.12, [teamColor, 0xffe066, 0xffffff, 0xff66cc][i % 4], 9, 1.2);
    for (let i = 0; i < 6; i++) this.glow.spawn(p.x, p.y + 1.6, p.z, rand(-1.5, 1.5), rand(2, 4), rand(-1.5, 1.5), 0.9, 0.22, 0.1, 0xffe066, 3, 1.5);
  }

  /** Floating comic word (POW!). */
  pop(p: THREE.Vector3, word?: string, scale = 1.3, fill?: string, text?: string) {
    const w = word ?? this.hitWords[Math.floor(Math.random() * this.hitWords.length)];
    const pp = this.pops[this.pIdx];
    this.pIdx = (this.pIdx + 1) % this.pops.length;
    const mat = pp.spr.material as THREE.SpriteMaterial;
    mat.map = popTexture(w, fill, text);
    mat.opacity = 1;
    mat.rotation = rand(-0.25, 0.25);
    mat.needsUpdate = true;
    pp.spr.position.copy(p);
    pp.base = scale;
    pp.spr.visible = true;
    pp.life = pp.max = 0.75;
    pp.vy = 1.2;
  }

  /** Pickup sparkle. */
  sparkle(p: THREE.Vector3, color: number) {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.glow.spawn(p.x, p.y + 0.6, p.z, Math.cos(a) * 3, rand(1, 4), Math.sin(a) * 3, 0.5, 0.15, 0.02, color, 4, 2);
    }
  }

  /** Jump pad whoosh / double jump puff. */
  puff(p: THREE.Vector3, n = 6, color = 0xffffff) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.solid.spawn(p.x + Math.cos(a) * 0.3, p.y + 0.1, p.z + Math.sin(a) * 0.3, Math.cos(a) * 2, 0.3, Math.sin(a) * 2, 0.35, 0.22, 0.05, color, 0, 3);
    }
  }

  trail(p: THREE.Vector3, color: number) {
    this.solid.spawn(p.x, p.y, p.z, rand(-0.3, 0.3), rand(0, 0.5), rand(-0.3, 0.3), 0.4, 0.18, 0.02, color, -0.5, 1);
  }

  private updateShots(dt: number) {
    let n = 0;
    for (const d of this.shotData) {
      if (d.t >= d.dur) continue;
      d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      this._v.set(d.fx + (d.tx - d.fx) * k, d.fy + (d.ty - d.fy) * k, d.fz + (d.tz - d.fz) * k);
      this._m.lookAt(this._v, this._s.set(d.tx, d.ty, d.tz), this._y);
      this._q.setFromRotationMatrix(this._m);
      // lookAt makes -Z face the target; our geometry is symmetric so that's fine
      const stretch = this.impact === 'paint' ? 1.6 : this.impact === 'paper' ? 1 : 1;
      this._m.compose(this._v, this._q, this._s.set(1, 1, stretch));
      this.shots.setMatrixAt(n, this._m);
      this.shots.setColorAt(n, this._c.setRGB(d.r, d.g, d.b));
      n++;
    }
    this.shots.count = n;
    this.shots.instanceMatrix.needsUpdate = true;
    if (this.shots.instanceColor) this.shots.instanceColor.needsUpdate = true;
  }

  update(dt: number, camera: THREE.Camera) {
    this.updateShots(dt);
    this.solid.update(dt);
    this.glow.update(dt);
    this.confetti.update(dt);
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      const k = t.life / t.max;
      t.mesh.scale.x = t.mesh.scale.y = t.w * k;
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = k;
    }
    for (const p of this.pops) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.spr.visible = false; continue; }
      const t = 1 - p.life / p.max;
      const s = p.base * (t < 0.15 ? t / 0.15 * 1.25 : t < 0.3 ? 1.25 - (t - 0.15) / 0.15 * 0.25 : 1);
      // keep roughly constant screen size
      const d = camera.position.distanceTo(p.spr.position);
      const k = Math.max(0.6, d * 0.12);
      p.spr.scale.set(s * k, s * k * 0.625, 1);
      p.spr.position.y += p.vy * dt;
      (p.spr.material as THREE.SpriteMaterial).opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const t = 1 - r.life / r.max;
      r.mesh.scale.setScalar(r.size * (0.3 + t));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    }
    if (this.lightT > 0) {
      this.lightT -= dt;
      this.light.intensity = Math.max(0, this.lightT / 0.2) * 60;
    }
  }

  clear() {
    this.solid.clear();
    this.glow.clear();
    this.confetti.clear();
    this.dCount = 0;
    this.decals.count = 0;
    this.dartCount = 0;
    if (this.darts) this.darts.count = 0;
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
    for (const d of this.shotData) d.t = d.dur;
    this.shots.count = 0;
    for (const p of this.pops) { p.life = 0; p.spr.visible = false; }
  }
}
