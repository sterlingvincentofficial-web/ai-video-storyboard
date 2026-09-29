// node evalshot.mjs <query> <out.png> <code> [waitAfterMs] [w] [h] [mobile]
import { chromium } from 'playwright-core';
const [,, query, out, code, wait = '1500', w = '1280', h = '720', mobile = ''] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, hasTouch: !!mobile, isMobile: !!mobile, deviceScaleFactor: mobile ? 2 : 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT') && !m.text().includes('404')) errs.push('[console.error] ' + m.text()); });
await page.goto('http://localhost:' + (process.env.PORT || 5173) + '/' + query, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game || window.__info, null, { timeout: 30000 }).catch(() => {}); /*__waitGame*/
await page.waitForTimeout(1500);
const r = await page.evaluate(code);
if (r !== undefined) console.log(typeof r === 'string' ? r : JSON.stringify(r));
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log(errs.join('\n'));
await browser.close();
