// Usage: node sim.mjs <query> <outprefix> <simSecondsPerStep> <steps> [w h mobile]
import { chromium } from 'playwright-core';
const [,, query, out, per = '15', steps = '4', w = '1280', h = '720', mobile = ''] = process.argv;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, hasTouch: !!mobile, isMobile: !!mobile, deviceScaleFactor: mobile ? 2 : 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:' + (process.env.PORT || 5173) + '/' + query, { waitUntil: 'load' });
await page.waitForTimeout(2500);
for (let i = 0; i < +steps; i++) {
  const t0 = Date.now();
  const info = await page.evaluate((sec) => {
    const g = window.__game;
    if (window.__beforeSim) window.__beforeSim(g);
    g.simulate(sec);
    const m = g.match;
    const p = m.player;
    const obj = m.mode.objective(m);
    return {
      state: g.state, mstate: m.state, t: +m.time.toFixed(1), score: m.score, left: Math.round(m.timeLeft), obj: obj.status || JSON.stringify(obj.flags || obj.zone || ''),
      player: p ? { hp: Math.round(p.health), alive: p.alive, k: p.stats.kills, d: p.stats.deaths } : null,
      bots: m.actors.filter((a) => !a.isPlayer).map((a) => `${a.name.slice(0,6)}:${a.alive ? 'A' : 'D'}${a.stats.kills}/${a.stats.deaths}`).join(' '),
    };
  }, +per);
  await page.waitForTimeout(1200);
  const calls = await page.evaluate(() => { const r = window.__game.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
  console.log(JSON.stringify({ ...info, ...calls, ms: Date.now() - t0 }));
  await page.screenshot({ path: `${out}-${i}.png` });
}
console.log(logs.filter((l) => !l.includes('ERR_CERT') && !l.includes('404') && !l.includes('Clock')).slice(0, 30).join('\n'));
await browser.close();
