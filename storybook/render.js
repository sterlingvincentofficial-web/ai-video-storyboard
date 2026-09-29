// Renders anim.html frame by frame. Usage:
//   node render.js stills 1.5,10,20        -> still_<t>.png
//   node render.js video <f0> <f1> <out>   -> h264 segment + <out>.ev.json (sound-effect cues)
const PW = process.env.PW || '/usr/local/lib/node_modules/playwright';
const {chromium} = require(PW);
const {spawn} = require('child_process'), fs = require('fs');
const FF = process.env.FF || 'ffmpeg', URL = process.env.ANIM_URL || 'http://127.0.0.1:8765/anim.html';
const [,, mode, a, b, out] = process.argv, FPS = 30;
(async () => {
  const br = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME} : {});
  const pg = await br.newPage({viewport: {width: 1920, height: 1080}});
  pg.on('pageerror', e => console.error('PAGEERROR', e.message));
  await pg.goto(URL); await pg.evaluate(() => window.ready);
  if (mode === 'stills') {
    for (const t of a.split(',')) { await pg.evaluate(t => render(t), +t); await pg.locator('#c').screenshot({path: `still_${t}.png`}); }
    await br.close(); return;
  }
  const ff = spawn(FF, ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '' + FPS, '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', out], {stdio: ['pipe', 'ignore', 'inherit']});
  for (let f = +a; f < +b; f++) {
    const d = await pg.evaluate(t => { render(t); return document.getElementById('c').toDataURL('image/jpeg', .93); }, f / FPS);
    if (!ff.stdin.write(Buffer.from(d.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  fs.writeFileSync(out + '.ev.json', JSON.stringify(await pg.evaluate(() => ({ev: [...EV], bounds: BOUNDS}))));
  await br.close();
})();
