import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Collision, type LevelData } from './Level';
import { NavGrid } from './NavGrid';
import { MaterialKit } from '../render/Materials';
import { Batcher } from '../render/Batcher';
import type { Quality, WorldDef, WorldTheme } from '../worlds/types';

/** A loaded world: scene graph, collision, navigation. */
export class WorldScene {
  scene = new THREE.Scene();
  level: LevelData;
  col: Collision;
  nav: NavGrid;
  mats: MaterialKit;
  theme: WorldTheme;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  private animators: ((dt: number, t: number) => void)[] = [];
  /** Layer for dynamic stuff (characters, fx) so it can be cleared separately. */
  dynamic = new THREE.Group();

  constructor(public def: WorldDef, public quality: Quality, renderer: THREE.WebGLRenderer) {
    this.theme = def.theme;
    this.level = def.level();
    this.col = new Collision(this.level);
    this.nav = new NavGrid(this.col, this.level, 1);
    this.mats = new MaterialKit(this.theme.material);
    if (this.theme.material === 'glossy' || this.theme.character.material === 'glossy') {
      const pm = new THREE.PMREMGenerator(renderer);
      this.mats.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    const th = this.theme;
    this.scene.background = new THREE.Color(th.background);
    if (th.fog) this.scene.fog = new THREE.Fog(th.fog.color, th.fog.near, th.fog.far);

    this.hemi = new THREE.HemisphereLight(th.hemi.sky, th.hemi.ground, th.hemi.intensity);
    this.scene.add(this.hemi);
    if (th.ambient) this.scene.add(new THREE.AmbientLight(0xffffff, th.ambient));
    this.sun = new THREE.DirectionalLight(th.sun.color, th.sun.intensity);
    const d = new THREE.Vector3(...th.sun.dir).normalize();
    const b = this.level.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const ext = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.62;
    this.sun.position.set(cx + d.x * 80, d.y * 80, cz + d.z * 80);
    this.sun.target.position.set(cx, 0, cz);
    this.scene.add(this.sun, this.sun.target);
    const shadows = quality !== 'low';
    if (shadows) {
      this.sun.castShadow = true;
      const sz = quality === 'ultra' ? 4096 : quality === 'high' ? 2048 : 1024;
      this.sun.shadow.mapSize.set(sz, sz);
      const cam = this.sun.shadow.camera;
      cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
      cam.near = 1; cam.far = 200;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.04;
    }

    const batch = new Batcher(shadows, shadows);
    const env = new THREE.Group();
    this.scene.add(env);
    def.build({
      scene: env,
      level: this.level,
      mats: this.mats,
      batch,
      quality,
      animate: (fn) => this.animators.push(fn),
    });
    batch.flush(env, shadows);
    env.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && shadows && !(m.material as THREE.ShaderMaterial).isShaderMaterial) m.receiveShadow = true;
    });
    // Static environment: freeze local matrices. Anything an animator moves must set userData.dynamic = true.
    env.updateMatrixWorld(true);
    env.traverse((o) => {
      if (!o.userData.dynamic) {
        o.updateMatrix();
        o.matrixAutoUpdate = false;
      }
    });
    this.scene.add(this.dynamic);
    this.envGroup = env;
  }
  envGroup: THREE.Group;

  update(dt: number, t: number) {
    for (const a of this.animators) a(dt, t);
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.mats.dispose();
  }
}
