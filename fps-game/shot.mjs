// Usage: node shot.mjs <url-path-and-query> <out.png> [w] [h] [waitMs]
import { chromium } from 'playwright-core';
const [,, path, out, w = '1280', h = '720', wait = '2500'] = process.argv;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:5173/' + path, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
const info = await page.evaluate(() => { const i = window.__info; return i ? { calls: i.calls?.(), tris: i.tris?.(), nav: i.nav, frames: window.__frames, extra: i.extra?.() } : null; });
await page.screenshot({ path: out });
console.log(JSON.stringify(info));
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
