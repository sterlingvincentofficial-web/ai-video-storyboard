import type { Game, MatchSummary } from '../game/Game';
import { WORLDS, WORLD_ORDER } from '../worlds';
import type { WorldId, Quality } from '../worlds/types';
import { MODE_INFO, MODE_ORDER, MUTATORS, type ModeId } from '../modes/Modes';
import { settings, saveSettings, resetSettings } from '../core/Settings';
import { profile, xpForLevel, hatUnlocked } from '../core/Profile';
import { dailyChallenges, CHALLENGE_XP } from '../core/Challenges';
import { HATS } from '../render/Character';
import { DIFFICULTIES } from '../entities/Bot';
import { audio } from '../core/Audio';
import { esc } from './Hud';
import { hexToCss, isTouchDevice, pick } from '../core/utils';

const HAT_ICON: Record<string, string> = {
  default: '⭐', party: '🎉', propeller: '🌀', cone: '🚧', bunny: '🐰', cowboy: '🤠', headphones: '🎧', chef: '🍳',
  flower: '🌸', pirate: '🏴‍☠️', tophat: '🎩', viking: '🪓', wizard: '🧙', halo: '😇', crown: '👑',
};

type Screen = 'title' | 'play' | 'loadout' | 'settings' | 'help' | 'pause' | 'results' | 'none';

export class Menu {
  root: HTMLDivElement;
  private screens = new Map<Screen, HTMLDivElement>();
  private current: Screen = 'title';
  private back: Screen = 'title';
  private lastSummary: MatchSummary | null = null;
  private rotateHint: HTMLDivElement;

