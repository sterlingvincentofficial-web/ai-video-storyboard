// Usage:
//   node render.mjs stills 1.5 9.6 12.4      -> out/still_<t>.jpg
//   node render.mjs video                    -> out/natty_boyz_hype.mp4
import { createRequire } from 'module';
import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const globalRoot = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(globalRoot, 'playwright'));
const FFMPEG = execSync(`python3 -c "import imageio_ffmpeg as i;print(i.get_ffmpeg_exe())"`).toString().trim();

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, 'out');
fs.mkdirSync(OUT, { recursive: true });
const FPS = 30;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', e => { console.error('PAGE ERROR', e); process.exit(1); });
page.on('console', m => m.type() === 'error' && console.error('console:', m.text()));
await page.goto(`http://localhost:${port}/index.html?render`);
await page.evaluate(() => window.ready);
const dur = await page.evaluate(() => window.DURATION);

async function frame(t, q = 0.95) {
  const url = await page.evaluate(([t, q]) => { renderFrame(t); return document.getElementById('c').toDataURL('image/jpeg', q); }, [t, q]);
  return Buffer.from(url.split(',')[1], 'base64');
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'stills') {
  for (const s of rest) fs.writeFileSync(path.join(OUT, `still_${s}.jpg`), await frame(parseFloat(s), 0.85));
  console.log('stills done');
} else {
  const n = Math.round(dur * FPS);
  const silent = path.join(OUT, 'natty_boyz_hype_silent.mp4');
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const buf = await frame(i / FPS, 0.96);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  execSync(`"${FFMPEG}" -y -loglevel error -i "${silent}" -i "${ROOT}/assets/soundtrack.wav" -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart "${OUT}/natty_boyz_hype.mp4"`);
  console.log('video done', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
await browser.close(); server.close();
