import { open, shoot, OUT } from './cap.mjs';
import fs from 'node:fs';
const { browser, page } = await open({ W: 844, H: 390, touch: true, dpr: 2, quality: 'high' });
await page.addStyleTag({ content: 'body:not(.admenu) .menu { display: none !important; }' });
await page.evaluate(() => {
  const g = window.__game;
  window.__menu.show('none');
  g.startMatch({ world: 'plaza', mode: 'tdm', difficulty: 2, scoreScale: 3, mutators: [], playerName: 'You', playerHat: 'crown' });
  window.__step(1);
  const m = g.match;
  for (let i = 0; i < 100 && m.state === 'countdown'; i++) g.simulate(0.1);
  window.__autopilot();
  g.simulate(3);
  for (let t = 0; t < 30; t += 0.2) { const b = m.brains.get(m.player); if (b && b.target && b.target.alive && m.player.pos.distanceTo(b.target.pos) < 18) break; g.simulate(0.2); }
  window.__step(2);
  const h = g.hud; h.centerT = 0; h.center.classList.remove('show'); h.sub.classList.remove('show');
  return [g.touchMode, document.body.className];
}).then((r) => console.log(r));
await shoot(page, 'touch', 45, {});
await browser.close();
