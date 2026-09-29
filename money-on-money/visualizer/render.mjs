// Usage: node render.mjs frames 2,10,18   -> PNG stills in out/
//        node render.mjs video [fps]       -> out/money_on_money.mp4 (silent, 60s)
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs'; import path from 'path'; import url from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const dir = path.dirname(url.fileURLToPath(import.meta.url));
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const [mode = 'frames', arg = '2,10,18,26,34,42,50,57'] = process.argv.slice(2);
fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--disable-gpu-vsync'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + path.join(dir, 'index.html') + '?render=1');
await page.waitForFunction(() => window.renderAt && document.fonts.status === 'loaded');
const grab = t => page.evaluate(t => { window.renderAt(t); return document.getElementById('c').toDataURL('image/jpeg', 0.93).split(',')[1]; }, t);
if (mode === 'frames') {
  for (const t of arg.split(',').map(Number)) {
    fs.writeFileSync(path.join(dir, 'out', `frame_${String(t).padStart(5, '0')}.jpg`), Buffer.from(await grab(t), 'base64'));
  }
} else {
  const fps = +arg || 60, total = 60 * fps, out = path.join(dir, 'out', 'money_on_money.mp4');
  const ff = spawn(FFMPEG, ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const buf = Buffer.from(await grab(f / fps), 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 300 === 0) console.log(`frame ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); console.log('wrote', out);
}
await browser.close();
