import * as THREE from 'three';
import type { MaterialKit } from './Materials';
import { canvasTexture } from './Materials';
import type { CharacterStyle, HatStyle, TeamPalette } from '../worlds/types';
import type { WeaponId } from '../entities/Weapons';
import { roundedBox } from '../worlds/common';
import { consolidate } from './merge';

const phCache = new Map<number, THREE.MeshLambertMaterial>();
/** Colour carrier material used only while building (baked into vertex colours). */
function placeholder(c: number) {
  let m = phCache.get(c);
  if (!m) phCache.set(c, (m = new THREE.MeshLambertMaterial({ color: c })));
  return m;
}

export type CosmeticHat =
  | 'default' | 'crown' | 'propeller' | 'tophat' | 'party' | 'cowboy' | 'chef' | 'viking' | 'cone' | 'halo' | 'bunny' | 'pirate' | 'wizard' | 'headphones' | 'flower';

export const HATS: { id: CosmeticHat; name: string; level: number }[] = [
  { id: 'default', name: 'World Default', level: 1 },
  { id: 'party', name: 'Party Hat', level: 2 },
  { id: 'propeller', name: 'Propeller Beanie', level: 3 },
  { id: 'cone', name: 'Traffic Cone', level: 4 },
  { id: 'bunny', name: 'Bunny Ears', level: 5 },
  { id: 'cowboy', name: 'Cowboy Hat', level: 6 },
  { id: 'headphones', name: 'Headphones', level: 7 },
  { id: 'chef', name: 'Chef Hat', level: 8 },
  { id: 'flower', name: 'Flower Power', level: 9 },
  { id: 'pirate', name: 'Pirate Hat', level: 10 },
  { id: 'tophat', name: 'Top Hat', level: 12 },
  { id: 'viking', name: 'Viking Helmet', level: 14 },
  { id: 'wizard', name: 'Wizard Hat', level: 16 },
  { id: 'halo', name: 'Halo', level: 18 },
  { id: 'crown', name: 'Golden Crown', level: 20 },
];

const emblemCache = new Map<string, THREE.Texture>();
export function emblemTexture(kind: string, color = '#ffffff') {
  const key = kind + color;
  let t = emblemCache.get(key);
  if (t) return t;
  t = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 6;
    g.translate(w / 2, h / 2);
    g.beginPath();
    switch (kind) {
      case 'star':
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 22 : 54;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        break;
      case 'crown':
        g.moveTo(-48, 30); g.lineTo(-52, -26); g.lineTo(-24, 2); g.lineTo(0, -38); g.lineTo(24, 2); g.lineTo(52, -26); g.lineTo(48, 30);
        break;
      case 'bolt':
        g.moveTo(10, -58); g.lineTo(-30, 8); g.lineTo(-2, 8); g.lineTo(-12, 58); g.lineTo(32, -12); g.lineTo(4, -12); g.lineTo(14, -58);
        break;
      case 'cat':
        g.moveTo(-44, -44); g.lineTo(-20, -18); g.lineTo(20, -18); g.lineTo(44, -44); g.lineTo(46, 10);
        g.quadraticCurveTo(40, 46, 0, 48); g.quadraticCurveTo(-40, 46, -46, 10);
        break;
      case 'splat':
      default:
        g.arc(0, 0, 32, 0, Math.PI * 2);
        g.closePath();
        g.fill(); g.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.beginPath();
          g.arc(Math.cos(a) * 44, Math.sin(a) * 44, 8 + (i % 2) * 5, 0, Math.PI * 2);
          g.fill();
        }
        return;
    }
    g.closePath();
    g.fill();
    g.stroke();
    if (kind === 'cat') {
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.beginPath(); g.arc(-16, 6, 6, 0, Math.PI * 2); g.arc(16, 6, 6, 0, Math.PI * 2); g.fill();
    }
  });
  emblemCache.set(key, t);
  return t;
}

