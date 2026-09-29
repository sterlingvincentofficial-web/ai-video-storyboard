// Convert the single-file Vite build into an Artifact page body (no doctype/html/head/body tags).
import fs from 'node:fs';
const [,, src = 'dist-single/index.html', out] = process.argv;
let html = fs.readFileSync(src, 'utf8');
const title = (html.match(/<title>[\s\S]*?<\/title>/) || ['<title>Toonfire</title>'])[0];
const head = (html.match(/<head>([\s\S]*?)<\/head>/) || ['', ''])[1];
const body = (html.match(/<body>([\s\S]*?)<\/body>/) || ['', ''])[1];
// keep font links, styles and scripts from head; drop metas/title (skeleton supplies charset + viewport)
const keep = [];
const re = /<link[^>]*fonts\.(googleapis|gstatic)[^>]*>|<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g;
let m;
while ((m = re.exec(head))) keep.push(m[0]);
const extra = `<style>:root{color-scheme:dark;background:#1b1440}html,body{background:#1b1440;height:100%}</style>`;
const page = `${title}\n<meta name="theme-color" content="#1b1440" />\n${extra}\n${keep.join('\n')}\n${body.trim()}\n`;
fs.writeFileSync(out, page);
console.log('wrote', out, (page.length / 1024).toFixed(0) + 'KB');
