import * as THREE from 'three';
import type { MaterialKit } from './Materials';
import type { WeaponId } from '../entities/Weapons';
import { roundedBox } from '../worlds/common';
import { flashTexture } from './Character';
import { damp } from '../core/utils';
import { consolidate } from './merge';

function accent0(v: ViewModel) {
  return v.accentColor;
}

/**
 * First-person weapon. Built at natural scale in camera space, then the whole rig is
 * scaled down toward the eye so it never clips into walls (identical on-screen image).
 */
const SCALE = 0.32;

export interface VMState {
  dt: number;
  speed: number;
  onGround: boolean;
  sprint: boolean;
  aiming: boolean;
  reloading: number; // 0..1 progress, 0 = not
  switching: number; // 0..1 (1 = fully lowered)
  lookDX: number;
  lookDY: number;
  vy: number;
}

export class ViewModel {
  root = new THREE.Group();
  private sway = new THREE.Group();
  private kick = new THREE.Group();
  private guns = new Map<WeaponId, THREE.Group>();
  private muzzles = new Map<WeaponId, THREE.Object3D>();
  private spinners = new Map<WeaponId, THREE.Object3D>();
  private flash: THREE.Sprite;
  private flashT = 0;
  current: WeaponId = 'blaster';
  private recoil = 0;
  private recoilRot = 0;
  private bobT = 0;
  private swayX = 0;
  private swayY = 0;
  private aimT = 0;
  private landT = 0;
  private sprintT = 0;
  private hands: THREE.Material;
  private vmMat: THREE.Material;
  private sleeve: THREE.Material;

