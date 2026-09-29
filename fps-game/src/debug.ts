import * as THREE from 'three';
import { WorldScene } from './world/WorldScene';
import { Pipeline } from './render/Pipeline';
import { WORLDS } from './worlds';
import type { WorldId } from './worlds/types';

/**
 * Debug viewer: ?debug=<worldId>&cam=x,y,z,yaw,pitch[&fov=75][&top=1]
 * yaw 0 looks toward -Z (from blue base toward red base). pitch in radians (negative = look down).
 * top=1 renders an orthographic top-down overview of the whole map.
 * window.__info.extra() returns layout validation results.
 */
export function debugView(id: WorldId) {
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  document.body.appendChild(renderer.domElement);
  const world = new WorldScene(WORLDS[id], 'high', renderer);
  const pipe = new Pipeline(renderer, 4);
  pipe.setStyle(world.theme.style);
  pipe.setSize(window.innerWidth, window.innerHeight, 1, 1);
  const q = new URLSearchParams(location.search);
  const cam = new THREE.PerspectiveCamera(+(q.get('fov') ?? 75), window.innerWidth / window.innerHeight, 0.03, 500);
  const c = (q.get('cam') ?? '0,1.6,40,0,0').split(',').map(Number);
  cam.position.set(c[0], c[1], c[2]);
  cam.rotation.order = 'YXZ';
  cam.rotation.set(c[4], c[3], 0);
  if (q.get('top')) {
    world.scene.fog = null;
    const b = world.level.bounds;
    cam.position.set((b.minX + b.maxX) / 2, 160, (b.minZ + b.maxZ) / 2 + 0.01);
    cam.fov = 2 * Math.atan(((b.maxZ - b.minZ) / 2 + 4) / 160) * 180 / Math.PI;
    cam.updateProjectionMatrix();
    cam.lookAt((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  }
  world.scene.add(cam);

  // Markers for gameplay points (spawns blue/red, pickups yellow, flags, zone)
  if (q.get('markers')) {
    const mk = (p: number[], color: number, s = 0.6) => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(s), new THREE.MeshBasicMaterial({ color }));
      m.position.set(p[0], p[1] + 1, p[2]);
      world.scene.add(m);
    };
    world.level.spawns.forEach((s) => mk(s.pos, s.team ? 0xff0000 : 0x0000ff));
    world.level.pickups.forEach((p) => mk(p.pos, 0xffff00, 0.4));
    world.level.flags.forEach((f, i) => mk(f, i ? 0xff00ff : 0x00ffff, 1));
    mk(world.level.zone.pos, 0x00ff00, 1.2);
  }

  const t0 = performance.now();
  let frames = 0;
  const loop = () => {
    const t = (performance.now() - t0) / 1000;
    renderer.info.reset();
    world.update(1 / 60, t);
    pipe.render(world.scene, cam, t);
    frames++;
    (window as any).__frames = frames;
    requestAnimationFrame(loop);
  };
  loop();
  (window as any).__ready = true;
  (window as any).__info = {
    calls: () => renderer.info.render.calls,
    tris: () => renderer.info.render.triangles,
    nav: world.nav.mainCells.length,
    extra: () => validate(world),
  };
}

/** Checks that all gameplay points sit on walkable, mutually reachable ground. */
export function validate(world: WorldScene) {
  const nav = world.nav;
  const issues: string[] = [];
  const check = (label: string, p: [number, number, number]) => {
    const c = nav.nearestWalkable(p[0], p[1], p[2], 2);
    if (c < 0) { issues.push(`${label} @${p.join(',')}: no walkable cell nearby`); return; }
    if (nav.region[c] !== nav.mainRegion) issues.push(`${label} @${p.join(',')}: not in main nav region (unreachable)`);
    const h = nav.height[c];
    if (Math.abs(h - p[1]) > 0.35) issues.push(`${label} @${p.join(',')}: y=${p[1]} but ground=${h.toFixed(2)}`);
  };
  world.level.spawns.forEach((s, i) => check(`spawn${i}(team${s.team})`, s.pos));
  world.level.pickups.forEach((p, i) => check(`pickup${i}(${p.type})`, p.pos));
  world.level.flags.forEach((f, i) => check(`flag${i}`, f));
  check('zone', world.level.zone.pos);
  (world.level.hotspots ?? []).forEach((h, i) => check(`hotspot${i}`, h));
  world.level.pads.forEach((p, i) => check(`padTarget${i}`, p.target));
  // path test between bases
  const a = new THREE.Vector3(...world.level.flags[0]), b = new THREE.Vector3(...world.level.flags[1]);
  const path = nav.findPath(a, b, 20000);
  if (!path) issues.push('no path between flag bases');
  const teams = [0, 1].map((t) => world.level.spawns.filter((s) => s.team === t).length);
  if (teams[0] < 6 || teams[1] < 6) issues.push(`need >= 6 spawns per team, have ${teams}`);
  return {
    boxes: world.level.boxes.length,
    ramps: world.level.ramps.length,
    navMainCells: nav.mainCells.length,
    navWalkable: nav.walkable.length,
    pathLen: path?.length ?? 0,
    issues,
  };
}
