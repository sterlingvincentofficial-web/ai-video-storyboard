// Films the kill-preview studio (studio.html): unit/monkey portraits and one video per scene.
// usage: node record.mjs <servedDir> <outDir> [portraits|scenes|SceneName...]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [root, out, ...what] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const srv = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); }).listen(8766);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
await page.goto('http://localhost:8766/studio.html'); await page.waitForFunction('window.READY', null, { timeout: 120000 });
fs.mkdirSync(out, { recursive: true });
const UNITS = ['Brawler', 'Slingshot', 'Lumberjack', 'Hunter', 'Medic', 'Bait', 'Grenadier', 'Zookeeper', 'Commander'];
const MONKEYS = ['Monkey', 'Speedy', 'Chucker', 'Brute', 'Baby', 'Ninja', 'Silverback', 'RockThrower', 'Berserker', 'Alpha', 'Titan'];
const SCENES = [...UNITS, 'Boss'];
const list = what.length ? what : ['portraits', 'scenes'];
for (const w of list) {
  if (w === 'portraits') {
    for (const u of UNITS) { await page.evaluate(n => window.portraitUnit(n), u); await page.screenshot({ path: path.join(out, `unit_${u}.png`) }); console.log('unit', u); }
    for (const m of MONKEYS) { await page.evaluate(n => window.portraitMonkey(n), m); await page.screenshot({ path: path.join(out, `monkey_${m}.png`) }); console.log('monkey', m); }
    continue;
  }
  const scenes = w === 'scenes' ? SCENES : [w];
  for (const s of scenes) {
    const dir = path.join(out, `frames_${s}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
    await page.evaluate(n => window.setupScene(n), s);
    const frames = s === 'Boss' ? 150 : 120;
    for (let i = 0; i < frames; i++) { await page.evaluate(() => window.advance(2)); await page.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`) }); }
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', path.join(out, `kill_${s}.mp4`)]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('video', s);
  }
}
await browser.close(); srv.close();