function nameTagTexture(name: string, color: string) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.font = '700 34px "Fredoka", "Luckiest Guy", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tw = Math.min(w - 8, g.measureText(name).width + 28);
    g.fillStyle = color;
    const x0 = (w - tw) / 2;
    g.beginPath();
    g.roundRect(x0, 6, tw, 42, 12);
    g.fill();
    g.beginPath();
    g.moveTo(w / 2 - 8, 48); g.lineTo(w / 2 + 8, 48); g.lineTo(w / 2, 60); g.fill();
    g.fillStyle = '#fff';
    g.fillText(name, w / 2, 28, w - 20);
  }, { mip: false });
}

export interface CharacterOptions {
  team: 0 | 1;
  palette: TeamPalette;
  style: CharacterStyle;
  mats: MaterialKit;
  name: string;
  cosmetic?: CosmeticHat;
  bigHead?: boolean;
}

export interface AnimState {
  speed: number;
  onGround: boolean;
  pitch: number;
  vy: number;
  dt: number;
  sprint: boolean;
}

const tmpColor = new THREE.Color();

/** Procedural cartoon trooper. Faces -Z at yaw 0. Root origin is at the feet. */
export class CharacterModel {
  root = new THREE.Group();
  body = new THREE.Group();
  hips = new THREE.Group();
  torso = new THREE.Group();
  head = new THREE.Group();
  armL = new THREE.Group();
  armR = new THREE.Group();
  legL = new THREE.Group();
  legR = new THREE.Group();
  gunPivot = new THREE.Group();
  gun = new THREE.Group();
  muzzle = new THREE.Object3D();
  nameTag: THREE.Sprite;
  flagMount = new THREE.Group();
  cape: THREE.Mesh | null = null;
  private eyes: THREE.Object3D[] = [];
  private phase = Math.random() * 10;
  private squash = 0;
  private recoil = 0;
  private flash = 0;
  private mat: THREE.Material;
  private extraMats: THREE.Material[] = [];
  private mf: THREE.Sprite;
  private mfTime = 0;
  private headScale = 1;
  weapon: WeaponId | null = null;
  dance = 0;