  accentColor: number;
  constructor(private mats: MaterialKit, body: number, accent: number, dark: number, glove: number, sleeve: number, glowColor: number) {
    this.accentColor = accent;
    this.root.scale.setScalar(SCALE);
    this.root.add(this.sway);
    this.sway.add(this.kick);
    const ph = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    this.hands = ph(glove);
    this.sleeve = ph(sleeve);
    this.vmMat = mats.mat(0xffffff, { vertexColors: true });
    const B = ph(body), A = ph(accent), D = ph(dark), G = mats.glow(glowColor, 1.6);
    this.build('blaster', B, A, D, G);
    this.build('scatter', B, A, D, G);
    this.build('boomer', B, A, D, G);
    this.build('zapper', B, A, D, G);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.flash.visible = false;
    this.flash.scale.setScalar(0.5);
    this.show('blaster');
    this.root.traverse((o) => {
      o.frustumCulled = false;
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; }
    });
  }

  private hand(parent: THREE.Object3D, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sleeve = true) {
    const h = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), this.hands);
    palm.scale.set(1, 0.8, 1.2);
    h.add(palm);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.06, 3, 6), this.hands);
      f.position.set(-0.05 + i * 0.045, -0.02, -0.07);
      f.rotation.x = Math.PI / 2 + 0.6;
      h.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.05, 3, 6), this.hands);
    thumb.position.set(0.07, 0.04, -0.03);
    thumb.rotation.z = -0.9;
    h.add(thumb);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.06, 12), this.hands);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = 0.1;
    h.add(cuff);
    if (sleeve) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.6, 10), this.sleeve);
      arm.rotation.x = Math.PI / 2;
      arm.position.z = 0.42;
      h.add(arm);
    }
    h.position.set(x, y, z);
    h.rotation.set(rx, ry, rz);
    parent.add(h);
    return h;
  }

  private build(id: WeaponId, B: THREE.Material, A: THREE.Material, D: THREE.Material, G: THREE.Material) {
    const g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      g.add(mesh);
      return mesh;
    };
    const muzzle = new THREE.Object3D();
    switch (id) {
      case 'blaster': {
        add(roundedBox(0.2, 0.22, 0.62, 0.07, 2), B, 0, 0, 0);
        add(roundedBox(0.16, 0.08, 0.5, 0.03, 1), A, 0, 0.14, -0.02);
        add(new THREE.CylinderGeometry(0.06, 0.07, 0.34, 12), D, 0, 0.02, -0.44, Math.PI / 2);
        add(new THREE.TorusGeometry(0.075, 0.022, 6, 14), A, 0, 0.02, -0.6);
        add(roundedBox(0.09, 0.22, 0.12, 0.03, 1), D, 0, -0.17, 0.12, -0.25);
        add(roundedBox(0.1, 0.16, 0.1, 0.03, 1), D, 0, -0.15, -0.14);
        // glowing ammo cells
        for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.035, 8, 6), G, 0.105, 0.03, -0.12 + i * 0.1);
        const tank = add(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 12), this.mats.mat(accent0(this)), 0, 0.1, 0.24, 0, 0, Math.PI / 2);
        tank.userData.keep = true;
        this.spinners.set(id, tank);
        add(new THREE.BoxGeometry(0.04, 0.06, 0.04), D, 0, 0.21, -0.2);
        muzzle.position.set(0, 0.02, -0.66);
        this.hand(g, 0.02, -0.16, 0.14, 0.2, 0, 0.1);
        this.hand(g, -0.05, -0.12, -0.18, 0.1, 0.3, -0.4);
        g.position.set(0.33, -0.33, -0.84);
        break;
      }
      case 'scatter': {
        add(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 14), B, 0, 0, -0.1, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.18, 0.1, 0.18, 14), A, 0, 0, -0.52, Math.PI / 2);
        add(new THREE.TorusGeometry(0.17, 0.03, 6, 16), D, 0, 0, -0.61);
        add(roundedBox(0.18, 0.2, 0.3, 0.06, 1), D, 0, -0.03, 0.3);
        add(roundedBox(0.1, 0.24, 0.12, 0.03, 1), D, 0, -0.2, 0.2, -0.3);
        add(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), A, 0, 0.14, -0.1, Math.PI / 2);
        const pump = add(roundedBox(0.16, 0.12, 0.2, 0.04, 1), this.mats.mat(accent0(this)), 0, -0.11, -0.22);
        pump.userData.keep = true;
        this.spinners.set(id, pump);
        muzzle.position.set(0, 0, -0.66);
        this.hand(g, 0.02, -0.2, 0.22, 0.2, 0, 0.1);
        this.hand(g, -0.02, -0.17, -0.22, 0.2, 0.2, -0.3);
        g.position.set(0.33, -0.32, -0.8);
        break;
      }
      case 'boomer': {
        add(new THREE.CylinderGeometry(0.17, 0.17, 0.95, 16), B, 0, 0, -0.05, Math.PI / 2);
        add(new THREE.TorusGeometry(0.18, 0.04, 8, 18), A, 0, 0, -0.52);
        add(new THREE.TorusGeometry(0.18, 0.04, 8, 18), A, 0, 0, 0.4);
        add(new THREE.CylinderGeometry(0.2, 0.14, 0.12, 16), D, 0, 0, 0.47, Math.PI / 2);
        const rocket = add(new THREE.SphereGeometry(0.13, 12, 10), G, 0, 0, -0.52);
        this.spinners.set(id, rocket);
        add(roundedBox(0.1, 0.24, 0.12, 0.03, 1), D, 0, -0.24, 0.1, -0.2);
        add(roundedBox(0.08, 0.1, 0.2, 0.03, 1), D, 0.02, 0.22, -0.1);
        muzzle.position.set(0, 0, -0.6);
        this.hand(g, 0.02, -0.26, 0.12, 0.2, 0, 0.1);
        this.hand(g, -0.1, -0.16, -0.25, 0.1, 0.4, -0.6);
        g.position.set(0.33, -0.31, -0.82);
        break;
      }
      case 'zapper': {
        add(roundedBox(0.14, 0.18, 0.9, 0.05, 1), B, 0, 0, -0.05);
        add(new THREE.CylinderGeometry(0.035, 0.04, 0.45, 8), D, 0, 0.02, -0.72, Math.PI / 2);
        for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.06, 0.018, 6, 12), G, 0, 0.02, -0.55 - i * 0.07);
        add(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 12), D, 0, 0.16, -0.05, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.07, 0.06, 0.04, 12), A, 0, 0.16, -0.23, Math.PI / 2);
        add(roundedBox(0.12, 0.16, 0.3, 0.04, 1), A, 0, -0.03, 0.42);
        add(roundedBox(0.09, 0.22, 0.1, 0.03, 1), D, 0, -0.17, 0.18, -0.25);
        muzzle.position.set(0, 0.02, -0.96);
        this.hand(g, 0.02, -0.17, 0.2, 0.2, 0, 0.1);
        this.hand(g, -0.02, -0.1, -0.32, 0.15, 0.2, -0.3);
        g.position.set(0.31, -0.3, -0.84);
        break;
      }
    }
    g.add(muzzle);
    consolidate(g, this.vmMat, true);
    g.userData.base = g.position.clone();
    g.visible = false;
    this.kick.add(g);
    this.guns.set(id, g);
    this.muzzles.set(id, muzzle);
  }

  /** Narrow (portrait) screens: pull the gun toward the centre and further away. */
  setAspect(aspect: number) {
    const t = Math.max(0, Math.min(1, (1.2 - aspect) / 0.75));
    this.sway.position.set(-0.2 * t, -0.04 * t, -0.42 * t);
  }

  show(id: WeaponId) {
    this.current = id;
    this.guns.forEach((g, k) => (g.visible = k === id));
    const m = this.muzzles.get(id)!;
    m.add(this.flash);
  }

  fire(strength = 1) {
    this.recoil = Math.min(1.5, this.recoil + 0.6 * strength);
    this.recoilRot = Math.min(1.5, this.recoilRot + 0.5 * strength);
    this.flashT = 0.05;
    this.flash.visible = true;
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.45 + Math.random() * 0.25);
  }

  land(speed: number) {
    this.landT = Math.min(1, speed / 16);
  }

  muzzleWorld(out: THREE.Vector3) {
    return this.muzzles.get(this.current)!.getWorldPosition(out);
  }

  private _hidden = false;
  setHidden(h: boolean) {
    this._hidden = h;
    this.root.visible = !h;
  }

  update(s: VMState) {
    const dt = s.dt;
    const g = this.guns.get(this.current)!;
    const base = g.userData.base as THREE.Vector3;
    this.aimT = damp(this.aimT, s.aiming ? 1 : 0, 14, dt);
    this.sprintT = damp(this.sprintT, s.sprint && s.onGround ? 1 : 0, 8, dt);
    // bob
    const moving = s.onGround ? Math.min(1, s.speed / 7) : 0;
    this.bobT += dt * (4 + s.speed * 1.1);
    const bobAmt = moving * (1 - this.aimT * 0.8) * (1 + this.sprintT * 0.8);
    const bx = Math.sin(this.bobT) * 0.025 * bobAmt;
    const by = -Math.abs(Math.cos(this.bobT)) * 0.03 * bobAmt;
    // look sway (lags behind mouse)
    this.swayX = damp(this.swayX, Math.max(-0.08, Math.min(0.08, -s.lookDX * 0.0009)), 10, dt);
    this.swayY = damp(this.swayY, Math.max(-0.06, Math.min(0.06, s.lookDY * 0.0009)), 10, dt);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.recoilRot = Math.max(0, this.recoilRot - dt * 6);
    this.landT = Math.max(0, this.landT - dt * 4);
    const idle = Math.sin(performance.now() * 0.0015) * 0.006;
    // aim moves gun to centre (zapper hides when scoped — handled by HUD overlay)
    const ax = THREE.MathUtils.lerp(base.x, 0, this.aimT);
    const ay = THREE.MathUtils.lerp(base.y, base.y * 0.55, this.aimT);
    g.position.set(ax + bx + this.swayX, ay + by + idle - this.swayY - this.landT * 0.08 + s.vy * -0.002, base.z + this.recoil * 0.09);
    // reload / switch / sprint rotations
    const rl = s.reloading > 0 ? Math.sin(Math.min(1, s.reloading) * Math.PI) : 0;
    const sw = s.switching;
    g.rotation.set(
      this.recoilRot * 0.14 - rl * 0.6 - sw * 1.1 - this.sprintT * 0.35,
      this.sprintT * 0.6 + this.swayX * 2,
      rl * 0.5 + this.sprintT * 0.3,
    );
    g.position.y -= sw * 0.4 + rl * 0.12;
    const spin = this.spinners.get(this.current);
    if (spin) {
      if (this.current === 'scatter') spin.position.z = -0.22 + Math.max(0, this.recoil - 0.6) * 0.15;
      else if (s.reloading > 0) spin.rotation.x += dt * 12;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }
    this.root.visible = !this._hidden;
  }
}
