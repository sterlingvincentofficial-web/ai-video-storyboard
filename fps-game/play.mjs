// Usage: node play.mjs <query> <outprefix> [w] [h] [seconds]
import { chromium } from 'playwright-core';
const [,, query, out, w = '1280', h = '720', secs = '12', mobile = ''] = process.argv;
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
const total = +secs;
const shots = 4;
for (let i = 0; i < shots; i++) {
  await page.waitForTimeout((total * 1000) / shots);
  const info = await page.evaluate(() => {
    const g = window.__game;
    const m = g?.match;
    if (!m) return null;
    const p = m.player;
    return {
      state: g.state, mstate: m.state, t: +m.time.toFixed(1), score: m.score,
      player: p ? { hp: p.health, alive: p.alive, pos: p.pos.toArray().map((v) => +v.toFixed(1)), k: p.stats.kills, d: p.stats.deaths } : null,
      bots: m.actors.filter((a) => !a.isPlayer).map((a) => `${a.name}:${a.alive ? 'A' : 'D'}${a.stats.kills}/${a.stats.deaths}@${a.pos.x.toFixed(0)},${a.pos.z.toFixed(0)}`).join(' '),
      calls: g.renderer.info.render.calls,
    };
  });
  console.log(JSON.stringify(info));
  await page.screenshot({ path: `${out}-${i}.png` });
}
console.log(logs.filter((l) => !l.includes('ERR_CERT') && !l.includes('404') && !l.includes('Clock')).slice(0, 30).join('\n'));
await browser.close();