  constructor(private o: CharacterOptions) {
    const { palette, style } = o;
    const kind = style.material ?? undefined;
    // Parts are built with placeholder colour materials, then each bone group is baked into a
    // single vertex-coloured mesh sharing one per-character material (few draw calls + hit flash).
    this.mat = o.mats.mat(0xffffff, { style: kind, vertexColors: true }).clone();
    const M = (c: number, extra: Record<string, unknown> = {}) => {
      if (extra.side === THREE.DoubleSide) {
        const m = o.mats.mat(c, { style: kind, side: THREE.DoubleSide }).clone();
        this.extraMats.push(m);
        return m;
      }
      return placeholder(c);
    };
    const teamMat = M(palette.primary);
    const darkMat = M(palette.dark);
    const skinMat = M(style.skin);
    const gloveMat = M(style.glove);
    const shoeMat = M(style.shoe);
    const whiteMat = placeholder(0xffffff);
    const blackMat = placeholder(0x151515);

    this.root.add(this.body);
    this.body.add(this.hips);

    // legs
    for (const [leg, x] of [[this.legL, -0.15], [this.legR, 0.15]] as const) {
      leg.position.set(x, 0.72, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.32, 3, 8), darkMat);
      thigh.position.y = -0.3;
      const foot = new THREE.Mesh(roundedBox(0.24, 0.16, 0.36, 0.06), shoeMat);
      foot.position.set(0, -0.62, -0.06);
      leg.add(thigh, foot);
      this.hips.add(leg);
    }
    // torso
    this.torso.position.y = 0.78;
    this.hips.add(this.torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 0.32, 4, 12), teamMat);
    chest.position.y = 0.3;
    chest.scale.set(1, 1, 0.85);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.1, 14), darkMat);
    belt.position.y = 0.08;
    this.torso.add(chest, belt);
    const emb = new THREE.Mesh(emblemGeometry(style.emblem ?? 'star', 0.13), whiteMat);
    emb.position.set(0, 0.36, -0.275);
    emb.rotation.y = Math.PI;
    this.torso.add(emb);
    if (style.backpack) {
      const pack = new THREE.Mesh(roundedBox(0.44, 0.46, 0.2, 0.07), darkMat);
      pack.position.set(0, 0.4, 0.3);
      const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.25, 3, 8), teamMat);
      tank.position.set(0, 0.45, 0.43);
      this.torso.add(pack, tank);
    }
    if (style.hat === 'mask') {
      // superhero cape
      const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.9, 1, 4), M(palette.secondary, { side: THREE.DoubleSide }));
      cape.geometry.translate(0, -0.45, 0);
      cape.position.set(0, 0.62, 0.3);
      cape.rotation.x = 0.15;
      cape.userData.keep = true;
      this.torso.add(cape);
      this.cape = cape;
    }

    // head
    this.head.position.y = 0.78;
    this.torso.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), skinMat);
    skull.position.y = 0.02;
    this.head.add(skull);
    for (const x of [-0.1, 0.1]) {
      const eye = new THREE.Group();
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), whiteMat);
      white.scale.set(0.9, 1.25, 0.55);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), blackMat);
      pupil.position.set(0, -0.005, -0.04);
      eye.add(white, pupil);
      eye.position.set(x, 0.06, -0.26);
      this.head.add(eye);
      this.eyes.push(eye);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 4, 10, Math.PI), blackMat);
    mouth.position.set(0, -0.08, -0.28);
    mouth.rotation.set(0, 0, Math.PI);
    this.head.add(mouth);
    this.buildHat(style.hat, o.cosmetic ?? 'default', teamMat, darkMat, palette);

    // arms + gun
    for (const [arm, x] of [[this.armL, -0.4], [this.armR, 0.4]] as const) {
      arm.position.set(x, 0.52, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 3, 8), teamMat);
      upper.position.y = -0.2;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), gloveMat);
      hand.position.y = -0.44;
      arm.add(upper, hand);
      this.torso.add(arm);
    }
    this.gunPivot.position.set(0.12, 0.42, -0.1);
    this.torso.add(this.gunPivot);
    this.gunPivot.add(this.gun);
    this.gun.position.set(0.05, -0.05, -0.42);
    this.muzzle.position.set(0, 0.04, -0.55);
    this.gun.add(this.muzzle);

    // flag mount on the back
    this.flagMount.position.set(0.1, 0.35, 0.4);
    this.torso.add(this.flagMount);

    // name tag
    const tagColor = '#' + tmpColor.setHex(palette.primary).getHexString();
    this.nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTagTexture(o.name, tagColor), depthWrite: false, fog: false, transparent: true }));
    this.nameTag.scale.set(1.5, 0.375, 1);
    this.nameTag.position.y = 2.3;
    this.nameTag.renderOrder = 10;
    this.root.add(this.nameTag);

    // muzzle flash
    this.mf = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.mf.scale.setScalar(0.7);
    this.mf.visible = false;
    this.muzzle.add(this.mf);

    for (const g of [this.legL, this.legR, this.armL, this.armR, this.torso]) consolidate(g, this.mat);
    consolidate(this.head, this.mat, true);
    if (style.flat) this.body.scale.z = 0.55;
    this.setBigHead(!!o.bigHead);
    this.root.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
  }

  setBigHead(on: boolean) {
    this.headScale = on ? 1.9 : 1;
    this.head.scale.setScalar(this.headScale);
  }

  private buildHat(style: HatStyle, cos: CosmeticHat, teamMat: THREE.Material, darkMat: THREE.Material, pal: TeamPalette) {
    const h = this.head;
    const add = (m: THREE.Mesh) => { h.add(m); return m; };
    const mat = (c: number, extra: Record<string, unknown> = {}) => (extra.side ? this.o.mats.mat(c, { style: this.o.style.material, ...extra }) : placeholder(c));
    if (cos !== 'default') {
      switch (cos) {
        case 'crown': {
          const c = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.18, 10, 1, true), mat(0xffcc22, { side: THREE.DoubleSide })));
          c.position.y = 0.33;
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const sp = add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), mat(0xffcc22)));
            sp.position.set(Math.cos(a) * 0.2, 0.47, Math.sin(a) * 0.2);
            const gem = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.035), mat(i % 2 ? 0xff3355 : 0x33aaff)));
            gem.position.set(Math.cos(a) * 0.22, 0.33, Math.sin(a) * 0.22);
          }
          return;
        }
        case 'propeller': {
          const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xff4455)));
          cap.position.y = 0.05;
          const stick = add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12), mat(0x333333)));
          stick.position.y = 0.4;
          const prop = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.015, 0.08), this.o.mats.mat(0xffdd33, { style: this.o.style.material })));
          prop.position.y = 0.46;
          prop.userData.keep = true;
          this.spinner = prop;
          return;
        }
        case 'tophat': {
          const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16), mat(0x1a1a1a)));
          brim.position.y = 0.26;
          const top = add(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.36, 16), mat(0x1a1a1a)));
          top.position.y = 0.45;
          const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.06, 16), mat(pal.primary)));
          band.position.y = 0.31;
          return;
        }
        case 'party': {
          const c = add(new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.45, 12), mat(0xff66cc)));
          c.position.y = 0.48;
          c.rotation.z = 0.15;
          const pom = add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(0xffee55)));
          pom.position.set(-0.035, 0.72, 0);
          return;
        }
        case 'cowboy': {
          const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.03, 18), mat(0x9a6433)));
          brim.position.y = 0.22;
          brim.scale.z = 0.8;
          const top = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.26, 14), mat(0x9a6433)));
          top.position.y = 0.36;
          return;
        }
        case 'chef': {
          const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.2, 14), mat(0xffffff)));
          b.position.y = 0.33;
          for (let i = 0; i < 4; i++) {
            const puff = add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(0xffffff)));
            puff.position.set(Math.cos(i * 1.57) * 0.1, 0.5, Math.sin(i * 1.57) * 0.1);
          }
          return;
        }
        case 'viking': {
          const d = add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x9aa3ad)));
          d.position.y = 0.04;
          for (const s of [-1, 1]) {
            const horn = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 8), mat(0xfff3d6)));
            horn.position.set(s * 0.33, 0.22, 0);
            horn.rotation.z = -s * 0.9;
          }
          return;
        }
        case 'cone': {
          const c = add(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 14), mat(0xff7a1a)));
          c.position.y = 0.5;
          const s = add(new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.19, 0.1, 14), mat(0xffffff)));
          s.position.y = 0.5;
          const base = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), mat(0xff7a1a)));
          base.position.y = 0.24;
          return;
        }
        case 'halo': {
          const r = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 20), this.o.mats.glow(0xfff3a0, 1.6)));
          r.rotation.x = Math.PI / 2;
          r.position.y = 0.52;
          r.userData.bob = true;
          this.bobber = r;
          return;
        }
        case 'bunny': {
          for (const s of [-1, 1]) {
            const e = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.34, 3, 8), mat(0xffffff)));
            e.position.set(s * 0.12, 0.5, 0.02);
            e.rotation.z = -s * 0.2;
            const inner = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.26, 3, 6), mat(0xffa6c9)));
            inner.position.set(s * 0.12, 0.5, -0.035);
            inner.rotation.z = -s * 0.2;
          }
          return;
        }
        case 'pirate': {
          const hat = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.36, 0.22, 3), mat(0x1c1c1c)));
          hat.position.y = 0.32;
          hat.rotation.y = Math.PI / 2;
          hat.scale.set(1, 1, 0.55);
          const skull = add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0xffffff)));
          skull.position.set(0, 0.34, -0.2);
          return;
        }
        case 'wizard': {
          const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 18), mat(0x4b2bb8)));
          brim.position.y = 0.22;
          const c = add(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.7, 14), mat(0x4b2bb8)));
          c.position.y = 0.58;
          c.rotation.z = 0.2;
          const star = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.05), this.o.mats.glow(0xffe066, 1.3)));
          star.position.set(0, 0.45, -0.2);
          return;
        }
        case 'headphones': {
          const band = add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 20, Math.PI), mat(0x222222)));
          band.position.y = 0.04;
          for (const s of [-1, 1]) {
            const cup = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), mat(0xff3377)));
            cup.rotation.z = Math.PI / 2;
            cup.position.set(s * 0.31, 0.02, 0);
          }
          return;
        }
        case 'flower': {
          for (let i = 0; i < 6; i++) {
            const p = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat([0xff66aa, 0xffdd33, 0x66ccff][i % 3])));
            const a = (i / 6) * Math.PI * 2;
            p.position.set(Math.cos(a) * 0.25, 0.25 + Math.sin(i) * 0.03, Math.sin(a) * 0.25);
          }
          return;
        }
      }
    }
    switch (style) {
      case 'cap': {
        const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.315, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), teamMat));
        cap.position.y = 0.04;
        const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12, 1, false, -Math.PI / 2, Math.PI), darkMat));
        brim.position.set(0, 0.06, -0.24);
        brim.scale.set(1.2, 1, 1.3);
        const btn = add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), darkMat));
        btn.position.y = 0.36;
        break;
      }
      case 'helmet': {
        const d = add(new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), teamMat));
        d.position.y = 0.03;
        const rim = add(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 4, 16), darkMat));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.03;
        break;
      }
      case 'army': {
        const d = add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), teamMat));
        d.position.y = 0.06;
        d.scale.y = 0.9;
        const rim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 16), teamMat));
        rim.position.y = 0.06;
        const star = add(new THREE.Mesh(emblemGeometry('star', 0.08), placeholder(0xffffff)));
        star.position.set(0, 0.2, -0.305);
        star.rotation.set(-0.5, Math.PI, 0);
        break;
      }
      case 'mask': {
        const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.12, 16, 1, true), mat(pal.dark, { side: THREE.DoubleSide })));
        band.position.y = 0.07;
        const hood = add(new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.3), teamMat));
        hood.position.y = 0.04;
        break;
      }
      case 'visor': {
        const v = add(new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.1, 16, 1, true, Math.PI * 0.6, Math.PI * 0.8), this.o.mats.glow(pal.light, 2.2)));
        v.position.y = 0.07;
        (v.material as THREE.Material).side = THREE.DoubleSide;
        for (let i = 0; i < 6; i++) {
          const sp = add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 5), darkMat));
          const a = (i / 6) * Math.PI - Math.PI;
          sp.position.set(Math.cos(a) * 0.14, 0.3, 0.05 + Math.sin(a) * -0.12);
          sp.rotation.set(-0.5 + i * 0.1, 0, Math.cos(a) * 0.6);
        }
        break;
      }
    }
  }
  private spinner: THREE.Object3D | null = null;
  private bobber: THREE.Object3D | null = null;

  setWeapon(id: WeaponId, mats: MaterialKit, color: number) {
    if (this.weapon === id) return;
    this.weapon = id;
    for (let i = this.gun.children.length - 1; i >= 0; i--) {
      const c = this.gun.children[i];
      if (c !== this.muzzle) this.gun.remove(c);
    }
    void mats;
    const body = placeholder(color);
    const dark = placeholder(0x2a2a3a);
    const parts: THREE.Mesh[] = [];
    switch (id) {
      case 'blaster': {
        parts.push(new THREE.Mesh(roundedBox(0.14, 0.18, 0.55, 0.05), body));
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.25, 8), dark);
        b.rotation.x = Math.PI / 2; b.position.z = -0.35; parts.push(b);
        const tank = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), dark);
        tank.position.set(0, 0.13, 0.05); parts.push(tank);
        this.muzzle.position.set(0, 0, -0.5);
        break;
      }
      case 'scatter': {
        const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.62, 10), body);
        b1.rotation.x = Math.PI / 2; b1.position.z = -0.1; parts.push(b1);
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.08, 0.14, 10), dark);
        bell.rotation.x = Math.PI / 2; bell.position.z = -0.45; parts.push(bell);
        parts.push(new THREE.Mesh(roundedBox(0.12, 0.16, 0.25, 0.04), dark));
        this.muzzle.position.set(0, 0, -0.55);
        break;
      }
      case 'boomer': {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.8, 12), body);
        tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.08, -0.05); parts.push(tube);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 12), dark);
        ring.position.set(0, 0.08, -0.45); parts.push(ring);
        this.muzzle.position.set(0, 0.08, -0.5);
        break;
      }
      case 'zapper': {
        parts.push(new THREE.Mesh(roundedBox(0.1, 0.14, 0.75, 0.04), body));
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), dark);
        b.rotation.x = Math.PI / 2; b.position.z = -0.55; parts.push(b);
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8), dark);
        scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.12, -0.05); parts.push(scope);
        this.muzzle.position.set(0, 0, -0.75);
        break;
      }
    }
    for (const p of parts) this.gun.add(p);
    consolidate(this.gun, this.mat);
  }

  setTagVisible(v: boolean) {
    this.nameTag.visible = v;
  }

  hit() {
    this.flash = 1;
  }

  fire() {
    this.recoil = 1;
    this.mfTime = 0.05;
    this.mf.visible = true;
    this.mf.material.rotation = Math.random() * Math.PI;
  }

  land(speed: number) {
    this.squash = Math.min(1, speed / 14);
  }

  update(s: AnimState) {
    const dt = s.dt;
    const moving = Math.min(1, s.speed / 7);
    this.phase += dt * (s.speed * 1.55 + 0.001);
    const sw = Math.sin(this.phase) * 0.85 * moving;
    if (s.onGround) {
      this.legL.rotation.x = sw;
      this.legR.rotation.x = -sw;
      this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.07 * moving;
    } else {
      this.legL.rotation.x = -0.7;
      this.legR.rotation.x = 0.35;
      this.body.position.y = 0.05;
    }
    const lean = s.sprint ? 0.18 : 0.06 * moving;
    this.torso.rotation.x = -lean;
    // arms aim along pitch, holding gun
    const p = Math.max(-1.2, Math.min(1.2, s.pitch));
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.gunPivot.rotation.x = p + lean;
    this.gun.position.z = -0.42 + this.recoil * 0.1;
    this.armR.rotation.set(Math.PI / 2 + p + lean - 0.12, 0, -0.3);
    this.armL.rotation.set(Math.PI / 2 + p + lean - 0.02, 0, 0.62);
    this.head.rotation.x = p * 0.5;
    // idle breathing
    const breath = Math.sin(this.phase * 0.3 + performance.now() * 0.002) * 0.015;
    this.torso.scale.set(1, 1 + breath, 1);
    // squash on landing
    this.squash = Math.max(0, this.squash - dt * 5);
    const sq = Math.sin(this.squash * Math.PI) * 0.25;
    this.body.scale.y = 1 - sq;
    this.body.scale.x = 1 + sq * 0.6;
    if (!this.o.style.flat) this.body.scale.z = 1 + sq * 0.6;
    // hit flash
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      const m = this.mat as THREE.MeshToonMaterial;
      if (m.emissive) m.emissive.setRGB(this.flash * 0.8, this.flash * 0.8, this.flash * 0.8);
    }
    if (this.mfTime > 0) {
      this.mfTime -= dt;
      if (this.mfTime <= 0) this.mf.visible = false;
    }
    if (this.cape) this.cape.rotation.x = 0.15 + moving * 0.6 + Math.sin(this.phase * 0.5) * 0.08;
    if (this.spinner) this.spinner.rotation.y += dt * (8 + s.speed * 3);
    if (this.bobber) this.bobber.position.y = 0.52 + Math.sin(performance.now() * 0.004) * 0.03;
    if (this.dance > 0) this.updateDance(dt);
  }

  private updateDance(dt: number) {
    this.dance += dt;
    const t = this.dance;
    this.body.position.y = Math.abs(Math.sin(t * 6)) * 0.35;
    this.body.rotation.y = Math.sin(t * 3) * 0.6;
    this.armL.rotation.set(Math.PI + Math.sin(t * 12) * 0.4, 0, 0.3);
    this.armR.rotation.set(Math.PI + Math.cos(t * 12) * 0.4, 0, -0.3);
    this.legL.rotation.x = Math.sin(t * 12) * 0.5;
    this.legR.rotation.x = -Math.sin(t * 12) * 0.5;
    this.gunPivot.visible = false;
  }

  resetPose() {
    this.dance = 0;
    this.body.rotation.set(0, 0, 0);
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.root.scale.setScalar(1);
    this.gunPivot.visible = true;
    this.head.scale.setScalar(this.headScale);
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.mat.dispose();
    this.extraMats.forEach((m) => m.dispose());
    (this.nameTag.material as THREE.SpriteMaterial).map?.dispose();
    this.nameTag.material.dispose();
  }
}

