#!/usr/bin/env node
// Bot Hub — local multi-bot chat for Claude Code + Codex (signed-in CLIs, no API keys).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { state, saveState, getChat, flushAll, DATA_DIR } from './lib/store.js';
import { PROVIDERS, providerStatus, openLogin, clearBinCache, resolveBin, runTurn, listModels } from './lib/providers.js';
import * as engine from './lib/engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const PORT = Number(process.env.PORT || 4317);
const HOST = process.env.HOST || '127.0.0.1'; // local only

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 2e6) throw new Error('Body too large'); }
  return data ? JSON.parse(data) : {};
}

function publicState() {
  return {
    settings: state.settings,
    bots: Object.values(state.bots).map(({ sessions, ...b }) => ({ ...b, sessionCount: Object.keys(sessions || {}).length })),
    groups: Object.values(state.groups),
    providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, { label: v.label, models: v.models }])),
    runs: engine.runStatus(),
    dataDir: DATA_DIR,
  };
}

const clients = new Set();
engine.bus.on('event', (ev) => {
  const payload = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) res.write(payload);
});
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000).unref();

const routes = [
  ['GET', /^\/api\/state$/, async () => publicState()],
  ['GET', /^\/api\/chat\/([^/]+)$/, async (_, [ctx]) => getChat(ctx)],
  ['POST', /^\/api\/chat\/([^/]+)\/messages$/, async (b, [ctx]) => {
    const text = String(b.text || '').trim();
    if (!text) throw new Error('Empty message');
    return engine.postMessage(ctx, text);
  }],
  ['POST', /^\/api\/chat\/([^/]+)\/stop$/, async (_, [ctx]) => { engine.stopRun(ctx); return { ok: true }; }],
  ['POST', /^\/api\/chat\/([^/]+)\/continue$/, async (_, [ctx]) => { engine.continueRun(ctx); return { ok: true }; }],
  ['POST', /^\/api\/chat\/([^/]+)\/clear$/, async (_, [ctx]) => { engine.clearConversation(ctx); return { ok: true }; }],
  ['POST', /^\/api\/chat\/([^/]+)\/open-folder$/, async (_, [ctx]) => {
    const dir = engine.workdirFor(ctx);
    if (process.platform === 'darwin') execFile('open', [dir]);
    return { dir };
  }],

  ['POST', /^\/api\/bots$/, async (b) => engine.createBot(b)],
  ['PATCH', /^\/api\/bots\/([^/]+)$/, async (b, [id]) => engine.updateBot(id, b)],
  ['DELETE', /^\/api\/bots\/([^/]+)$/, async (_, [id]) => { engine.deleteBot(id); return { ok: true }; }],
  ['POST', /^\/api\/bots\/([^/]+)\/reset$/, async (b, [id]) => { engine.resetBot(id, b); return { ok: true }; }],

  ['POST', /^\/api\/groups$/, async (b) => engine.createGroup(b)],
  ['PATCH', /^\/api\/groups\/([^/]+)$/, async (b, [id]) => engine.updateGroup(id, b)],
  ['DELETE', /^\/api\/groups\/([^/]+)$/, async (_, [id]) => { engine.deleteGroup(id); return { ok: true }; }],

  ['PATCH', /^\/api\/settings$/, async (b) => {
    for (const k of ['userName', 'claudePath', 'codexPath']) if (k in b) state.settings[k] = String(b[k] || '').trim();
    clearBinCache();
    saveState();
    engine.bus.emit('event', { type: 'settings' });
    return state.settings;
  }],
  ['GET', /^\/api\/providers\/status$/, async () => {
    const [claude, codex] = await Promise.all([
      providerStatus('claude', state.settings.claudePath),
      providerStatus('codex', state.settings.codexPath),
    ]);
    return { claude, codex, platform: process.platform };
  }],
  ['GET', /^\/api\/providers\/(claude|codex)\/models$/, async (_, [p]) => listModels(p, state.settings[`${p}Path`])],
  ['POST', /^\/api\/providers\/(claude|codex)\/login$/, async (_, [p]) => openLogin(p, state.settings[`${p}Path`])],
  ['POST', /^\/api\/providers\/(claude|codex)\/test$/, async (b, [p]) => {
    const bin = await resolveBin(p, state.settings[`${p}Path`]);
    if (!bin) throw new Error(`${PROVIDERS[p].label} CLI not found`);
    const started = Date.now();
    const cwd = path.join(DATA_DIR, 'workspaces', '_test');
    fs.mkdirSync(cwd, { recursive: true });
    const r = await runTurn({
      provider: p, bin, model: b.model || '', permissions: 'chat', cwd, isNew: true,
      sessionId: p === 'claude' ? crypto.randomUUID() : null,
      prompt: 'Reply with exactly: Bot Hub connected ✅', onEvent: () => {}, timeoutMs: 120000,
    });
    return { reply: r.text, ms: Date.now() - started };
  }],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Refuse cross-site requests (another website poking your local server).
  if (req.method !== 'GET' && req.headers.origin) {
    const o = new URL(req.headers.origin);
    if (o.host !== req.headers.host) return send(res, 403, { error: 'Cross-origin request blocked' });
  }

  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    for (const [method, re, fn] of routes) {
      const m = url.pathname.match(re);
      if (m && req.method === method) {
        try {
          const body = req.method === 'GET' ? {} : await readBody(req);
          return send(res, 200, await fn(body, m.slice(1).map(decodeURIComponent)));
        } catch (e) {
          return send(res, 400, { error: e.message });
        }
      }
    }
    return send(res, 404, { error: 'Not found' });
  }

  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log(`\n  🤖 Bot Hub is running → ${url}\n  data: ${DATA_DIR}\n  (Ctrl+C to stop)\n`);
  if (process.argv.includes('--open') && process.platform === 'darwin') execFile('open', [url]);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flushAll(); process.exit(0); });
