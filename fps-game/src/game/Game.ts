import * as THREE from 'three';
import { WorldScene } from '../world/WorldScene';
import { Pipeline } from '../render/Pipeline';
import { Effects } from '../render/Effects';
import { ViewModel } from '../render/ViewModel';
import { WORLDS } from '../worlds';
import type { Quality, WorldId } from '../worlds/types';
import { Match, type MatchConfig, type MatchEvent } from './Match';
import { Input } from '../core/Input';
import { settings } from '../core/Settings';
import { Hud } from '../ui/Hud';
import { TouchControls } from '../ui/Touch';
import { audio, type SfxName } from '../core/Audio';
import { EYE } from '../entities/Actor';
import { WEAPONS } from '../entities/Weapons';
import { angleDiff, clamp, damp, dirFromYawPitch, isTouchDevice, rand, yawTo } from '../core/utils';
import { addXp, profile, saveProfile } from '../core/Profile';
import { applyTally, CHALLENGE_XP } from '../core/Challenges';
import type { Actor } from '../entities/Actor';

export type GameState = 'menu' | 'playing' | 'paused' | 'ended';

export interface MatchSummary {
  cfg: MatchConfig;
  winner: number;
  score: [number, number];
  player: Actor | null;
  actors: Actor[];
  mvp: Actor | null;
  xp: { label: string; value: number }[];
  xpTotal: number;
  levelsGained: number[];
  unlocked: string[];
  challenges: string[];
}

export class Game {
  renderer: THREE.WebGLRenderer;
  pipeline: Pipeline;
  camera: THREE.PerspectiveCamera;
  input: Input;
  hud: Hud;
  touch: TouchControls;
  world: WorldScene | null = null;
  worldId: WorldId | null = null;
  match: Match | null = null;
  fx: Effects | null = null;
  vm: ViewModel | null = null;
  state: GameState = 'menu';
  quality: Quality;
  private lastT = performance.now();
  private time = 0;
  private shake = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private fov = 90;
  private stepT = 0;
  private camYaw = 0;
  private camPitch = 0;
  private specTarget: Actor | null = null;
  private specT = 0;
  private specMode = 0;
  private endT = 0;
  private endShown = false;
  private lastCountdown = 99;
  private wasReloading = false;
  private frameTimes: number[] = [];
  private dynScale = 1;
  private dynT = 0;
  private lastWeapon = '';
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  scoreboardHeld = false;
  onStateChange: ((s: GameState) => void) | null = null;
  onMatchEnd: ((s: MatchSummary) => void) | null = null;
  onPauseRequest: (() => void) | null = null;
  touchMode: boolean;

