import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
page.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await page.goto('http://localhost:' + (process.env.PORT || 5173) + '/', { waitUntil: 'load' });
await page.waitForTimeout(3000);
const worlds = (process.env.WORLDS || 'plaza,paper,comic,toy,neon').split(',');
const mode = process.env.MODE || 'tdm';
for (const w of worlds) {
  const r = await page.evaluate(([w, mode]) => {
    const g = window.__game;
    const res = [];
    for (let rep = 0; rep < 3; rep++) {
      window.__menu.show('none');
      g.startAttract(w); g.worldId = null;
      g.simulate(240);
      const m = g.match;
      const k = [0, 1].map((t) => m.actors.filter((a) => a.team === t).reduce((s, a) => s + a.stats.kills, 0));
      res.push(`${m.score.join('-')} (k ${k.join('/')})`);
    }
    return { w, mode, res };
  }, [w, mode]);
  console.log(JSON.stringify(r));
}
await browser.close();
