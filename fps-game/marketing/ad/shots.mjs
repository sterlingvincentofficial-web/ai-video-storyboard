import { open, shoot, OUT } from './cap.mjs';
import fs from 'node:fs';
const which = (process.argv[2] || '').split(',').filter(Boolean);

// page helpers injected per browser
const HELPERS = () => {
  const g = window.__game;
  window.__cfg = (world, mode, muts = [], hat = 'crown') => ({ world, mode, difficulty: 2, scoreScale: 3, mutators: muts, playerName: 'You', playerHat: hat });
  window.__start = (world, mode, muts, hat) => { window.__menu.show('none'); g.startMatch(window.__cfg(world, mode, muts, hat)); window.__step(1); };
  window.__skipCountdown = () => {
    const m = g.match;
    for (let i = 0; i < 100 && m.state === 'countdown'; i++) g.simulate(0.1);
    g.simulate(0.2);
    window.__step(2);
    const h = g.hud; h.centerT = 0; h.center.classList.remove('show'); h.sub.classList.remove('show');
  };
  window.__findFight = (who = 'player', maxSim = 40) => {
    const m = g.match;
    for (let t = 0; t < maxSim; t += 0.2) {
      const cands = who === 'player' ? [m.player] : m.actors.filter((a) => !a.isPlayer);
      for (const a of cands) {
        if (!a || !a.alive || a.health < 80) continue;
        const b = m.brains.get(a);
        const tg = b && b.target;
        if (tg && tg.alive) {
          const d = a.pos.distanceTo(tg.pos);
          if (d > 6 && d < 20) return a;
        }
      }
      g.simulate(0.2);
    }
    return who === 'player' ? m.player : m.actors.find((a) => a.alive);
  };
  // stage a close-range fight: face the longest open sightline, drop two enemies ~9 m ahead
  window.__duel = (slot = 0, dist = 9) => {
    const m = g.match, p = m.player;
    const V = (x = 0, y = 0, z = 0) => p.pos.clone().set(x, y, z);
    let best = null;
    for (let k = 0; k < 32; k++) {
      const yaw = (k / 32) * Math.PI * 2;
      const dir = V(-Math.sin(yaw), 0, -Math.cos(yaw));
      const eye = V(p.pos.x, p.pos.y + 1.4, p.pos.z);
      const hit = m.col.raycast(eye, dir, 40);
      const free = hit ? hit.t : 40;
      // both flank positions must be clear too
      let ok = free > dist + 4;
      for (const side of [-1, 1]) {
        const tx = p.pos.x + dir.x * dist + dir.z * side * 2.6, tz = p.pos.z + dir.z * dist - dir.x * side * 2.6;
        const gy = m.col.groundHeight(tx, tz, 0.4, p.pos.y + 1.2);
        if (!(Math.abs(gy - p.pos.y) < 0.7)) ok = false;
        if (!m.col.lineOfSight(eye, V(tx, gy + 1.2, tz))) ok = false;
      }
      if (ok && (!best || Math.abs(free - 22) < Math.abs(best.free - 22))) best = { yaw, dir, free };
    }
    if (!best) return false;
    p.yaw = best.yaw; p.pitch = -0.03;
    const foes = m.actors.filter((a) => a.team !== p.team && a.alive).slice(0, 2);
    foes.forEach((e, i) => {
      const side = i === 0 ? -1 : 1;
      const d = dist + i * 3;
      const tx = p.pos.x + best.dir.x * d + best.dir.z * side * 2.6, tz = p.pos.z + best.dir.z * d - best.dir.x * side * 2.6;
      e.pos.set(tx, m.col.groundHeight(tx, tz, 0.4, p.pos.y + 1.2) + 0.02, tz);
      e.vel.set(0, 0, 0);
      e.yaw = Math.atan2(-(p.pos.x - tx), -(p.pos.z - tz));
      e.spawnShield = 0;
      e.health = 100;
    });
    if (slot) { p.slots[slot].give(); p.switchTo(slot); }
    p.health = 100;
    p.spawnShield = 1.5;
    return true;
  };
  window.__spectate = (a, mode = 0) => { g.state = 'menu'; g.specTarget = a; g.specT = 999; g.specMode = mode; g.vm.setHidden(true); };
  window.__ev = [];
  window.__hookEvents = () => {
    const m = g.match;
    const o = m.emit.bind(m);
    m.emit = (e) => {
      if (e.type === 'kill') window.__ev.push({ f: window.__fi || 0, type: 'kill', byPlayer: !!(e.killer && e.killer.isPlayer), bySpec: !!(e.killer && e.killer === g.specTarget) });
      if (e.type === 'explode' || e.type === 'explosion') window.__ev.push({ f: window.__fi || 0, type: 'boom' });
      o(e);
    };
  };
};