  constructor(private container: HTMLElement) {
    this.quality = settings.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'gl';
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.pipeline = new Pipeline(this.renderer, this.msaaFor(this.quality));
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.03, 600);
    this.camera.rotation.order = 'YXZ';
    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(container);
    this.touch = new TouchControls(container, this.input);
    this.touch.onPause = () => this.onPauseRequest?.();
    this.touch.onScoreboard = (v) => { this.scoreboardHeld = v; };
    this.touchMode = isTouchDevice();
    this.input.onWantLock = () => {
      if (this.state === 'playing' && !this.touchMode) this.input.requestLock();
    };
    this.input.onLockFailed = () => {
      if (this.state === 'playing') this.hud.hint('🖱️ Mouse capture is blocked here — drag with the LEFT button to aim & shoot, RIGHT button to just look. Arrow keys turn too.', 9);
    };
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && !this.touchMode && this.lockedOnce) {
        this.onPauseRequest?.();
      }
      if (document.pointerLockElement) this.lockedOnce = true;
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.onPauseRequest?.();
    });
    window.addEventListener('touchstart', () => { this.touchMode = true; }, { passive: true });
    window.addEventListener('mousemove', (e) => { if (e.movementX || e.movementY) { if (!isTouchDevice()) this.touchMode = false; } });
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }
  private lockedOnce = false;
  private lastChallenges: string[] = [];

  msaaFor(q: Quality) {
    return q === 'low' ? 0 : q === 'medium' ? 2 : 4;
  }

  pixelRatioFor(q: Quality) {
    const dpr = window.devicePixelRatio || 1;
    const cap = q === 'low' ? 1 : q === 'medium' ? 1.25 : q === 'high' ? 1.75 : 2;
    return Math.min(dpr, cap);
  }

  applyQuality() {
    const q = settings.quality;
    const changed = q !== this.quality;
    this.quality = q;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.pipeline.setMSAA(this.msaaFor(q));
    this.pipeline.bloomEnabled = q !== 'low';
    if (this.world) this.pipeline.setStyle(this.world.theme.style);
    this.resize();
    if (changed && this.world) {
      // rebuild world for shadow map sizes
      const id = this.worldId!;
      this.worldId = null;
      if (this.state === 'menu') this.startAttract(id);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = this.pixelRatioFor(this.quality);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline.setSize(w, h, pr, settings.renderScale * this.dynScale);
  }

  // ------------------------------------------------------------------ world / match lifecycle
  loadWorld(id: WorldId) {
    if (this.worldId === id && this.world) return;
    this.disposeMatch();
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    const def = WORLDS[id];
    this.world = new WorldScene(def, this.quality, this.renderer);
    this.worldId = id;
    this.world.scene.add(this.camera);
    const th = this.world.theme;
    this.fx = new Effects(this.world.scene, this.world.mats.mat(0xffffff), th.impact, th.hitWords);
    const t0 = th.teams[0];
    this.vm = new ViewModel(this.world.mats, t0.primary, th.accent, 0x2a2a3a, th.character.glove, t0.primary, t0.light);
    this.camera.add(this.vm.root);
    this.pipeline.setStyle(th.style);
    this.hud.setTheme(th.hudClass, [th.teams[0].primary, th.teams[1].primary], [th.teams[0].name, th.teams[1].name]);
    audio.setWorld(id);
    // warm up shaders
    this.renderer.compile(this.world.scene, this.camera);
  }

  private disposeMatch() {
    if (this.match) {
      this.match.dispose();
      this.match = null;
    }
  }

  /** Menu background: bots-only match with a cinematic camera. */
  startAttract(id: WorldId) {
    this.loadWorld(id);
    this.disposeMatch();
    this.match = new Match(this.world!, { world: id, mode: 'tdm', difficulty: 2, scoreScale: 3, mutators: [], playerName: '', playerHat: 'default', spectate: true }, this.fx!);
    this.match.countdown = 0.1;
    this.setState('menu');
    this.hud.show(false);
    this.touch.setActive(false);
    this.input.enabled = false;
    this.input.exitLock();
    this.vm!.setHidden(true);
    this.pipeline.desat = 0;
    audio.startMusic('menu');
    audio.setMusicIntensity(0.3);
    this.specTarget = null;
  }

  startMatch(cfg: MatchConfig) {
    this.loadWorld(cfg.world);
    this.disposeMatch();
    this.fx!.clear();
    this.match = new Match(this.world!, cfg, this.fx!);
    this.hud.reset();
    this.hud.show(true);
    this.vm!.setHidden(false);
    this.recoilPitch = this.recoilYaw = 0;
    this.endT = 0;
    this.endShown = false;
    this.lastCountdown = 99;
    this.pipeline.desat = 0;
    this.input.enabled = true;
    this.input.clear();
    this.setState('playing');
    this.touch.setActive(this.touchMode);
    if (!this.touchMode) this.input.requestLock();
    audio.startMusic(cfg.world);
    audio.setMusicIntensity(0.5);
    const p = this.match.player!;
    this.camYaw = p.yaw;
    this.camPitch = 0;
    let seen = false;
    try { seen = !!localStorage.getItem('toonfire.tutorial'); localStorage.setItem('toonfire.tutorial', '1'); } catch { /* storage blocked */ }
    if (!seen) {
      this.hud.hint(this.touchMode
        ? '🕹️ Left thumb: move · Right thumb: look · 🔥 fire (drag it to aim) · ⤒ jump twice to double-jump'
        : '⌨️ WASD move · SPACE jump (twice = double jump) · SHIFT sprint · LMB fire · RMB scope · R reload · G bomb · TAB scores', 10);
    } else {
      const obj: Record<string, string> = { tdm: 'Splat the red team! First to the kill limit wins.', ctf: 'Grab the red flag and bring it to your base!', koth: 'Hold the glowing zone to score!', elim: 'No respawns — last team standing wins the round!', duck: 'Grab the golden duck and keep it away from red!' };
      this.hud.hint(obj[cfg.mode] ?? '', 5);
    }
  }

  setState(s: GameState) {
    this.state = s;
    audio.setPaused(s === 'paused');
    this.onStateChange?.(s);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.input.clear();
    this.input.enabled = false;
    this.input.exitLock();
    this.touch.setActive(false);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.setState('playing');
    this.input.enabled = true;
    this.input.clear();
    this.touch.setActive(this.touchMode);
    if (!this.touchMode) this.input.requestLock();
    this.lastT = performance.now();
  }

  quitToMenu() {
    this.input.exitLock();
    this.startAttract(this.worldId ?? 'plaza');
  }

  /** Test hook: advance the simulation quickly without rendering. */
  simulate(seconds: number, step = 1 / 60) {
    const m = this.match;
    if (!m) return;
    const n = Math.round(seconds / step);
    for (let i = 0; i < n; i++) {
      if (m.player && this.state === 'playing') this.controlPlayer(step);
      m.update(step);
      this.handleEvents(m);
      this.fx?.update(step, this.camera);
      if (this.state === 'ended') this.updateEnd(step, m);
    }
  }

  // ------------------------------------------------------------------ main loop
  private frame() {
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    const rawDt = dt;
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const m = this.match;
    const w = this.world;
    if (!w || !m) {
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
      return;
    }
    this.input.poll();
    if (this.state === 'playing' || this.state === 'ended') {
      if (this.input.pausePressed && this.state === 'playing') this.onPauseRequest?.();
      if (m.player && this.state === 'playing') this.controlPlayer(dt);
      m.update(dt);
    } else if (this.state === 'menu') {
      m.update(dt);
      // endless attract: restart when over
      if (m.state === 'ended') {
        this.endT += dt;
        if (this.endT > 6) this.startAttract(this.worldId!);
      }
    }
    this.handleEvents(m);
    w.update(dt, this.time);
    this.updateCamera(dt, m);
    this.fx!.update(dt, this.camera);
    if (this.state === 'playing' || this.state === 'ended' || this.state === 'paused') {
      this.hud.update(dt, m, this.camera, { spectating: false, aiming: !!m.player?.aiming, fps: 1 / Math.max(rawDt, 1e-3) });
      this.hud.showScoreboard((this.input.scoreboard || this.scoreboardHeld) && this.state !== 'ended', m);
    }
    this.pipeline.flashAmt = Math.max(0, this.pipeline.flashAmt - dt * 3);
    this.renderer.info.reset();
    this.pipeline.render(w.scene, this.camera, this.time);
    this.input.consume();
    this.adaptResolution(rawDt);
    if (this.state === 'ended') this.updateEnd(dt, m);
  }

  private adaptResolution(dt: number) {
    if (this.state !== 'playing') return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    this.dynT++;
    let s = this.dynScale;
    if (avg > 1 / 40) s = Math.max(0.55, s - 0.1);
    else if (avg < 1 / 58 && this.dynT > 3) { s = Math.min(1, s + 0.05); this.dynT = 0; }
    if (s !== this.dynScale) {
      this.dynScale = s;
      this.resize();
    }
  }

  // ------------------------------------------------------------------ player control
  private controlPlayer(dt: number) {
    const m = this.match!;
    const p = m.player!;
    const inp = this.input;
    if (!p.alive || m.state === 'ended') {
      p.wish.set(0, 0);
      p.wantFire = false;
      return;
    }
    const def = p.weapon.def;
    const zoom = p.aiming && def.zoomFov ? def.zoomFov / settings.fov : p.aiming ? 0.8 : 1;
    let sens = (this.touchMode ? 0.0016 : 0.0022) * (this.touchMode ? 1 : settings.sensitivity) * zoom;
    // aim assist
    const assist = (settings.aimAssist || this.touchMode) ? this.findAssistTarget(p) : null;
    if (assist && settings.aimAssist) sens *= 0.6;
    p.yaw -= inp.lookDX * sens + inp.turnX * 2.4 * dt * zoom;
    p.pitch -= (inp.lookDY * sens + inp.turnY * 1.6 * dt * zoom) * (settings.invertY ? -1 : 1);
    if (assist && settings.aimAssist && (inp.moveX !== 0 || inp.moveY !== 0 || Math.abs(inp.lookDX) > 0)) {
      const ty = yawTo(p.pos.x, p.pos.z, assist.pos.x, assist.pos.z);
      p.yaw += clamp(angleDiff(p.yaw, ty), -0.5 * dt, 0.5 * dt);
    }
    p.pitch = clamp(p.pitch, -1.45, 1.45);
    p.wish.set(inp.moveX, inp.moveY);
    p.wantSprint = inp.sprint;
    if (inp.jumpPressed) p.wantJump = true;
    p.wantAim = inp.aim;
    let fire = inp.fire;
    if (settings.autoFire && this.touchMode && assist && assist.userData < 0.03) fire = true;
    p.wantFire = fire;
    if (inp.reloadPressed && p.startReload()) m.emit({ type: 'reload', actor: p });
    if (inp.slotPressed >= 0 && p.switchTo(inp.slotPressed)) m.emit({ type: 'switch', actor: p });
    if (inp.cycle && p.cycle(inp.cycle)) m.emit({ type: 'switch', actor: p });
    if (inp.grenadePressed) m.throwGrenade(p);
    if (p.weapon.def.id !== this.lastWeapon) {
      this.lastWeapon = p.weapon.def.id;
      this.vm!.show(p.weapon.def.id);
      this.touch.setWeaponHasScope(!!p.weapon.def.zoomFov);
      if (this.touchMode && !p.weapon.def.zoomFov) this.touch.resetAim();
    }
    // footsteps
    if (p.onGround && p.horizSpeed() > 2) {
      this.stepT -= dt * (p.horizSpeed() / 7);
      if (this.stepT <= 0) {
        this.stepT = 0.36;
        audio.play('footstep', { volume: 0.5 });
      }
    }
  }

  private findAssistTarget(p: Actor): (Actor & { userData: number }) | null {
    const m = this.match!;
    const dir = dirFromYawPitch(p.yaw, p.pitch, new THREE.Vector3());
    const eye = new THREE.Vector3(p.pos.x, p.pos.y + EYE, p.pos.z);
    let best: Actor | null = null;
    let bestAng = 0.07;
    const to = new THREE.Vector3();
    for (const a of m.actors) {
      if (a.team === p.team || !a.alive) continue;
      to.set(a.pos.x, a.pos.y + 1.1, a.pos.z).sub(eye);
      const d = to.length();
      if (d > 60) continue;
      to.divideScalar(d);
      const ang = Math.acos(clamp(to.dot(dir), -1, 1)) - Math.atan2(0.4, d);
      if (ang < bestAng && m.col.lineOfSight(eye, a.center())) { bestAng = ang; best = a; }
    }
    if (!best) return null;
    const r = best as Actor & { userData: number };
    r.userData = bestAng;
    return r;
  }

  // ------------------------------------------------------------------ events → audio/hud/fx
  private handleEvents(m: Match) {
    const p = m.player;
    const hud = this.hud;
    const playing = this.state !== 'menu';
    const th = this.world!.theme;
    const tc = (t: number) => '#' + new THREE.Color(th.teams[t].primary).getHexString();
    // countdown beeps
    if (playing && m.state === 'countdown') {
      const c = Math.ceil(m.countdown - 0.5);
      if (c !== this.lastCountdown && c > 0) { audio.play('countdown'); this.lastCountdown = c; }
    }
    for (const e of m.events) {
      switch (e.type) {
        case 'fire': {
          const mine = e.actor === p;
          if (mine) {
            const def = WEAPONS[e.weapon];
            this.vm!.fire(def.kick * 3);
            this.recoilPitch += def.recoil * (p!.aiming ? 0.5 : 1);
            this.recoilYaw += rand(-1, 1) * def.recoil * 0.4;
            this.shake = Math.min(1, this.shake + def.kick * 0.5);
            audio.play(e.weapon as SfxName, { volume: 0.9 });
            this.fx!.muzzle(e.pos, th.teams[0].light);
          } else if (playing || this.isNearCam(e.pos, 40)) audio.play(e.weapon as SfxName, { pos: e.pos, volume: 0.8 });
          break;
        }
        case 'hit':
          if (e.attacker === p) {
            hud.hit(e.kill, e.head);
            audio.play(e.kill ? 'kill' : e.head ? 'headshot' : 'hit', { volume: e.kill ? 1 : 0.7 });
            hud.damageNumber(e.pos, e.dmg, e.head, e.kill);
            if (e.head || e.kill || th.impact === 'ink' || Math.random() < 0.15) this.fx!.pop(e.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), e.head ? (th.impact === 'ink' ? 'BONK!' : 'BONK!') : undefined, e.head ? 1.5 : 1.1);
          } else if (!playing && (e.head || e.kill) && Math.random() < 0.5) this.fx!.pop(e.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), undefined, 1.2);
          break;
        case 'damaged':
          if (e.victim === p) {
            hud.damageFrom(e.from);
            audio.play('hurt', { volume: 0.8 });
            this.pipeline.flashColor.setRGB(1, 0.15, 0.1);
            this.pipeline.flashAmt = Math.min(0.35, 0.1 + e.dmg / 120);
            this.shake = Math.min(1, this.shake + e.dmg / 80);
          }
          break;
        case 'kill': {
          if (playing) hud.kill(e, p);
          if (e.victim === p) {
            audio.play('death');
            this.touch.resetAim();
          } else if (e.killer === p && playing) {
            hud.toastMsg(`${e.head ? '🎯 HEADSHOT! ' : ''}You splatted ${e.victim.name}  +${100 + (e.head ? 25 : 0)}`);
          }
          if (e.assist === p && playing) hud.toastMsg(`Assist on ${e.victim.name}  +50`);
          break;
        }
        case 'streak':
          if (e.actor === p) { hud.message(e.text, true, '#ffd23f'); audio.play('multikill'); }
          else if (playing && (e.text.length > 12 || e.text === 'FIRST SPLAT!')) hud.toastMsg(`${e.actor.name}: ${e.text}`);
          break;
        case 'chat':
          if (playing) hud.chatLine(e.actor, e.text);
          break;
        case 'message':
          if (playing) {
            if (e.text === 'GO!') audio.play('go');
            hud.message(e.text, !!e.big, e.color);
          }
          break;
        case 'explode': {
          audio.play('explosion', { pos: e.pos });
          if (this.state !== 'menu') {
            const d = this.camera.position.distanceTo(e.pos);
            this.shake = Math.min(1, this.shake + Math.max(0, 1 - d / 20) * 0.8);
          }
          break;
        }
        case 'jump':
          if (e.actor === p) audio.play(e.double ? 'double_jump' : 'jump', { volume: 0.6 });
          else if (this.isNearCam(e.actor.pos, 20)) audio.play(e.double ? 'double_jump' : 'jump', { pos: e.actor.pos, volume: 0.4 });
          break;
        case 'land':
          if (e.actor === p) { audio.play('land', { volume: 0.7 }); this.vm!.land(e.speed); this.shake = Math.min(1, this.shake + e.speed / 60); }
          break;
        case 'pad':
          audio.play('jumppad', e.actor === p ? { volume: 0.9 } : { pos: e.actor.pos });
          break;
        case 'reload':
          if (e.actor === p) audio.play('reload');
          break;
        case 'empty':
          if (e.actor === p) audio.play('empty');
          break;
        case 'switch':
          if (e.actor === p) audio.play('switch', { volume: 0.6 });
          break;
        case 'grenade':
          audio.play('grenade_throw', e.actor === p ? {} : { pos: e.actor.pos });
          break;
        case 'bounce':
          if (this.isNearCam(e.pos, 25)) audio.play('bounce', { pos: e.pos, volume: 0.6 });
          break;
        case 'pickup':
          if (e.actor === p) {
            const map: Record<string, SfxName> = { health: 'pickup_health', ammo: 'pickup_ammo', boomer: 'pickup_weapon', zapper: 'pickup_weapon', overcharge: 'pickup_power' };
            audio.play(map[e.kind]);
            const names: Record<string, string> = { health: '+50 Health', ammo: 'Ammo + Splat Bomb', boomer: `Got the ${th.weaponNames?.boomer ?? 'Boomer'}!`, zapper: `Got the ${th.weaponNames?.zapper ?? 'Zapper'}!`, overcharge: 'OVERCHARGE! Double damage!' };
            hud.toastMsg(names[e.kind]);
            if (e.kind === 'overcharge') { this.pipeline.flashColor.setRGB(1, 0.4, 1); this.pipeline.flashAmt = 0.35; }
          }
          break;
        case 'flag': {
          if (!playing) break;
          const mineTeam = p ? p.team : 0;
          const ours = e.team === mineTeam;
          const who = e.actor ? e.actor.name : '';
          const col = tc(e.team === 0 ? 1 : 0);
          if (e.action === 'taken') { hud.message(ours ? 'YOUR FLAG WAS TAKEN!' : `${who} HAS THE FLAG!`, false, ours ? '#ff5a5a' : col); audio.play('flag_taken'); }
          if (e.action === 'captured') { hud.message(ours ? 'ENEMY CAPTURED YOUR FLAG!' : `${who} CAPTURED THE FLAG!`, true, ours ? '#ff5a5a' : col); audio.play('flag_captured'); }
          if (e.action === 'returned') { hud.toastMsg(`${ours ? 'Your' : 'Enemy'} flag returned${who ? ` by ${who}` : ''}`); audio.play('flag_returned'); }
          if (e.action === 'dropped') { hud.toastMsg(`${ours ? 'Your' : 'Enemy'} flag dropped!`); audio.play('flag_dropped'); }
          break;
        }
        case 'duck':
          if (playing) {
            const mine = e.actor && p && e.actor.team === p.team;
            if (e.action === 'taken') { hud.message(e.actor === p ? 'YOU GOT THE DUCK! 🦆' : mine ? `${e.actor!.name} GOT THE DUCK!` : `${e.actor!.name} STOLE THE DUCK!`, false, mine ? tc(p!.team) : tc(e.actor!.team)); audio.play('flag_taken'); }
            if (e.action === 'dropped') { hud.toastMsg('The duck was dropped!'); audio.play('flag_dropped'); }
            if (e.action === 'reset') { hud.toastMsg('The duck returned to the centre'); audio.play('flag_returned'); }
          }
          break;
        case 'zone':
          if (playing) {
            hud.message(e.team === (p?.team ?? 0) ? 'ZONE CAPTURED!' : 'ENEMY TOOK THE ZONE!', false, tc(e.team));
            audio.play('zone_capture');
          }
          break;
        case 'round':
          if (playing) {
            const t = e.team;
            hud.message(t === -2 ? 'ROUND DRAW' : t === (p?.team ?? 0) ? 'ROUND WON!' : 'ROUND LOST', true, t >= 0 ? tc(t) : '#fff');
            audio.play(t === (p?.team ?? 0) ? 'zone_capture' : 'flag_dropped');
          }
          break;
        case 'spawn':
          if (e.actor === p) {
            audio.play('respawn', { volume: 0.7 });
            this.camYaw = p.yaw;
            this.lastWeapon = '';
          }
          break;
        case 'end':
          if (playing) this.beginEnd(e.winner);
          break;
      }
    }
    m.events.length = 0;
    // reload done sound
    if (p) {
      const rl = p.reloadT > 0;
      if (this.wasReloading && !rl && p.alive) audio.play('reload_done', { volume: 0.7 });
      this.wasReloading = rl;
    }
    // music intensity: last minute or close score
    if (this.state === 'playing') {
      const close = m.mode.scoreLimit - Math.max(m.score[0], m.score[1]) <= Math.max(2, m.mode.scoreLimit * 0.15);
      audio.setMusicIntensity(m.timeLeft < 60 || close ? 1 : 0.6);
    }
  }

  private isNearCam(p: THREE.Vector3, r: number) {
    return this.camera.position.distanceToSquared(p) < r * r;
  }

  // ------------------------------------------------------------------ end of match
  private beginEnd(winner: number) {
    const m = this.match!;
    const p = m.player;
    this.setState('ended');
    this.input.exitLock();
    this.touch.setActive(false);
    this.vm!.setHidden(true);
    this.endT = 0;
    this.endShown = false;
    const won = p ? winner === p.team : false;
    this.hud.message(winner === -1 ? 'DRAW!' : won ? 'VICTORY!' : 'DEFEAT!', true, winner === -1 ? '#fff' : won ? '#ffd23f' : '#ff5a5a', winner === -1 ? '' : `${winner === 0 ? 'BLUE' : 'RED'} TEAM WINS`);
    audio.play(won ? 'victory' : 'defeat');
    audio.stopMusic(2);
    // winners dance
    for (const a of m.actors) {
      if (a.model && (a.team === winner || winner === -1)) {
        if (!a.alive) m.spawn(a);
        a.model.dance = 0.001;
        a.model.root.visible = true;
      }
    }
  }

  private updateEnd(dt: number, m: Match) {
    this.endT += dt;
    if (this.endT > 4 && !this.endShown) {
      this.endShown = true;
      this.onMatchEnd?.(this.buildSummary(m));
    }
  }

  private buildSummary(m: Match): MatchSummary {
    const p = m.player;
    const xp: { label: string; value: number }[] = [];
    let won = false;
    if (p) {
      const s = p.stats;
      won = m.winner === p.team;
      if (s.kills) xp.push({ label: `Splats ×${s.kills}`, value: s.kills * 100 });
      if (s.assists) xp.push({ label: `Assists ×${s.assists}`, value: s.assists * 50 });
      if (s.headshots) xp.push({ label: `Headshots ×${s.headshots}`, value: s.headshots * 25 });
      if (s.caps) xp.push({ label: `Flag captures ×${s.caps}`, value: s.caps * 300 });
      if (s.returns) xp.push({ label: `Flag returns ×${s.returns}`, value: s.returns * 80 });
      if (s.zoneTime > 1) xp.push({ label: `Zone time ${Math.round(s.zoneTime)}s`, value: Math.round(s.zoneTime * 4) });
      if (s.bestStreak >= 3) xp.push({ label: `Best streak ${s.bestStreak}`, value: s.bestStreak * 40 });
      xp.push({ label: won ? 'Victory bonus' : m.winner === -1 ? 'Draw bonus' : 'Match played', value: won ? 600 : m.winner === -1 ? 350 : 200 });
      if (m.mvp === p) xp.push({ label: 'MVP!', value: 250 });
      const t = m.tally;
      t.won = won;
      t.bestStreak = s.bestStreak;
      t.caps = s.caps;
      t.zoneTime = s.zoneTime;
      const completed = applyTally(t);
      for (const c of completed) xp.push({ label: `Challenge: ${c}`, value: CHALLENGE_XP });
      this.lastChallenges = completed;
      const diffBonus = [0.8, 1, 1.25, 1.5][m.cfg.difficulty] ?? 1;
      if (diffBonus !== 1) xp.push({ label: `Difficulty ×${diffBonus}`, value: 0 });
      let total = xp.reduce((a, b) => a + b.value, 0);
      total = Math.round(total * diffBonus);
      profile.matches++;
      if (won) { profile.wins++; profile.worldWins[m.cfg.world] = (profile.worldWins[m.cfg.world] ?? 0) + 1; }
      profile.kills += s.kills;
      profile.deaths += s.deaths;
      profile.headshots += s.headshots;
      profile.caps += s.caps;
      profile.bestStreak = Math.max(profile.bestStreak, s.bestStreak);
      profile.playTime += m.time;
      saveProfile();
      const lv = addXp(total);
      return { cfg: m.cfg, winner: m.winner, score: [...m.score] as [number, number], player: p, actors: m.actors, mvp: m.mvp, xp, xpTotal: total, levelsGained: lv.gained, unlocked: lv.unlocked, challenges: this.lastChallenges };
    }
    return { cfg: m.cfg, winner: m.winner, score: [...m.score] as [number, number], player: null, actors: m.actors, mvp: m.mvp, xp, xpTotal: 0, levelsGained: [], unlocked: [], challenges: [] };
  }

  // ------------------------------------------------------------------ camera
  private updateCamera(dt: number, m: Match) {
    const cam = this.camera;
    const p = m.player;
    let targetFov = settings.fov;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const shakeAmt = settings.screenShake ? this.shake * this.shake : 0;
    if (this.state === 'menu' || (this.state === 'ended' && !p)) {
      this.spectatorCam(dt, m);
      targetFov = 70;
    } else if (this.state === 'ended') {
      // orbit the MVP / player
      const focus = (m.mvp && m.mvp.alive ? m.mvp : p) ?? m.actors[0];
      const a = this.time * 0.35;
      this.camPos.set(focus.pos.x + Math.sin(a) * 5.5, focus.pos.y + 2.6, focus.pos.z + Math.cos(a) * 5.5);
      m.col.pushOut(this.camPos, 0.3, 0.1, 0);
      cam.position.lerp(this.camPos, 1 - Math.exp(-dt * 4));
      cam.lookAt(focus.pos.x, focus.pos.y + 1.2, focus.pos.z);
      targetFov = 60;
      this.pipeline.desat = damp(this.pipeline.desat, 0, 3, dt);
    } else if (p && p.alive) {
      // recoil recovery
      this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);
      this.recoilYaw = damp(this.recoilYaw, 0, 9, dt);
      const bob = p.onGround ? Math.sin(this.time * 11 * (p.horizSpeed() / 7)) * 0.03 * Math.min(1, p.horizSpeed() / 7) : 0;
      cam.position.set(p.pos.x, p.pos.y + EYE + bob, p.pos.z);
      cam.rotation.set(p.pitch + this.recoilPitch + (Math.random() - 0.5) * shakeAmt * 0.05, p.yaw + this.recoilYaw + (Math.random() - 0.5) * shakeAmt * 0.05, (Math.random() - 0.5) * shakeAmt * 0.02);
      if (p.aiming) targetFov = p.weapon.def.zoomFov ?? settings.fov * 0.8;
      else if (p.wantSprint && p.wish.y > 0.3 && p.onGround) targetFov = settings.fov + 6;
      this.pipeline.desat = damp(this.pipeline.desat, 0, 6, dt);
      this.vm!.setHidden(p.aiming && !!p.weapon.def.zoomFov);
      const rl = p.reloadT > 0 ? 1 - p.reloadT / p.weapon.def.reload : 0;
      this.vm!.update({
        dt, speed: p.horizSpeed(), onGround: p.onGround, sprint: p.wantSprint && p.wish.y > 0.3, aiming: p.aiming,
        reloading: rl, switching: p.switchT > 0 ? p.switchT / 0.32 : 0, lookDX: this.input.lookDX, lookDY: this.input.lookDY, vy: p.vel.y,
      });
      this.vm!.muzzleWorld(m.playerMuzzle);
      if (p.overcharge > 0) { this.pipeline.flashColor.setRGB(0.6, 0.1, 0.6); this.pipeline.flashAmt = Math.max(this.pipeline.flashAmt, 0.06); }
    } else if (p) {
      // kill cam (then spectate a teammate when there are no respawns)
      this.vm!.setHidden(true);
      let k = p.killer && p.killer.alive ? p.killer : null;
      if (!m.mode.respawn && m.time - p.deathTime > 3.5) {
        const mate = m.actors.find((a) => a.team === p.team && a.alive);
        if (mate) k = mate;
      }
      const focus = k ? k.pos : p.pos;
      const a = this.time * 0.4;
      this.camPos.set(focus.x + Math.sin(a) * 4.5, focus.y + 2.8, focus.z + Math.cos(a) * 4.5);
      m.col.pushOut(this.camPos, 0.3, 0.1, 0);
      const t = m.time - p.deathTime;
      if (t < 0.1) cam.position.set(p.pos.x, p.pos.y + EYE, p.pos.z);
      cam.position.lerp(this.camPos, 1 - Math.exp(-dt * 3));
      cam.lookAt(focus.x, focus.y + 1.2, focus.z);
      this.pipeline.desat = damp(this.pipeline.desat, 0.65, 4, dt);
      targetFov = 65;
    }
    this.fov = damp(this.fov, targetFov, 12, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    audio.setListener(cam.position, cam.rotation.y);
  }

  private spectatorCam(dt: number, m: Match) {
    const cam = this.camera;
    this.specT -= dt;
    if (!this.specTarget || !this.specTarget.alive || this.specT <= 0) {
      const alive = m.actors.filter((a) => a.alive);
      // prefer someone in a fight
      alive.sort((a, b) => (b.lastFireTime - a.lastFireTime));
      this.specTarget = alive[Math.floor(Math.random() * Math.min(3, alive.length))] ?? null;
      this.specT = rand(5, 8);
      this.specMode = Math.random() < 0.3 ? 1 : 0;
    }
    const t = this.specTarget;
    if (!t) return;
    if (this.specMode === 0) {
      // chase cam behind the bot
      const fx = -Math.sin(t.yaw), fz = -Math.cos(t.yaw);
      this.camPos.set(t.pos.x - fx * 4.2 + Math.cos(t.yaw) * 1.2, t.pos.y + 2.3, t.pos.z - fz * 4.2 - Math.sin(t.yaw) * 1.2);
      m.col.pushOut(this.camPos, 0.35, 0.1, 0);
      this.camLook.set(t.pos.x + fx * 6, t.pos.y + 1.3, t.pos.z + fz * 6);
    } else {
      // sweeping orbit
      const a = this.time * 0.25;
      this.camPos.set(t.pos.x + Math.sin(a) * 7, t.pos.y + 3.5, t.pos.z + Math.cos(a) * 7);
      m.col.pushOut(this.camPos, 0.35, 0.1, 0);
      this.camLook.set(t.pos.x, t.pos.y + 1.2, t.pos.z);
    }
    if (cam.position.distanceTo(this.camPos) > 25) cam.position.copy(this.camPos);
    cam.position.lerp(this.camPos, 1 - Math.exp(-dt * 3));
    const look = new THREE.Vector3();
    cam.getWorldDirection(look);
    const want = this.camLook.clone().sub(cam.position).normalize();
    look.lerp(want, 1 - Math.exp(-dt * 4));
    cam.lookAt(cam.position.clone().add(look));
  }
}
