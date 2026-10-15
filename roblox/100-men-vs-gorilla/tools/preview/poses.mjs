// Renders contact sheets of every unit's combat stance + attack key frames (for tuning unit_anims.json).
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [root, out, ...units] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const srv = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); }).listen(8767);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:8767/studio.html'); await page.waitForFunction('window.READY', null, { timeout: 120000 });
const anims = JSON.parse(fs.readFileSync(path.join(root, 'unit_anims.json')));
const KIND = { Brawler: 'Punch', Slingshot: 'Pebble', Lumberjack: 'Chop', Hunter: 'Bullet', Medic: 'Heal', Bait: 'Taunt', Grenadier: 'Grenade', Zookeeper: 'Net', Commander: 'Rally' };
fs.mkdirSync(out, { recursive: true });
for (const u of units) {
  const K = anims[KIND[u]]; const shots = [[null, 0]];
  for (const name of K.cycle) for (const k of K.clips[name].keys) shots.push([name, k.t]);
  const files = [];
  for (const [i, [clip, t]] of shots.entries()) for (const [v, cp] of [['side', [-13, 3.5, 0]], ['front', [-8, 3.8, -10]]]) {
    await page.evaluate(([u, c, t, cp]) => window.posePreview(u, c, t, { x: cp[0], y: cp[1], z: cp[2], isVector3: true, clone() { return this; } }), [u, clip, t, cp]);
    const f = path.join(out, `${u}_${i}_${v}.png`); await page.screenshot({ path: f, clip: { x: 240, y: 20, width: 480, height: 500 } }); files.push(f);
  }
  const cols = shots.length;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...files.flatMap(f => ['-i', f]), '-filter_complex',
    `xstack=inputs=${files.length}:layout=` + files.map((_, n) => `${Math.floor(n / 2) * 480}_${(n % 2) * 500}`).join('|'), path.join(out, `pose_${u}.png`)]);
  files.forEach(f => fs.rmSync(f)); console.log('sheet', u, cols);
}
await browser.close(); srv.close();
