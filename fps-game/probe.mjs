import { chromium } from 'playwright-core';
const [,, query, code] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:' + (process.env.PORT || 5173) + '/' + query, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game || window.__info, null, { timeout: 30000 }).catch(() => {}); /*__waitGame*/
await page.waitForTimeout(1500);
const r = await page.evaluate(code);
console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
await browser.close();
