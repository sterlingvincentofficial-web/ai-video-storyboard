// Frame-exact gameplay capture: virtual clock + manual frame stepping.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export const OUT = fileURLToPath(new URL('./frames', import.meta.url));
const GAME_URL = process.env.GAME_URL || 'http://localhost:5173/';
const CHROMIUM = process.env.CHROMIUM_PATH || undefined;
export async function open({ W = 1920, H = 1080, quality = 'high', touch = false, dpr = 1 } = {}) {
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript((q) => {
    localStorage.setItem('toonfire.settings.v1', JSON.stringify({ quality: q, renderScale: 1, damageNumbers: true, screenShake: true, announcer: false, fov: 90, playerName: 'You' }));
    localStorage.setItem('toonfire.tutorial', '1');
    // block Vite HMR reloads
    const WS = window.WebSocket;
    window.WebSocket = function (url, p) { if (String(p).includes('vite-hmr') || /[?&]token=/.test(String(url))) return { readyState: 0, addEventListener() {}, removeEventListener() {}, send() {}, close() {} }; return new WS(url, p); };
    Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  }, quality);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(GAME_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__menu, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '.hint, .rotate-hint, #loading, .lockhint { display: none !important; } .fps { display:none !important }' });
  await page.evaluate(() => {
    const g = window.__game;
    g.renderer.setAnimationLoop(null);
    let vt = performance.now();
    const realNow = performance.now.bind(performance);
    window.__vt = { get: () => vt, adv: (ms) => { vt += ms; } };
    performance.now = () => vt;
    g.adaptResolution = () => {};
    g.measureQuality = () => {};
    g.lastT = vt;
    window.__step = (n = 1, dtms = 1000 / 30) => { for (let i = 0; i < n; i++) { vt += dtms; g.frame(); } };
    // autopilot: the player is driven by a bot brain
    window.__autopilot = (diffIdx = 3) => {
      const m = g.match; const p = m.player; if (!p) return;
      const any = [...m.brains.values()][0];
      const B = any.constructor;
      const diffs = [{ name: 'Insane', reaction: 0.18, aimError: 0.022, turnSpeed: 10, fov: 1.35, strafe: 1, jumpiness: 0.2, grenade: 0.14, trackGain: 2.2, range: 90 }];
      m.brains.set(p, new B(p, { ...any.diff, ...diffs[0] }));
      g.controlPlayer = () => {};
    };
  });
  return { browser, page };
}
export async function shoot(page, name, frames, { every = 1, sub = 1, hideHud = false, before = null, perFrame = null } = {}) {
  const dir = `${OUT}/${name}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await page.evaluate((h) => { document.body.classList.toggle('adhide', h); }, hideHud);
  if (before) await page.evaluate(before);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate(([sub, pf, i]) => { if (pf) (new Function('g', 'i', pf))(window.__game, i); window.__step(sub, 1000 / 30 / sub); }, [sub, perFrame, i]);
    await page.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 93, timeout: 180000 });
  }
  console.log(name, frames, 'frames', ((Date.now() - t0) / frames).toFixed(0), 'ms/frame');
}