  constructor(parent: HTMLElement, private game: Game) {
    this.root = document.createElement('div');
    this.root.className = 'menu';
    parent.appendChild(this.root);
    for (const s of ['title', 'play', 'loadout', 'settings', 'help', 'pause', 'results'] as Screen[]) {
      const d = document.createElement('div');
      d.className = `screen screen-${s}`;
      this.root.appendChild(d);
      this.screens.set(s, d);
    }
    this.rotateHint = document.createElement('div');
    this.rotateHint.className = 'rotate-hint';
    this.rotateHint.innerHTML = '<div>📱↻</div><p>Rotate your phone to landscape for the best experience</p><button class="btn small">Play anyway</button>';
    this.rotateHint.querySelector('button')!.addEventListener('click', () => this.rotateHint.classList.add('dismissed'));
    parent.appendChild(this.rotateHint);

    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('button, .card, .chip, .seg > *, .hat')) audio.play('ui_click');
    });
    this.root.addEventListener('pointerover', (e) => {
      const t = e.target as HTMLElement;
      if (t.matches('button, .card, .chip')) audio.play('ui_hover', { volume: 0.4 });
    });

    game.onPauseRequest = () => {
      if (game.state === 'playing') {
        game.pause();
        this.show('pause');
      } else if (game.state === 'paused') this.resume();
    };
    game.onMatchEnd = (s) => {
      this.lastSummary = s;
      this.show('results');
    };
    game.onStateChange = (s) => {
      document.body.classList.toggle('in-game', s === 'playing' || s === 'paused' || s === 'ended');
      this.updateRotateHint();
    };
    window.addEventListener('resize', () => this.updateRotateHint());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && game.state === 'paused' && this.current === 'pause') {
        e.preventDefault();
        this.resume();
      } else if (e.code === 'Escape' && game.state === 'menu' && this.current !== 'title') this.show('title');
    });
    this.show('title');
  }

  private updateRotateHint() {
    const portrait = window.innerHeight > window.innerWidth && isTouchDevice();
    this.rotateHint.classList.toggle('show', portrait && this.game.state === 'playing');
  }

  show(s: Screen) {
    if (s !== 'settings') this.back = s === 'pause' ? 'pause' : this.current === 'pause' ? 'pause' : 'title';
    if (this.game.state === 'menu') this.game.setPreview(s === 'loadout', hatUnlocked(settings.hat) ? settings.hat : 'default');
    this.current = s;
    this.screens.forEach((d, k) => d.classList.toggle('active', k === s));
    this.root.classList.toggle('hidden', s === 'none');
    this.root.classList.toggle('overlay', s === 'pause' || s === 'results' || (s === 'settings' && this.game.state !== 'menu'));
    switch (s) {
      case 'title': this.renderTitle(); break;
      case 'play': this.renderPlay(); break;
      case 'loadout': this.renderLoadout(); break;
      case 'settings': this.renderSettings(); break;
      case 'help': this.renderHelp(); break;
      case 'pause': this.renderPause(); break;
      case 'results': this.renderResults(); break;
    }
  }

  private profileBadge() {
    const need = xpForLevel(profile.level);
    return `<div class="profile-badge"><div class="lvl">${profile.level}</div><div class="pinfo"><div class="pname">${esc(settings.playerName)}</div>
      <div class="xpbar"><i style="width:${Math.min(100, (profile.xp / need) * 100)}%"></i></div><div class="xptext">${profile.xp} / ${need} XP</div></div></div>`;
  }

  private renderTitle() {
    const d = this.screens.get('title')!;
    const w = WORLDS[settings.lastWorld];
    d.innerHTML = `
      ${this.profileBadge()}
      <div class="title-col">
      <div class="logo"><span class="l1">TOON</span><span class="l2">FIRE</span><div class="tag">4 v 4 cartoon blaster battles</div></div>
      <div class="title-buttons">
        <button class="btn big primary" data-a="play">▶ PLAY</button>
        <button class="btn" data-a="quick">⚡ QUICK PLAY</button>
        <button class="btn" data-a="loadout">🎩 LOADOUT</button>
        <button class="btn" data-a="settings">⚙ SETTINGS</button>
        <button class="btn" data-a="help">❓ HOW TO PLAY</button>
      </div>
      </div>
      <div class="daily"><div class="dtitle">Daily challenges <span>+${CHALLENGE_XP} XP each</span></div>
        ${dailyChallenges().map((c) => `<div class="drow ${c.done ? 'done' : ''}"><div class="dtext">${c.done ? '✅' : '🎯'} ${esc(c.text)}</div><div class="dbar"><i style="width:${Math.round((c.progress / c.goal) * 100)}%"></i></div><div class="dnum">${c.progress}/${c.goal}</div></div>`).join('')}
      </div>
      <div class="now-showing">Now showing: <b>${esc(w.theme.name)}</b></div>
      <div class="stats-mini">🏆 ${profile.wins} wins · 💥 ${profile.kills} splats · 🎮 ${profile.matches} matches</div>`;
    d.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.unlock();
        const a = b.dataset.a!;
        if (a === 'play') this.show('play');
        if (a === 'quick') this.quickPlay();
        if (a === 'loadout') this.show('loadout');
        if (a === 'settings') this.show('settings');
        if (a === 'help') this.show('help');
      }),
    );
  }

  private quickPlay() {
    settings.lastWorld = pick(WORLD_ORDER);
    settings.lastMode = pick(MODE_ORDER);
    saveSettings();
    this.startMatch();
  }

  private renderPlay() {
    const d = this.screens.get('play')!;
    const worldCards = WORLD_ORDER.map((id) => {
      const t = WORLDS[id].theme;
      const wins = profile.worldWins[id] ?? 0;
      return `<div class="card world ${settings.lastWorld === id ? 'sel' : ''}" data-w="${id}" style="--c1:${hexToCss(t.teams[0].primary)};--c2:${hexToCss(t.teams[1].primary)}">
        <div class="img" style="background-image:url('${t.image}')"></div>
        <div class="cname">${esc(t.name)}</div><div class="ctag">${esc(t.tagline)}</div>${wins ? `<div class="wins">🏆 ${wins}</div>` : ''}</div>`;
    }).join('');
    const modeCards = MODE_ORDER.map((id) => {
      const m = MODE_INFO[id];
      return `<div class="card mode ${settings.lastMode === id ? 'sel' : ''}" data-m="${id}"><div class="micon">${m.icon}</div><div class="cname">${m.name}</div><div class="ctag">${m.desc}</div></div>`;
    }).join('');
    const diffs = DIFFICULTIES.map((x, i) => `<div class="${settings.difficulty === i ? 'sel' : ''}" data-d="${i}">${x.name}</div>`).join('');
    const lens = [[0.5, 'Short'], [1, 'Normal'], [1.5, 'Long']].map(([v, n]) => `<div class="${settings.scoreLimitScale === v ? 'sel' : ''}" data-l="${v}">${n}</div>`).join('');
    const muts = MUTATORS.map((mu) => `<div class="chip ${settings.mutators.includes(mu.id) ? 'on' : ''}" data-mu="${mu.id}" title="${esc(mu.desc)}">${esc(mu.name)}</div>`).join('');
    d.innerHTML = `
      <div class="panel wide">
        <div class="phead"><button class="btn small back">← Back</button><h2>Choose your battle</h2></div>
        <h3>World</h3><div class="cards worlds">${worldCards}</div>
        <h3>Mode</h3><div class="cards modes">${modeCards}</div>
        <div class="opts">
          <div><h3>Bot difficulty</h3><div class="seg diff">${diffs}</div></div>
          <div><h3>Match length</h3><div class="seg len">${lens}</div></div>
        </div>
        <h3>Mutators <small>(optional chaos)</small></h3><div class="chips">${muts}</div>
        <div class="start-row"><button class="btn big primary start">▶ START MATCH</button></div>
      </div>`;
    d.querySelector('.back')!.addEventListener('click', () => this.show('title'));
    d.querySelectorAll<HTMLElement>('.card.world').forEach((c) =>
      c.addEventListener('click', () => {
        settings.lastWorld = c.dataset.w as WorldId;
        saveSettings();
        d.querySelectorAll('.card.world').forEach((x) => x.classList.toggle('sel', x === c));
        // swap the live background world
        const w = settings.lastWorld;
        this.game.withLoading(`Loading ${WORLDS[w].theme.name}…`, () => this.game.startAttract(w));
      }),
    );
    d.querySelectorAll<HTMLElement>('.card.mode').forEach((c) =>
      c.addEventListener('click', () => {
        settings.lastMode = c.dataset.m as ModeId;
        saveSettings();
        d.querySelectorAll('.card.mode').forEach((x) => x.classList.toggle('sel', x === c));
      }),
    );
    d.querySelectorAll<HTMLElement>('.seg.diff > div').forEach((c) =>
      c.addEventListener('click', () => {
        settings.difficulty = +c.dataset.d!;
        saveSettings();
        d.querySelectorAll('.seg.diff > div').forEach((x) => x.classList.toggle('sel', x === c));
      }),
    );
    d.querySelectorAll<HTMLElement>('.seg.len > div').forEach((c) =>
      c.addEventListener('click', () => {
        settings.scoreLimitScale = +c.dataset.l!;
        saveSettings();
        d.querySelectorAll('.seg.len > div').forEach((x) => x.classList.toggle('sel', x === c));
      }),
    );
    d.querySelectorAll<HTMLElement>('.chip[data-mu]').forEach((c) =>
      c.addEventListener('click', () => {
        const id = c.dataset.mu!;
        const on = !settings.mutators.includes(id);
        settings.mutators = on ? [...settings.mutators, id] : settings.mutators.filter((x) => x !== id);
        saveSettings();
        c.classList.toggle('on', on);
      }),
    );
    d.querySelector('.start')!.addEventListener('click', () => this.startMatch());
  }

  startMatch() {
    audio.unlock();
    this.show('none');
    // grab the mouse inside the click (user-activation) window
    if (!this.game.touchMode) this.game.input.requestLock();
    if (isTouchDevice()) {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
      try {
        const p = el.requestFullscreen?.();
        if (p && typeof (p as Promise<void>).then === 'function') {
          (p as Promise<void>).then(() => {
            const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
            o?.lock?.('landscape').catch(() => {});
          }).catch(() => {});
        } else el.webkitRequestFullscreen?.();
      } catch {
        /* ignore */
      }
    }
    const cfg = {
      world: settings.lastWorld,
      mode: settings.lastMode as ModeId,
      difficulty: settings.difficulty,
      scoreScale: settings.scoreLimitScale,
      mutators: settings.mutators,
      playerName: settings.playerName || 'You',
      playerHat: hatUnlocked(settings.hat) ? settings.hat : 'default',
    };
    if (this.game.needsLoad(cfg.world)) this.game.withLoading(`Loading ${WORLDS[cfg.world].theme.name}…`, () => this.game.startMatch(cfg));
    else this.game.startMatch(cfg);
  }

  private renderLoadout() {
    const d = this.screens.get('loadout')!;
    const hats = HATS.map((h) => {
      const ok = h.level <= profile.level;
      return `<div class="hat ${settings.hat === h.id ? 'sel' : ''} ${ok ? '' : 'locked'}" data-h="${h.id}"><div class="hicon">${HAT_ICON[h.id] ?? '🎩'}</div><div class="hname">${esc(h.name)}</div>${ok ? '' : `<div class="hlock">🔒 Lv ${h.level}</div>`}</div>`;
    }).join('');
    d.innerHTML = `
      <div class="panel">
        <div class="phead"><button class="btn small back">← Back</button><h2>Loadout</h2></div>
        ${this.profileBadge()}
        <h3>Trooper name</h3>
        <input class="name-input" maxlength="14" value="${esc(settings.playerName)}" />
        <h3>Hat <small>(tap a locked hat to try it on · earn XP to unlock · shows in kill cams & victory dances)</small></h3>
        <div class="hats">${hats}</div>
        <h3>Career</h3>
        <div class="career">
          <div><b>${profile.matches}</b><span>Matches</span></div>
          <div><b>${profile.wins}</b><span>Wins</span></div>
          <div><b>${profile.kills}</b><span>Splats</span></div>
          <div><b>${profile.deaths ? (profile.kills / profile.deaths).toFixed(2) : profile.kills}</b><span>K/D</span></div>
          <div><b>${profile.headshots}</b><span>Headshots</span></div>
          <div><b>${profile.caps}</b><span>Captures</span></div>
          <div><b>${profile.bestStreak}</b><span>Best streak</span></div>
          <div><b>${Math.round(profile.playTime / 60)}m</b><span>Played</span></div>
        </div>
      </div>`;
    d.querySelector('.back')!.addEventListener('click', () => this.show('title'));
    const inp = d.querySelector<HTMLInputElement>('.name-input')!;
    inp.addEventListener('input', () => {
      settings.playerName = inp.value.replace(/[<>]/g, '').slice(0, 14) || 'You';
      saveSettings();
    });
    inp.addEventListener('change', () => this.game.setPreview(true, hatUnlocked(settings.hat) ? settings.hat : 'default'));
    d.querySelectorAll<HTMLElement>('.hat').forEach((h) =>
      h.addEventListener('click', () => {
        if (h.classList.contains('locked')) {
          // try it on without equipping
          this.game.setPreview(true, h.dataset.h!);
          return;
        }
        settings.hat = h.dataset.h!;
        saveSettings();
        d.querySelectorAll('.hat').forEach((x) => x.classList.toggle('sel', x === h));
        this.game.setPreview(true, settings.hat);
      }),
    );
  }

  private renderSettings() {
    const d = this.screens.get('settings')!;
    const s = settings;
    const slider = (key: keyof typeof s, label: string, min: number, max: number, step: number, fmt: (v: number) => string = (v) => v.toFixed(2)) =>
      `<label class="row"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"/><em>${fmt(s[key] as number)}</em></label>`;
    const toggle = (key: keyof typeof s, label: string) =>
      `<label class="row"><span>${label}</span><div class="toggle ${s[key] ? 'on' : ''}" data-t="${key}"><i></i></div></label>`;
    const qs: Quality[] = ['low', 'medium', 'high', 'ultra'];
    d.innerHTML = `
      <div class="panel">
        <div class="phead"><button class="btn small back">← Back</button><h2>Settings</h2></div>
        <div class="settings-grid">
          <div>
            <h3>Controls</h3>
            ${slider('sensitivity', 'Mouse sensitivity', 0.2, 3, 0.05)}
            ${slider('touchSensitivity', 'Touch look speed', 0.3, 3, 0.05)}
            ${toggle('invertY', 'Invert Y')}
            ${toggle('aimAssist', 'Aim assist')}
            ${toggle('autoFire', 'Auto-fire (touch)')}
            ${toggle('haptics', 'Vibration (touch)')}
            ${slider('touchScale', 'Touch button size', 0.7, 1.4, 0.05)}
            <h3>Audio</h3>
            ${slider('master', 'Master', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
            ${slider('music', 'Music', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
            ${slider('sfx', 'Effects', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
            ${toggle('announcer', 'Announcer voice')}
          </div>
          <div>
            <h3>Graphics</h3>
            <label class="row"><span>Quality</span><div class="seg q">${qs.map((q) => `<div class="${s.quality === q ? 'sel' : ''}" data-q="${q}">${q[0].toUpperCase() + q.slice(1)}</div>`).join('')}</div></label>
            ${slider('renderScale', 'Render scale', 0.5, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
            ${slider('fov', 'Field of view', 65, 110, 1, (v) => `${v}°`)}
            ${toggle('screenShake', 'Screen shake')}
            ${toggle('damageNumbers', 'Damage numbers')}
            ${toggle('showFps', 'Show FPS')}
            ${toggle('colorblind', 'Colour-blind teams')}
            <label class="row"><span>Crosshair</span><div class="seg xh">${['Cross', 'Dot', 'Circle'].map((n, i) => `<div class="${s.crosshair === i ? 'sel' : ''}" data-x="${i}">${n}</div>`).join('')}</div></label>
            <h3>Data</h3>
            <div class="row"><button class="btn small reset-s">Reset settings</button></div>
          </div>
        </div>
      </div>`;
    d.querySelector('.back')!.addEventListener('click', () => this.show(this.game.state === 'paused' ? 'pause' : 'title'));
    d.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const k = inp.dataset.k as keyof typeof s;
        (s as unknown as Record<string, number>)[k] = +inp.value;
        const em = inp.nextElementSibling as HTMLElement;
        const v = +inp.value;
        em.textContent = ['master', 'music', 'sfx', 'renderScale'].includes(k) ? `${Math.round(v * 100)}%` : k === 'fov' ? `${v}°` : v.toFixed(2);
        saveSettings();
        this.applyLive();
      }),
    );
    d.querySelectorAll<HTMLElement>('.toggle').forEach((t) =>
      t.addEventListener('click', () => {
        const k = t.dataset.t as keyof typeof s;
        (s as unknown as Record<string, boolean>)[k] = !s[k];
        t.classList.toggle('on', !!s[k]);
        saveSettings();
        this.applyLive();
        if (k === 'colorblind') this.game.reloadWorld();
      }),
    );
    d.querySelectorAll<HTMLElement>('.seg.q > div').forEach((c) =>
      c.addEventListener('click', () => {
        s.quality = c.dataset.q as Quality;
        saveSettings();
        d.querySelectorAll('.seg.q > div').forEach((x) => x.classList.toggle('sel', x === c));
        this.game.applyQuality();
      }),
    );
    d.querySelectorAll<HTMLElement>('.seg.xh > div').forEach((c) =>
      c.addEventListener('click', () => {
        s.crosshair = +c.dataset.x!;
        saveSettings();
        d.querySelectorAll('.seg.xh > div').forEach((x) => x.classList.toggle('sel', x === c));
      }),
    );
    d.querySelector('.reset-s')!.addEventListener('click', () => {
      resetSettings();
      this.applyLive();
      this.game.applyQuality();
      this.renderSettings();
    });
  }

  applyLive() {
    audio.setVolumes(settings.master, settings.music, settings.sfx);
    this.game.resize();
  }

  private renderHelp() {
    const d = this.screens.get('help')!;
    d.innerHTML = `
      <div class="panel">
        <div class="phead"><button class="btn small back">← Back</button><h2>How to play</h2></div>
        <div class="help-grid">
          <div><h3>🖱️ Desktop</h3><ul>
            <li><kbd>W A S D</kbd> move · <kbd>Shift</kbd> sprint</li>
            <li><kbd>Space</kbd> jump — press again in the air to <b>double jump</b></li>
            <li><kbd>Mouse</kbd> aim · <kbd>LMB</kbd> fire · <kbd>RMB</kbd> aim / scope</li>
            <li><kbd>R</kbd> reload · <kbd>1-4</kbd> / wheel switch weapon</li>
            <li><kbd>G</kbd> or <kbd>Q</kbd> throw a Splat Bomb · <kbd>V</kbd> / middle-click <b>BONK</b> (double damage from behind!)</li>
            <li><kbd>Tab</kbd> scoreboard · <kbd>Esc</kbd> pause</li>
            <li>🎮 Gamepads work too: sticks move/aim, RT fire, LT scope, A jump, X reload, Y swap, LB bomb, RB/B bonk, Start pause</li></ul></div>
          <div><h3>📱 Mobile</h3><ul>
            <li>Left thumb: floating joystick (push to the top edge to sprint)</li>
            <li>Right thumb: drag anywhere to look</li>
            <li>🔥 fire (drag on it to aim while shooting)</li>
            <li>⤒ jump (tap twice to double jump), ◎ scope, ↻ reload, ⇄ swap, 💣 bomb, 👊 bonk</li>
            <li>Aim assist and auto-fire can be toggled in Settings</li></ul></div>
          <div><h3>🔫 Arsenal</h3><ul>
            <li><b>Blaster</b> — full-auto all-rounder</li>
            <li><b>Scatter</b> — devastating up close</li>
            <li><b>Boomer</b> — splash rockets (pickup). Rocket-jump off your own blasts!</li>
            <li><b>Zapper</b> — long-range scoped rail (pickup). Headshots hurt!</li>
            <li><b>Splat Bomb</b> — bouncy grenade, 2 per life</li></ul></div>
          <div><h3>✨ Pickups</h3><ul>
            <li>➕ Health (+50) · 📦 Ammo + bomb</li>
            <li>🌟 <b>Overcharge</b> — double damage for 15 s</li>
            <li>🟡 Jump pads launch you to high ground</li>
            <li>Earn XP each match to level up and unlock hats</li></ul></div>
        </div>
      </div>`;
    d.querySelector('.back')!.addEventListener('click', () => this.show('title'));
  }

  private renderPause() {
    const d = this.screens.get('pause')!;
    const m = this.game.match;
    d.innerHTML = `
      <div class="panel narrow">
        <h2>Paused</h2>
        <div class="pause-info">${m ? `${esc(m.world.theme.name)} · ${m.mode.info.name}<br/><b style="color:var(--blue)">BLUE ${m.score[0]}</b> — <b style="color:var(--red)">${m.score[1]} RED</b>` : ''}</div>
        <button class="btn big primary resume">▶ RESUME</button>
        <button class="btn settings">⚙ Settings</button>
        <button class="btn restart">↻ Restart match</button>
        <button class="btn quit">⏏ Quit to menu</button>
      </div>`;
    d.querySelector('.resume')!.addEventListener('click', () => this.resume());
    d.querySelector('.settings')!.addEventListener('click', () => this.show('settings'));
    d.querySelector('.restart')!.addEventListener('click', () => this.startMatch());
    d.querySelector('.quit')!.addEventListener('click', () => {
      this.game.quitToMenu();
      this.show('title');
    });
  }

  resume() {
    this.show('none');
    this.game.resume();
  }

  private renderResults() {
    const d = this.screens.get('results')!;
    const s = this.lastSummary;
    if (!s) return;
    const p = s.player;
    const won = p && s.winner === p.team;
    const title = s.winner === -1 ? 'DRAW' : won ? 'VICTORY!' : 'DEFEAT';
    const rows = (t: number) =>
      s.actors.filter((a) => a.team === t).sort((a, b) => b.stats.score - a.stats.score)
        .map((a) => `<tr class="${a.isPlayer ? 'me' : ''}"><td>${a === s.mvp ? '⭐ ' : ''}${esc(a.name)}</td><td>${a.stats.score}</td><td>${a.stats.kills}</td><td>${a.stats.deaths}</td><td>${a.stats.assists}</td></tr>`).join('');
    const head = '<tr><th>Name</th><th>Score</th><th>K</th><th>D</th><th>A</th></tr>';
    const xpRows = s.xp.map((x) => `<div class="xprow"><span>${esc(x.label)}</span><b>${x.value ? '+' + x.value : ''}</b></div>`).join('');
    const need = xpForLevel(profile.level);
    d.innerHTML = `
      <div class="panel results ${won ? 'won' : s.winner === -1 ? 'draw' : 'lost'}">
        <div class="res-title">${title}</div>
        <div class="res-score"><span style="color:var(--blue)">BLUE ${s.score[0]}</span> — <span style="color:var(--red)">${s.score[1]} RED</span></div>
        <div class="res-sub">${esc(WORLDS[s.cfg.world].theme.name)} · ${MODE_INFO[s.cfg.mode].name} · ${DIFFICULTIES[s.cfg.difficulty].name}${s.mvp ? ` · MVP: <b>${esc(s.mvp.name)}</b>` : ''}</div>
        <div class="res-grid">
          <div class="res-tables"><table class="blue"><caption>BLUE</caption>${head}${rows(0)}</table><table class="red"><caption>RED</caption>${head}${rows(1)}</table></div>
          <div class="res-xp">
            ${p ? `<div class="res-stats"><div><b>${Math.round(p.stats.damage)}</b><span>Damage</span></div><div><b>${s.accuracy}%</b><span>Accuracy</span></div><div><b>${p.stats.bestStreak}</b><span>Best streak</span></div></div>` : ''}
            <h3>XP earned</h3>${xpRows}
            <div class="xprow total"><span>Total</span><b>+${s.xpTotal}</b></div>
            <div class="lvline">Level <b>${profile.level}</b></div>
            <div class="xpbar big"><i style="width:${Math.min(100, (profile.xp / need) * 100)}%"></i></div>
            <div class="xptext">${profile.xp} / ${need} XP</div>
            ${s.levelsGained.length ? `<div class="levelup">⬆ LEVEL UP! Now level ${profile.level}</div>` : ''}
            ${s.unlocked.map((u) => `<div class="unlock">🎁 Unlocked: <b>${esc(u)}</b></div>`).join('')}
            ${s.challenges.map((c) => `<div class="unlock chal">🎯 Challenge complete: <b>${esc(c)}</b></div>`).join('')}
          </div>
        </div>
        <div class="res-buttons">
          <button class="btn big primary again">↻ PLAY AGAIN</button>
          <button class="btn setup">⚙ Change setup</button>
          <button class="btn tomenu">⏏ Main menu</button>
        </div>
      </div>`;
    d.querySelector('.again')!.addEventListener('click', () => this.startMatch());
    d.querySelector('.setup')!.addEventListener('click', () => {
      this.game.startAttract(settings.lastWorld);
      this.show('play');
    });
    d.querySelector(".tomenu")!.addEventListener('click', () => {
      this.game.startAttract(settings.lastWorld);
      this.show('title');
    });
  }
}