const SHOTS = {
  // establishing: the intro flyover orbit, HUD hidden
  ...Object.fromEntries(['plaza', 'paper', 'comic', 'toy', 'neon'].map((w) => [`${w}_est`, {
    frames: w === 'neon' ? 105 : 72, hideHud: true,
    setup: `window.__start('${w}', 'tdm'); window.__hookEvents();`,
  }])),
  // first-person action on autopilot
  ...Object.fromEntries(['plaza', 'paper', 'comic', 'toy', 'neon'].map((w) => [`${w}_fps`, {
    frames: 90, hideHud: false,
    setup: `window.__start('${w}', 'tdm'); window.__skipCountdown(); window.__autopilot(); window.__game.simulate(3); window.__findFight('player'); window.__hookEvents(); window.__step(2);`,
  }])),
  // chase cams on a bot mid-fight
  ...Object.fromEntries(['paper', 'comic', 'toy', 'plaza'].map((w) => [`${w}_chase`, {
    frames: 45, hideHud: true,
    setup: `window.__start('${w}', 'tdm'); window.__skipCountdown(); window.__autopilot(); window.__game.simulate(2); const a = window.__findFight('bots'); window.__spectate(a, 0); window.__hookEvents(); window.__step(12);`,
  }])),
  ...Object.fromEntries([['plaza', 0], ['paper', 1], ['comic', 0], ['toy', 1], ['neon', 0]].map(([w, slot]) => [`${w}_duel`, {
    frames: 60, hideHud: false,
    setup: `window.__start('${w}', 'tdm'); window.__skipCountdown(); window.__autopilot(); window.__game.simulate(1); let ok = false; for (let k = 0; k < 12 && !ok; k++) { ok = window.__duel(${slot}); if (!ok) window.__game.simulate(1.5); } console.log('duel', ok); window.__hookEvents(); window.__step(2);`,
  }])),
  ctf: {
    frames: 60, hideHud: false,
    setup: `window.__start('paper', 'ctf'); window.__skipCountdown(); window.__autopilot(); const m = window.__game.match; const p = m.player; const f = m.mode.flags[1]; p.pos.set(f.home.x + 2.5, f.home.y + 0.2, f.home.z + 2.5); p.yaw = Math.atan2(-(f.home.x - p.pos.x), -(f.home.z - p.pos.z)); for (const a of m.actors) if (a.team === 1 && a.pos.distanceTo(f.home) < 25) { a.pos.x += 40; } window.__hookEvents(); window.__step(4);`,
  },
  boomer: {
    frames: 75, hideHud: false,
    setup: `window.__start('comic', 'tdm'); window.__skipCountdown(); window.__autopilot(); const p = window.__game.match.player; p.slots[2].give(); p.switchTo(2); window.__game.simulate(1.5); window.__findFight('player'); const p2 = window.__game.match.player; if (!p2.slots[2].owned) { p2.slots[2].give(); } p2.switchTo(2); window.__hookEvents(); window.__step(2);`,
  },
  bonk: {
    frames: 36, hideHud: false,
    setup: `window.__start('toy', 'tdm'); window.__skipCountdown(); const m = window.__game.match; const p = m.player; const e = m.actors.find((a) => a.team === 1 && a.alive); m.brains.delete(e); e.wish.set(0, 0); e.wantFire = false; for (const a of m.actors) if (a !== p && a !== e && a.team === 1) { const b = m.brains.get(a); if (b) m.brains.delete(a); a.wish.set(0,0); a.wantFire = false; a.pos.set(p.pos.x + 60, p.pos.y, p.pos.z); } e.pos.set(p.pos.x - Math.sin(p.yaw) * 1.8, p.pos.y, p.pos.z - Math.cos(p.yaw) * 1.8); e.yaw = p.yaw; e.vel.set(0,0,0); e.spawnShield = 0; e.health = 100; g.controlPlayer = () => { p.wish.set(0, 0.35); }; window.__hookEvents(); window.__step(3);`.replace('g.controlPlayer', 'window.__game.controlPlayer'),
    perFrame: `if (i === 9) g.match.melee(g.match.player);`,
  },
  duck: {
    frames: 45, hideHud: true,
    setup: `window.__start('toy', 'duck'); window.__skipCountdown(); window.__autopilot(); const g = window.__game; const m = g.match; for (let t = 0; t < 40 && !m.mode.carrier; t += 0.25) g.simulate(0.25); g.simulate(1.0); window.__spectate(m.mode.carrier || m.actors[1], 0); window.__hookEvents(); window.__step(12);`,
    perFrame: `const c = g.match.mode.carrier; if (c && g.specTarget !== c) g.specTarget = c;`,
  },
  bighead: {
    frames: 45, hideHud: true,
    setup: `window.__start('plaza', 'tdm', ['bighead']); window.__skipCountdown(); window.__autopilot(); window.__game.simulate(2); const a = window.__findFight('bots'); window.__spectate(a, 1); window.__hookEvents(); window.__step(12);`,
  },
  pad: {
    frames: 48, hideHud: false,
    setup: `window.__start('neon', 'tdm'); window.__skipCountdown(); const g = window.__game; const m = g.match; const p = m.player; const pad = m.pads.slice().sort((a, b) => (b.target.y - b.pos.y) - (a.target.y - a.pos.y) || (b.target.x - a.target.x))[0]; const dx = pad.target.x - pad.pos.x, dz = pad.target.z - pad.pos.z, L = Math.hypot(dx, dz); p.pos.set(pad.pos.x - dx / L * 2.2, pad.pos.y + 0.05, pad.pos.z - dz / L * 2.2); p.yaw = Math.atan2(-dx, -dz); p.pitch = 0.05; g.controlPlayer = () => { p.wish.set(0, 1); p.wantSprint = true; }; window.__hookEvents(); window.__step(1);`,
  },
  lineup: {
    frames: 75, hideHud: true,
    setup: `window.__start('toy', 'tdm', [], 'crown'); window.__skipCountdown(); window.__autopilot(); const g = window.__game; g.simulate(4); const m = g.match; m.player.stats.score = 99; m.player.stats.kills = 12; m.addScore(0, m.mode.scoreLimit); window.__step(40);`,
  },
  tour: {
    frames: 20, hideHud: false, showMenu: true,
    setup: `window.__tour.startTour(1); const t = window.__tour.tourState(); t.stop = 2; t.stars = [3, 2, 0, 0, 0]; window.__game.startAttract('comic'); window.__menu.show('tour'); window.__step(10);`,
  },
};

const { browser, page } = await open({ W: 1920, H: 1080 });
await page.addStyleTag({ content: 'body.adhide .hud, body.adhide .scoreboard, body.adhide .killcam, body.adhide .bubble { display: none !important; } body:not(.admenu) .menu { display: none !important; }' });
await page.evaluate(HELPERS);
fs.mkdirSync(OUT, { recursive: true });
for (const name of which.length ? which : Object.keys(SHOTS)) {
  const s = SHOTS[name];
  if (!s) { console.log('no shot', name); continue; }
  await page.evaluate((m) => document.body.classList.toggle('admenu', m), !!s.showMenu);
  await page.evaluate(() => { window.__ev = []; });
  await page.evaluate(s.setup);
  await shoot(page, name, s.frames, { hideHud: s.hideHud, perFrame: (s.perFrame ? s.perFrame + ';' : '') + 'window.__fi = i;' });
  const ev = await page.evaluate(() => window.__ev);
  fs.writeFileSync(`${OUT}/${name}/events.json`, JSON.stringify(ev));
  console.log('   events', JSON.stringify(ev).slice(0, 200));
}
await browser.close();
