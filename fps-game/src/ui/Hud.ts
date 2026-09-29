import * as THREE from 'three';
import type { Match, MatchEvent } from '../game/Match';
import type { Actor } from '../entities/Actor';
import { WEAPONS, WEAPON_ORDER } from '../entities/Weapons';
import { CTF, KOTH, Elimination, DuckMode } from '../modes/Modes';
import { formatTime, hexToCss, randomTip } from '../core/utils';
import { settings } from '../core/Settings';

const WEAPON_ICON: Record<string, string> = {
  blaster: '🔫', scatter: '💥', boomer: '🚀', zapper: '⚡', grenade: '💣', bonk: '👊', void: '🕳️', world: '💫',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

interface DmgNum { el: HTMLDivElement; pos: THREE.Vector3; life: number }
interface DirInd { el: HTMLDivElement; from: THREE.Vector3; life: number }

export class Hud {
  root: HTMLDivElement;
  private scoreB: HTMLSpanElement;
  private scoreR: HTMLSpanElement;
  private nameB: HTMLSpanElement;
  private nameR: HTMLSpanElement;
  private barB: HTMLDivElement;
  private barR: HTMLDivElement;
  private timer: HTMLDivElement;
  private objective: HTMLDivElement;
  private modeTag: HTMLDivElement;
  private killfeed: HTMLDivElement;
  private chat: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private hitmarker: HTMLDivElement;
  private center: HTMLDivElement;
  private sub: HTMLDivElement;
  private toast: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpNum: HTMLSpanElement;
  private hpBox: HTMLDivElement;
  private oc: HTMLDivElement;
  private wName: HTMLDivElement;
  private ammoMag: HTMLSpanElement;
  private ammoRes: HTMLSpanElement;
  private slots: HTMLDivElement[] = [];
  private nades: HTMLDivElement;
  private reloadBar: HTMLDivElement;
  private scope: HTMLDivElement;
  private respawn: HTMLDivElement;
  private scoreboard: HTMLDivElement;
  private minimap: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private mapImg: HTMLCanvasElement | null = null;
  private dmgLayer: HTMLDivElement;
  private dmgNums: DmgNum[] = [];
  private dirLayer: HTMLDivElement;
  private dirs: DirInd[] = [];
  private flagInfo: HTMLDivElement;
  private carry: HTMLDivElement;
  private fps: HTMLDivElement;
  private vignette: HTMLDivElement;
  private cache = new Map<string, string>();
  private hitT = 0;
  private centerT = 0;
  private toastT = 0;
  private mapT = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private lowHpPulse = 0;
  teamColors: [string, string] = ['#2d7dff', '#ff3b3b'];

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud hidden', parent);
    const top = el('div', 'hud-top', this.root);
    const sb = el('div', 'scorebar', top);
    const tb = el('div', 'team blue', sb);
    this.nameB = el('span', 'tname', tb, 'BLUE');
    this.scoreB = el('span', 'tscore', tb, '0');
    const mid = el('div', 'mid', sb);
    this.timer = el('div', 'timer', mid, '5:00');
    this.modeTag = el('div', 'modetag', mid, '');
    const tr = el('div', 'team red', sb);
    this.scoreR = el('span', 'tscore', tr, '0');
    this.nameR = el('span', 'tname', tr, 'RED');
    const bars = el('div', 'scorebars', top);
    this.barB = el('div', 'bar blue', el('div', 'track', bars));
    this.barR = el('div', 'bar red', el('div', 'track', bars));
    this.objective = el('div', 'objective', top);
    this.flagInfo = el('div', 'flaginfo', top);

    this.minimap = el('canvas', 'minimap', this.root);
    this.minimap.width = this.minimap.height = 176;
    this.mctx = this.minimap.getContext('2d')!;
    this.killfeed = el('div', 'killfeed', this.root);
    this.chat = el('div', 'chat', this.root);

    this.crosshair = el('div', 'crosshair', this.root, '<i class="l"></i><i class="r"></i><i class="t"></i><i class="b"></i><i class="d"></i>');
    this.hitmarker = el('div', 'hitmarker', this.root, '<i></i><i></i><i></i><i></i>');
    this.dirLayer = el('div', 'dirlayer', this.root);
    this.dmgLayer = el('div', 'dmglayer', this.root);
    this.center = el('div', 'centermsg', this.root);
    this.sub = el('div', 'submsg', this.root);
    this.toast = el('div', 'toast', this.root);
    this.carry = el('div', 'carry', this.root, '🚩 YOU HAVE THE FLAG — RUN HOME!');

    this.hpBox = el('div', 'hpbox', this.root);
    el('div', 'portrait', this.hpBox, '<span>♥</span>');
    const hpCol = el('div', 'hpcol', this.hpBox);
    const hpBar = el('div', 'hpbar', hpCol);
    this.hpFill = el('div', 'fill', hpBar);
    this.hpNum = el('span', 'hpnum', this.hpBox, '100');
    this.oc = el('div', 'overcharge', hpCol, '');

    const ab = el('div', 'ammobox', this.root);
    this.wName = el('div', 'wname', ab, 'Blaster');
    const ar = el('div', 'ammorow', ab);
    this.ammoMag = el('span', 'mag', ar, '30');
    el('span', 'sep', ar, '/');
    this.ammoRes = el('span', 'res', ar, '120');
    this.reloadBar = el('div', 'reloadbar', ab, '<i></i>');
    const slots = el('div', 'slots', ab);
    WEAPON_ORDER.forEach((id, i) => {
      const s = el('div', 'slot', slots, `<b>${i + 1}</b>${WEAPON_ICON[id]}`);
      this.slots.push(s);
    });
    this.nades = el('div', 'nades', slots, '💣×2');

    this.scope = el('div', 'scope', this.root, '<div class="lens"></div>');
    this.respawn = el('div', 'respawn', this.root);
    this.scoreboard = el('div', 'scoreboard', this.root);
    this.fps = el('div', 'fps', this.root);
    this.vignette = el('div', 'hurtvig', this.root);
    this.hintEl = el('div', 'hint', this.root);
    this.markerLayer = el('div', 'markers', this.root);
    this.shieldEl = el('div', 'shield', this.root, '🛡️ SPAWN SHIELD');
  }
  private hintEl: HTMLDivElement;
  private markerLayer!: HTMLDivElement;
  private markers: HTMLDivElement[] = [];
  private shieldEl: HTMLDivElement;
  private hintT = 0;

  hint(text: string, seconds = 6) {
    if (!text) return;
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    this.hintT = seconds;
  }

  show(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  setTheme(hudClass: string, teams: [number, number], names: [string, string]) {
    document.body.className = document.body.className.replace(/\bhud-\w+\b/g, '').trim() + ' ' + hudClass;
    this.teamColors = [hexToCss(teams[0]), hexToCss(teams[1])];
    this.root.style.setProperty('--blue', this.teamColors[0]);
    this.root.style.setProperty('--red', this.teamColors[1]);
    document.body.style.setProperty('--blue', this.teamColors[0]);
    document.body.style.setProperty('--red', this.teamColors[1]);
    this.nameB.textContent = names[0].toUpperCase();
    this.nameR.textContent = names[1].toUpperCase();
  }

  reset() {
    this.killfeed.innerHTML = '';
    this.chat.innerHTML = '';
    this.center.classList.remove('show');
    this.sub.classList.remove('show');
    this.mapImg = null;
    this.dmgNums.forEach((d) => d.el.remove());
    this.dmgNums = [];
    this.dirs.forEach((d) => d.el.remove());
    this.dirs = [];
    this.cache.clear();
  }

  /** Set a style property only when it changes (DOM writes are costly on phones). */
  private sty(key: string, e: HTMLElement, prop: string, v: string) {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    e.style.setProperty(prop, v);
  }

  private set(key: string, e: HTMLElement, v: string, html = false) {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    if (html) e.innerHTML = v;
    else e.textContent = v;
  }

  message(text: string, big = true, color?: string, sub?: string) {
    this.center.textContent = text;
    this.center.style.color = color ?? '';
    this.center.classList.remove('show');
    void this.center.offsetWidth;
    this.center.classList.add('show');
    this.center.classList.toggle('small', !big);
    this.centerT = big ? 2.2 : 1.8;
    if (sub !== undefined) {
      this.sub.textContent = sub;
      this.sub.classList.add('show');
    } else this.sub.classList.remove('show');
  }

  toastMsg(text: string) {
    this.toast.textContent = text;
    this.toast.classList.remove('show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    this.toastT = 1.6;
  }

  hit(kill: boolean, head: boolean) {
    this.hitmarker.classList.remove('show', 'kill', 'head');
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('show');
    if (kill) this.hitmarker.classList.add('kill');
    if (head) this.hitmarker.classList.add('head');
    this.hitT = 0.25;
  }

  damageNumber(pos: THREE.Vector3, amount: number, head: boolean, kill: boolean) {
    if (!settings.damageNumbers) return;
    const e = el('div', 'dmgnum' + (head ? ' head' : '') + (kill ? ' kill' : ''), this.dmgLayer, String(Math.round(amount)));
    this.dmgNums.push({ el: e, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6)), life: 0.9 });
    if (this.dmgNums.length > 14) this.dmgNums.shift()!.el.remove();
  }

  damageFrom(from: THREE.Vector3) {
    const e = el('div', 'dmgdir', this.dirLayer, '<i></i>');
    this.dirs.push({ el: e, from: from.clone(), life: 1.2 });
    if (this.dirs.length > 6) this.dirs.shift()!.el.remove();
    this.vignette.classList.remove('flash');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('flash');
  }

  kill(e: Extract<MatchEvent, { type: 'kill' }>, player: Actor | null) {
    const k = e.killer;
    const v = e.victim;
    const c = (a: Actor) => this.teamColors[a.team];
    const icon = WEAPON_ICON[e.weapon] ?? '💫';
    const row = el('div', 'kf' + ((k && k === player) || v === player ? ' me' : ''), undefined);
    const head = e.head ? '<span class="hs">🎯</span>' : '';
    row.innerHTML = k
      ? `<span style="color:${c(k)}">${esc(k.name)}</span><span class="wi">${icon}${head}</span><span style="color:${c(v)}">${esc(v.name)}</span>`
      : `<span class="wi">${icon}</span><span style="color:${c(v)}">${esc(v.name)}</span><span class="env">${e.env === 'void' ? 'fell off' : 'splatted'}</span>`;
    this.killfeed.prepend(row);
    while (this.killfeed.children.length > 5) this.killfeed.lastChild?.remove();
    setTimeout(() => row.classList.add('fade'), 5000);
    setTimeout(() => row.remove(), 5600);
  }

  chatLine(a: Actor, text: string) {
    const row = el('div', 'chatline', undefined, `<b style="color:${this.teamColors[a.team]}">${esc(a.name)}:</b> ${esc(text)}`);
    this.chat.appendChild(row);
    while (this.chat.children.length > 4) this.chat.firstChild?.remove();
    setTimeout(() => row.classList.add('fade'), 4500);
    setTimeout(() => row.remove(), 5000);
  }

  /** Per-frame update. */
  update(dt: number, m: Match, cam: THREE.PerspectiveCamera, opts: { spectating: boolean; aiming: boolean; fps: number }) {
    const p = m.player;
    this.set('sb', this.scoreB, String(m.score[0]));
    this.set('sr', this.scoreR, String(m.score[1]));
    const lim = m.mode.scoreLimit;
    this.sty('barB', this.barB, 'width', `${Math.min(100, (m.score[0] / lim) * 100)}%`);
    this.sty('barR', this.barR, 'width', `${Math.min(100, (m.score[1] / lim) * 100)}%`);
    const tl = m.state === 'countdown' ? m.timeLeft : m.timeLeft;
    this.set('timer', this.timer, formatTime(tl));
    this.timer.classList.toggle('urgent', tl < 30 && m.state === 'playing');
    this.set('mode', this.modeTag, `${m.mode.info.short} · ${lim}`);
    const obj = m.mode.objective(m);
    let objText = obj.status;
    if (obj.zone) {
      const z = obj.zone;
      objText = z.contested ? '⚔️ ZONE CONTESTED' : z.owner < 0 ? (z.progress > 0 ? `Capturing ${Math.round(z.progress * 100)}%` : 'Zone neutral — take it!') : `${z.owner === 0 ? 'BLUE' : 'RED'} holds the zone`;
      this.objective.style.color = z.contested ? '#ffd23f' : z.owner < 0 ? '' : this.teamColors[z.owner];
    } else this.objective.style.color = '';
    if (obj.alive) objText = `Round ${obj.round} · Alive ${obj.alive[0]} v ${obj.alive[1]}`;
    if (obj.duck) this.objective.style.color = obj.duck.team >= 0 ? this.teamColors[obj.duck.team] : '#ffd23f';
    this.set('obj', this.objective, objText);
    if (obj.flags) {
      this.flagInfo.style.display = '';
      this.set('flags', this.flagInfo, `<span style="color:${this.teamColors[0]}">🚩 ${esc(obj.flags[0])}</span><span style="color:${this.teamColors[1]}">🚩 ${esc(obj.flags[1])}</span>`, true);
    } else this.flagInfo.style.display = 'none';

    if (this.centerT > 0) {
      this.centerT -= dt;
      if (this.centerT <= 0) { this.center.classList.remove('show'); this.sub.classList.remove('show'); }
    }
    if (m.state === 'countdown') {
      const c = Math.ceil(m.countdown - 0.5);
      if (c > 0) this.set('cd', this.center, String(c));
      this.center.classList.add('show');
      this.center.classList.remove('small');
      this.centerT = 0.3;
    }

    this.root.classList.toggle('ended', m.state === 'ended');
    const alive = !!p && p.alive && !opts.spectating;
    this.root.classList.toggle('dead', !alive);
    document.body.classList.toggle('p-dead', !alive && !!p && m.state !== 'ended');
    this.root.classList.toggle('cm', this.center.classList.contains('show'));
    this.root.classList.toggle('spectate', opts.spectating);
    if (p) {
      const hp = Math.max(0, Math.ceil(p.health));
      this.set('hp', this.hpNum, String(hp));
      this.sty('hpw', this.hpFill, 'width', `${Math.min(100, hp)}%`);
      this.hpBox.classList.toggle('low', hp <= 30);
      this.hpBox.classList.toggle('over', hp > 100);
      this.set('oc', this.oc, p.overcharge > 0 ? `⚡ OVERCHARGE ${Math.ceil(p.overcharge)}s` : '');
      const w = p.weapon;
      const wn = m.world.theme.weaponNames?.[w.def.id] ?? w.def.name;
      this.set('wn', this.wName, wn);
      const inf = m.infinite || m.instagib;
      this.set('mag', this.ammoMag, inf ? '∞' : String(w.mag));
      this.set('res', this.ammoRes, inf ? '∞' : String(w.reserve));
      this.ammoMag.classList.toggle('empty', w.mag === 0);
      this.ammoMag.classList.toggle('low', w.mag > 0 && w.mag <= w.def.mag * 0.25);
      if (p.reloadT > 0) {
        this.reloadBar.style.display = 'block';
        (this.reloadBar.firstChild as HTMLElement).style.width = `${(1 - p.reloadT / w.def.reload) * 100}%`;
      } else this.reloadBar.style.display = 'none';
      this.slots.forEach((s, i) => {
        s.classList.toggle('owned', p.slots[i].owned);
        s.classList.toggle('active', p.cur === i);
      });
      this.set('nades', this.nades, `💣×${p.grenades}`);
      // crosshair spread
      const def = w.def;
      let spread = opts.aiming ? def.aimSpread : def.spread;
      if (!p.onGround) spread *= 1.6;
      else if (p.horizSpeed() > 2 && !opts.aiming) spread *= 1.25;
      const px = (spread / ((cam.fov * Math.PI) / 360)) * (window.innerHeight / 2);
      this.sty('gap', this.crosshair, '--gap', `${Math.round(Math.max(4, Math.min(80, px + 4)))}px`);
      this.crosshair.classList.toggle('scatter', def.id === 'scatter');
      this.crosshair.dataset.style = String(settings.crosshair);
      this.crosshair.classList.toggle('hidden', opts.aiming && def.id === 'zapper');
      this.scope.classList.toggle('show', opts.aiming && def.id === 'zapper' && alive);
      this.carry.classList.toggle('show', p.carrying >= 0 && alive);
      if (p.carrying >= 0) this.set('carry', this.carry, m.mode instanceof DuckMode ? '🦆 YOU HAVE THE DUCK — STAY ALIVE!' : '🚩 YOU HAVE THE FLAG — RUN HOME!');
      // respawn overlay
      if (!p.alive && m.state !== 'ended') {
        const k = p.killer;
        const elim = m.mode instanceof Elimination;
        const t = Math.max(0, Math.ceil(p.respawnTimer));
        const html = `<div class="rs-title">${k ? `SPLATTED BY <span style="color:${this.teamColors[k.team]}">${esc(k.name)}</span>` : 'SPLATTED!'}</div>` +
          (k ? `<div class="rs-sub">${k.health > 0 ? `${esc(k.name)} has ${Math.ceil(k.health)} HP left` : ''}</div>` : '') +
          `<div class="rs-count">${elim ? 'Spectating until next round…' : m.state === 'playing' ? `Respawning in ${t}` : ''}</div>` +
          `<div class="rs-tip">💡 ${esc(this.tipFor(p.deathTime, m))}</div>`;
        this.set('rs', this.respawn, html, true);
        this.respawn.classList.add('show');
      } else this.respawn.classList.remove('show');
    }

    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) this.hitmarker.classList.remove('show');
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.classList.remove('show');
    }
    this.shieldEl.classList.toggle('show', !!p && p.alive && p.spawnShield > 0 && m.state === 'playing');
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast.classList.remove('show');
    }

    // damage numbers
    const w2 = window.innerWidth / 2, h2 = window.innerHeight / 2;
    const v = new THREE.Vector3();
    this.dmgNums = this.dmgNums.filter((d) => {
      d.life -= dt;
      if (d.life <= 0) { d.el.remove(); return false; }
      d.pos.y += dt * 1.2;
      v.copy(d.pos).project(cam);
      if (v.z > 1) { d.el.style.opacity = '0'; return true; }
      d.el.style.transform = `translate(${v.x * w2 + w2}px, ${-v.y * h2 + h2}px) translate(-50%,-50%) scale(${0.8 + d.life * 0.4})`;
      d.el.style.opacity = String(Math.min(1, d.life * 2.5));
      return true;
    });
    // damage direction
    if (p) {
      this.dirs = this.dirs.filter((d) => {
        d.life -= dt;
        if (d.life <= 0) { d.el.remove(); return false; }
        const ang = Math.atan2(d.from.x - p.pos.x, d.from.z - p.pos.z);
        const rel = ang - (p.yaw + Math.PI);
        d.el.style.transform = `translate(-50%,-50%) rotate(${-rel}rad)`;
        d.el.style.opacity = String(Math.min(1, d.life * 1.5));
        return true;
      });
      this.lowHpPulse += dt;
      this.vignette.classList.toggle('low', p.alive && p.health <= 30);
    }

    this.updateMarkers(m, cam, alive);

    // minimap @ ~20fps
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 0.05;
      this.drawMinimap(m, cam);
    }
    // fps
    if (settings.showFps) {
      this.fpsAcc += opts.fps;
      this.fpsN++;
      if (this.fpsN >= 20) {
        this.fps.textContent = `${Math.round(this.fpsAcc / this.fpsN)} fps`;
        this.fpsAcc = this.fpsN = 0;
      }
      this.fps.style.display = 'block';
    } else this.fps.style.display = 'none';
  }

  /** Objective markers (flags, zone, duck) projected to screen and clamped to the edges. */
  private updateMarkers(m: Match, cam: THREE.PerspectiveCamera, alive: boolean) {
    const list: { pos: THREE.Vector3; icon: string; color: string; label: string }[] = [];
    const p = m.player;
    if (alive && p && m.state !== 'ended') {
      const my = p.team, en = my === 0 ? 1 : 0;
      if (m.mode instanceof CTF) {
        const fe = m.mode.flags[en], fo = m.mode.flags[my];
        if (p.carrying >= 0) list.push({ pos: fo.home, icon: '🏠', color: this.teamColors[my], label: 'HOME' });
        else if (!fe.carrier || fe.carrier !== p) list.push({ pos: fe.pos, icon: '🚩', color: this.teamColors[en], label: fe.carrier ? 'ESCORT' : 'TAKE' });
        if (!fo.atHome) list.push({ pos: fo.pos, icon: '🚩', color: this.teamColors[my], label: fo.carrier ? 'STOLEN' : 'RETURN' });
      } else if (m.mode instanceof KOTH) {
        const z = m.mode;
        list.push({ pos: z.center, icon: '👑', color: z.owner < 0 ? '#ffffff' : this.teamColors[z.owner], label: z.contested ? 'FIGHT' : z.owner === my ? 'HOLD' : 'TAKE' });
      } else if (m.mode instanceof DuckMode) {
        const d = m.mode;
        if (d.carrier !== p) list.push({ pos: d.pos, icon: '🦆', color: d.carrier ? this.teamColors[d.carrier.team] : '#ffd23f', label: !d.carrier ? 'GRAB' : d.carrier.team === my ? 'GUARD' : 'CHASE' });
      }
    }
    while (this.markers.length < list.length) this.markers.push(el('div', 'marker', this.markerLayer));
    const W = window.innerWidth, H = window.innerHeight;
    const v = new THREE.Vector3();
    this.markers.forEach((mk, i) => {
      const it = list[i];
      if (!it) { mk.style.display = 'none'; return; }
      mk.style.display = '';
      v.set(it.pos.x, it.pos.y + 2.6, it.pos.z).project(cam);
      let x = v.x, y = v.y;
      const behind = v.z > 1;
      if (behind) { x = -x; y = -y; }
      const margin = 0.88;
      const off = behind || Math.abs(x) > margin || Math.abs(y) > margin;
      if (off) {
        const k = margin / Math.max(Math.abs(x), Math.abs(y), 1e-3);
        x *= k; y *= k;
        if (behind && Math.abs(y) < margin * 0.9) y = -margin; // behind you: stick to bottom edge
      }
      const dist = Math.round(cam.position.distanceTo(it.pos));
      const html = `<b style="--mc:${it.color}">${it.icon}</b><span>${it.label} · ${dist}m</span>`;
      if (mk.dataset.h !== html) { mk.innerHTML = html; mk.dataset.h = html; }
      mk.classList.toggle('edge', off);
      mk.style.transform = `translate(${(x * 0.5 + 0.5) * W}px, ${(-y * 0.5 + 0.5) * H}px) translate(-50%, -50%)`;
    });
  }

  private buildMapImage(m: Match) {
    const nav = m.world.nav;
    const c = document.createElement('canvas');
    c.width = nav.w;
    c.height = nav.h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(nav.w, nav.h);
    let minH = Infinity, maxH = -Infinity;
    for (let i = 0; i < nav.walk.length; i++) if (nav.walk[i]) { minH = Math.min(minH, nav.height[i]); maxH = Math.max(maxH, nav.height[i]); }
    for (let i = 0; i < nav.walk.length; i++) {
      const h = nav.height[i];
      let r = 20, gg = 20, b = 35, a = 200;
      if (nav.walk[i]) {
        const t = maxH > minH ? (h - minH) / (maxH - minH) : 0;
        r = 120 + t * 90; gg = 128 + t * 90; b = 150 + t * 80; a = 230;
      } else if (h > -1e9 && h > m.killY + 1) {
        r = 45; gg = 45; b = 70; a = 240;
      } else { a = 90; }
      img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = a;
    }
    g.putImageData(img, 0, 0);
    this.mapImg = c;
  }

  private drawMinimap(m: Match, cam: THREE.PerspectiveCamera) {
    if (!this.mapImg) this.buildMapImage(m);
    const g = this.mctx;
    const S = this.minimap.width;
    const nav = m.world.nav;
    const scale = 2.1; // px per meter
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(10,12,30,0.75)';
    g.fillRect(0, 0, S, S);
    const cx = cam.position.x, cz = cam.position.z;
    const yaw = m.player && m.player.alive ? m.player.yaw : Math.atan2(-(cam.getWorldDirection(new THREE.Vector3()).x), -(cam.getWorldDirection(new THREE.Vector3()).z));
    g.translate(S / 2, S / 2);
    g.rotate(yaw);
    g.scale(scale, scale);
    g.translate(-cx, -cz);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.mapImg!, nav.ox, nav.oz, nav.w * nav.cs, nav.h * nav.cs);
    // zone
    if (m.mode instanceof KOTH) {
      const z = m.mode;
      g.strokeStyle = z.owner < 0 ? '#ffffff' : this.teamColors[z.owner];
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(z.center.x, z.center.z, z.radius, 0, Math.PI * 2);
      g.stroke();
    }
    if (m.mode instanceof CTF) {
      m.mode.flags.forEach((f, i) => {
        g.fillStyle = this.teamColors[i];
        g.beginPath();
        g.moveTo(f.pos.x, f.pos.z - 2.6);
        g.lineTo(f.pos.x + 2.4, f.pos.z - 1.6);
        g.lineTo(f.pos.x, f.pos.z - 0.6);
        g.fill();
        g.fillRect(f.pos.x - 0.25, f.pos.z - 2.6, 0.5, 3);
      });
    }
    if (m.mode instanceof DuckMode) {
      const d = m.mode;
      g.fillStyle = '#ffd23f';
      g.strokeStyle = '#111';
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(d.pos.x, d.pos.z, 2.4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    const me = m.player;
    for (const a of m.actors) {
      if (!a.alive || a === me) continue;
      const friendly = !me || a.team === me.team;
      if (!friendly && m.time - a.lastFireTime > 1.2) continue;
      g.fillStyle = this.teamColors[a.team];
      g.strokeStyle = '#fff';
      g.lineWidth = 0.4;
      g.beginPath();
      g.arc(a.pos.x, a.pos.z, 1.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.restore();
    // player arrow (always up)
    g.fillStyle = '#fff';
    g.strokeStyle = '#111';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(S / 2, S / 2 - 8);
    g.lineTo(S / 2 + 6, S / 2 + 6);
    g.lineTo(S / 2, S / 2 + 3);
    g.lineTo(S / 2 - 6, S / 2 + 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2);
    g.stroke();
  }

  private tipKey = -1;
  private tip = '';
  private tipFor(key: number, m: Match) {
    if (key !== this.tipKey) {
      this.tipKey = key;
      this.tip = randomTip({ mode: m.cfg.mode, world: m.cfg.world, touch: document.body.classList.contains('touch-ui') });
    }
    return this.tip;
  }

  showScoreboard(v: boolean, m: Match | null) {
    this.scoreboard.classList.toggle('show', v && !!m);
    document.body.classList.toggle('sb-open', v && !!m);
    if (!v || !m) return;
    const rows = (t: number) =>
      m.actors
        .filter((a) => a.team === t)
        .sort((a, b) => b.stats.score - a.stats.score)
        .map((a) => `<tr class="${a.isPlayer ? 'me' : ''} ${a.alive ? '' : 'deadrow'}"><td>${esc(a.name)}</td><td>${a.stats.score}</td><td>${a.stats.kills}</td><td>${a.stats.deaths}</td><td>${a.stats.assists}</td><td>${m.mode instanceof CTF ? a.stats.caps : m.mode instanceof KOTH ? Math.round(a.stats.zoneTime) : a.stats.headshots}</td></tr>`)
        .join('');
    const extra = m.mode instanceof CTF ? 'CAPS' : m.mode instanceof KOTH ? 'ZONE' : 'HS';
    const head = `<tr><th>Name</th><th>Score</th><th>K</th><th>D</th><th>A</th><th>${extra}</th></tr>`;
    this.scoreboard.innerHTML = `<div class="sb-title">${esc(m.world.theme.name)} — ${m.mode.info.name}</div>
      <div class="sb-teams"><table class="blue"><caption>BLUE · ${m.score[0]}</caption>${head}${rows(0)}</table>
      <table class="red"><caption>RED · ${m.score[1]}</caption>${head}${rows(1)}</table></div>`;
  }
}

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export { WEAPONS };