const embGeoCache = new Map<string, THREE.BufferGeometry>();
/** Flat emblem shape (so it can be baked into the torso mesh). Faces +Z; size = radius. */
export function emblemGeometry(kind: string, r: number) {
  const key = kind + r;
  let g = embGeoCache.get(key);
  if (g) return g;
  const sh = new THREE.Shape();
  const pts: [number, number][] = [];
  switch (kind) {
    case 'crown':
      pts.push([-0.9, -0.55], [-0.95, 0.5], [-0.45, 0], [0, 0.7], [0.45, 0], [0.95, 0.5], [0.9, -0.55]);
      break;
    case 'bolt':
      pts.push([0.2, 1], [-0.55, -0.1], [-0.05, -0.1], [-0.25, -1], [0.6, 0.2], [0.08, 0.2], [0.28, 1]);
      break;
    case 'cat':
      pts.push([-0.8, 0.8], [-0.35, 0.35], [0.35, 0.35], [0.8, 0.8], [0.82, -0.15], [0.5, -0.75], [0, -0.85], [-0.5, -0.75], [-0.82, -0.15]);
      break;
    case 'splat':
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rr = i % 2 ? 0.62 : 1;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      break;
    case 'star':
    default:
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
        const rr = i % 2 ? 0.42 : 1;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
  }
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x * r, y * r) : sh.moveTo(x * r, y * r)));
  sh.closePath();
  g = new THREE.ShapeGeometry(sh);
  embGeoCache.set(key, g);
  return g;
}

let flashTex: THREE.Texture | null = null;
export function flashTexture() {
  if (flashTex) return flashTex;
  flashTex = canvasTexture(128, 128, (g, w, h) => {
    g.translate(w / 2, h / 2);
    const grad = g.createRadialGradient(0, 0, 4, 0, 0, 60);
    grad.addColorStop(0, 'rgba(255,255,240,1)');
    grad.addColorStop(0.35, 'rgba(255,230,120,0.95)');
    grad.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? 22 : 62;
      const a = (i / 16) * Math.PI * 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
  return flashTex;
}
