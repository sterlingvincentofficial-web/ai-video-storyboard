// Renders every hand-coded illustration in illustrate.html to assets/.
const PW = process.env.PW || '/usr/local/lib/node_modules/playwright';
const {chromium} = require(PW), fs = require('fs'), path = require('path');
(async () => {
  const br = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME} : {});
  const pg = await br.newPage();
  pg.on('pageerror', e => { console.error('PAGEERROR', e.message); process.exitCode = 1; });
  await pg.goto('file://' + path.join(__dirname, 'illustrate.html'));
  fs.mkdirSync(path.join(__dirname, 'assets'), {recursive: true});
  for (const n of await pg.evaluate(() => NAMES)) {
    const d = await pg.evaluate(n => art(n), n);
    fs.writeFileSync(path.join(__dirname, 'assets', n + (n[0] === 'b' ? '.jpg' : '.png')), Buffer.from(d.split(',')[1], 'base64'));
    console.log('drew', n);
  }
  await br.close();
})();
