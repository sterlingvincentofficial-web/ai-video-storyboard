import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
await page.goto('http://localhost:' + (process.env.PORT || 5173) + '/', { waitUntil: 'load' });
await page.waitForTimeout(3000);
const worlds = (process.env.WORLDS || 'plaza,paper,comic,toy,neon').split(',');
const modes = (process.env.MODES || 'tdm,ctf,koth,duck,elim').split(',');
const secs = +(process.env.SECS || 60);
for (const w of worlds) {
  for (const mo of modes) {
    const t0 = Date.now();
    const r = await page.evaluate(([w, mo, secs]) => {
      const g = window.__game;
      window.__menu.show('none');
      g.startMatch({ world: w, mode: mo, difficulty: 1, scoreScale: 1, mutators: [], playerName: 'P', playerHat: 'default' });
      const m = g.match;
      let voids = 0, kills = 0;
      const orig = m.emit.bind(m);
      m.emit = (e) => { if (e.type === 'kill') { kills++; if (e.env === 'void') voids++; } orig(e); };
      // player: simple bot-like wander so the blue team isn't a man down
      g.simulate(secs);
      const stuck = m.actors.filter((a) => !a.isPlayer && a.alive && a.horizSpeed() < 0.2).length;
      return { w, mo, score: m.score.join('-'), state: m.state, kills, voids, stuckNow: stuck, obj: m.mode.objective(m).status };
    }, [w, mo, secs]);
    console.log(JSON.stringify({ ...r, ms: Date.now() - t0 }));
  }
}
console.log(errs.slice(0, 15).join('\n') || 'no errors');
await browser.close();
