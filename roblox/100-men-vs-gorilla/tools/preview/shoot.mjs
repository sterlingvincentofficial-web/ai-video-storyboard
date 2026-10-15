import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const root = process.argv[2], out = process.argv[3], shots = JSON.parse(process.argv[4]);
const types = {'.html':'text/html','.js':'text/javascript','.json':'application/json'};
const srv = http.createServer((req,res)=>{ const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'}); res.end(d); }); }).listen(8765);
const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1280,height:720}});
page.on('console', m => console.log('console:', m.text())); page.on('pageerror', e => console.log('err:', e.message));
for (const [name, q] of Object.entries(shots)) {
  await page.goto('http://localhost:8765/index.html?' + q); await page.waitForFunction('window.DONE', null, {timeout: 60000});
  await page.screenshot({path: path.join(out, name + '.png')}); console.log('shot', name);
}
await browser.close(); srv.close();
