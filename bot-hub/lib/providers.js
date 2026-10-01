// Runs Claude Code and Codex through their own CLIs, so they use the account you signed in
// with (Claude Pro/Max, ChatGPT Plus/Pro) instead of API keys.
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const HOME = os.homedir();
const EXTRA_PATHS = [
  path.join(HOME, '.local/bin'),
  path.join(HOME, '.claude/local'),
  path.join(HOME, '.npm-global/bin'),
  path.join(HOME, '.bun/bin'),
  path.join(HOME, '.volta/bin'),
  path.join(HOME, '.nvm/current/bin'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
];

export const PROVIDERS = {
  claude: {
    label: 'Claude',
    bin: 'claude',
    loginCmd: 'auth login',
    models: ['sonnet', 'opus', 'haiku', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-haiku-4-5'],
  },
  codex: {
    label: 'Codex',
    bin: 'codex',
    loginCmd: 'login',
    models: [], // filled in live from `codex debug models`
  },
};

// Env for child processes: make sure CLIs use your signed-in account, not stray API keys,
// and that `node` & friends are findable even when launched from Finder.
function childEnv(binPath) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.OPENAI_API_KEY;
  delete env.CLAUDECODE; // allow running even if Bot Hub was started from inside Claude Code
  delete env.CLAUDE_CODE_ENTRYPOINT;
  const parts = new Set([binPath ? path.dirname(binPath) : null, ...(env.PATH || '').split(':'), ...EXTRA_PATHS].filter(Boolean));
  env.PATH = [...parts].join(':');
  return env;
}

const binCache = new Map();

function isExecutable(p) {
  try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; }
}

function loginShellWhich(name) {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    execFile(shell, ['-lc', `command -v ${name}`], { timeout: 8000 }, (err, stdout) => {
      const p = String(stdout || '').trim().split('\n').pop();
      resolve(!err && p && isExecutable(p) ? p : null);
    });
  });
}

export async function resolveBin(provider, override) {
  if (override) return isExecutable(override) ? override : null;
  const name = PROVIDERS[provider].bin;
  if (binCache.has(name)) return binCache.get(name);
  let found = null;
  for (const dir of [...(process.env.PATH || '').split(':'), ...EXTRA_PATHS]) {
    if (dir && isExecutable(path.join(dir, name))) { found = path.join(dir, name); break; }
  }
  if (!found) found = await loginShellWhich(name);
  if (found) binCache.set(name, found);
  return found;
}

export function clearBinCache() { binCache.clear(); modelCache.clear(); }

function run(bin, args, { timeout = 15000 } = {}) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, env: childEnv(bin) }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export async function providerStatus(provider, override) {
  const bin = await resolveBin(provider, override);
  if (!bin) return { provider, installed: false, loggedIn: false, bin: null };
  const ver = await run(bin, ['--version']);
  const version = (ver.stdout || ver.stderr).trim().split('\n')[0];
  let loggedIn = false;
  let detail = '';
  if (provider === 'claude') {
    const r = await run(bin, ['auth', 'status', '--json']);
    try {
      const j = JSON.parse(r.stdout);
      loggedIn = !!j.loggedIn;
      detail = [j.authMethod, j.email || j.account?.email].filter(Boolean).join(' · ');
    } catch { detail = (r.stdout || r.stderr).trim().slice(0, 200); }
  } else {
    const r = await run(bin, ['login', 'status']);
    const out = `${r.stdout}\n${r.stderr}`.trim();
    loggedIn = r.code === 0 && !/not logged in/i.test(out);
    detail = out.split('\n')[0].slice(0, 200);
  }
  return { provider, installed: true, loggedIn, bin, version, detail };
}

// Model suggestions. Codex can list its own catalog; Claude takes aliases that always track the latest.
const modelCache = new Map();
export async function listModels(provider, override) {
  if (provider !== 'codex') return PROVIDERS[provider].models;
  if (modelCache.has(provider)) return modelCache.get(provider);
  const bin = await resolveBin(provider, override);
  if (!bin) return [];
  const r = await run(bin, ['debug', 'models'], { timeout: 20000 });
  let models = [];
  try {
    const line = r.stdout.split('\n').find((l) => l.trim().startsWith('{'));
    models = JSON.parse(line).models
      .filter((m) => m.visibility !== 'hide')
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
      .map((m) => m.slug);
  } catch {}
  if (models.length) modelCache.set(provider, models);
  return models;
}

// Opens Terminal.app with the provider's sign-in command (browser-based login).
export async function openLogin(provider, override) {
  const bin = await resolveBin(provider, override);
  const cmd = `${bin ? `'${bin}'` : PROVIDERS[provider].bin} ${PROVIDERS[provider].loginCmd}`;
  if (process.platform !== 'darwin') return { opened: false, command: cmd };
  const script = `tell application "Terminal"\n activate\n do script ${JSON.stringify(cmd)}\nend tell`;
  await new Promise((resolve) => execFile('osascript', ['-e', script], () => resolve()));
  return { opened: true, command: cmd };
}

// ---------------------------------------------------------------------------------------------
// One "turn": send a prompt to a bot's session and stream back what it does.
//
// opts: { provider, bin, model, permissions, cwd, prompt, systemPrompt, sessionId, isNew,
//         signal, onEvent(evt), timeoutMs }
// evt:  { type: 'delta', text } | { type: 'activity', text } | { type: 'session', sessionId }
// resolves: { text, sessionId }
// ---------------------------------------------------------------------------------------------
export function runTurn(opts) {
  return opts.provider === 'codex' ? runCodex(opts) : runClaude(opts);
}

function spawnJsonl({ bin, args, cwd, stdin, signal, timeoutMs = 30 * 60_000, onLine }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: childEnv(bin), stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    let stderr = '';
    let killed = null;
    const kill = (why) => {
      if (killed) return;
      killed = why;
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 4000).unref();
    };
    const timer = setTimeout(() => kill('timed out'), timeoutMs);
    const onAbort = () => kill('stopped');
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        try { onLine(obj); } catch (e) { console.error('[bot-hub] event handler error', e); }
      }
    });
    child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-8000); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (buf.trim()) { try { onLine(JSON.parse(buf.trim())); } catch {} }
      resolve({ code, stderr, killed });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

function summarizeTool(name, input = {}) {
  const s = input.file_path || input.path || input.command || input.pattern || input.url || input.query || input.description || '';
  return `${name}${s ? ` · ${String(s).slice(0, 140)}` : ''}`;
}

async function runClaude({ bin, model, permissions, cwd, prompt, systemPrompt, sessionId, isNew, signal, onEvent, timeoutMs }) {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (model) args.push('--model', model);
  args.push(isNew ? '--session-id' : '--resume', sessionId);
  if (systemPrompt) args.push('--append-system-prompt', systemPrompt);
  if (permissions === 'chat') args.push('--tools', '');
  else if (permissions === 'edit') args.push('--permission-mode', 'acceptEdits');
  else if (permissions === 'full') args.push('--dangerously-skip-permissions');
  // 'read' = default mode: reading/searching works, anything needing approval is declined.

  let result = null;
  let errorText = '';
  let streamed = '';
  const { code, stderr, killed } = await spawnJsonl({
    bin, args, cwd, stdin: prompt, signal, timeoutMs,
    onLine: (ev) => {
      if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta' && !ev.parent_tool_use_id) {
        streamed += ev.event.delta.text;
        onEvent({ type: 'delta', text: ev.event.delta.text });
      } else if (ev.type === 'stream_event' && ev.event?.type === 'message_start' && !ev.parent_tool_use_id && streamed) {
        streamed += '\n\n';
        onEvent({ type: 'delta', text: '\n\n' });
      } else if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
        for (const b of ev.message.content) {
          if (b.type === 'tool_use') onEvent({ type: 'activity', text: summarizeTool(b.name, b.input) });
        }
      } else if (ev.type === 'result') {
        result = ev;
        if (ev.is_error) errorText = ev.result || ev.subtype || 'error';
      }
    },
  });
  if (killed) throw Object.assign(new Error(killed), { killed: true });
  if (!result || errorText) {
    const msg = errorText || stderr.trim().split('\n').slice(-3).join(' ') || `claude exited with code ${code}`;
    throw Object.assign(new Error(msg), { sessionProblem: /no conversation found|session/i.test(msg) && !isNew });
  }
  const text = typeof result.result === 'string' && result.result.trim() ? result.result : streamed;
  return { text: text.trim(), sessionId: result.session_id || sessionId };
}

async function runCodex({ bin, model, permissions, cwd, prompt, sessionId, isNew, signal, onEvent, timeoutMs }) {
  const outFile = path.join(os.tmpdir(), `bothub-codex-${crypto.randomUUID()}.txt`);
  const common = ['--json', '--skip-git-repo-check', '-o', outFile];
  if (model) common.push('-m', model);
  if (permissions === 'full') common.push('--dangerously-bypass-approvals-and-sandbox');
  else {
    const sandbox = permissions === 'edit' ? 'workspace-write' : 'read-only';
    common.push('-c', `sandbox_mode="${sandbox}"`, '-c', 'approval_policy="never"');
  }
  const args = isNew || !sessionId
    ? ['exec', ...common, '-']
    : ['exec', 'resume', ...common, sessionId, '-'];

  let newSession = null;
  let lastMessage = '';
  let errorText = '';
  const seen = new Set();
  const { code, stderr, killed } = await spawnJsonl({
    bin, args, cwd, stdin: prompt, signal, timeoutMs,
    onLine: (ev) => {
      // Current format: thread.started / item.* / turn.* ; legacy format: { msg: { type, ... } }
      if (ev.type === 'thread.started' && ev.thread_id) newSession = ev.thread_id;
      if (ev.msg?.type === 'session_configured' && ev.msg.session_id) newSession = ev.msg.session_id;
      const item = ev.item;
      if (item && (ev.type === 'item.started' || ev.type === 'item.completed')) {
        const key = `${item.id}:${item.type}`;
        if (item.type === 'agent_message' && ev.type === 'item.completed' && item.text) {
          lastMessage = item.text;
          onEvent({ type: 'delta', text: (seen.size && lastMessage ? '\n\n' : '') + item.text });
          seen.add(key);
        } else if (!seen.has(key)) {
          let act = null;
          if (item.type === 'command_execution') act = `Bash · ${String(item.command || '').slice(0, 140)}`;
          else if (item.type === 'file_change') act = `Edit · ${(item.changes || []).map((c) => c.path).join(', ').slice(0, 140)}`;
          else if (item.type === 'web_search') act = `WebSearch · ${item.query || ''}`;
          else if (item.type === 'mcp_tool_call') act = `${item.server || 'mcp'} · ${item.tool || ''}`;
          if (act) { seen.add(key); onEvent({ type: 'activity', text: act }); }
        }
      }
      if (ev.msg?.type === 'agent_message' && ev.msg.message) {
        lastMessage = ev.msg.message;
        onEvent({ type: 'delta', text: ev.msg.message });
      }
      if (ev.msg?.type === 'exec_command_begin') onEvent({ type: 'activity', text: `Bash · ${[].concat(ev.msg.command || []).join(' ').slice(0, 140)}` });
      if (ev.type === 'turn.failed') errorText = ev.error?.message || 'turn failed';
      if (ev.type === 'error' && ev.message) errorText = ev.message;
      if (ev.msg?.type === 'error') errorText = ev.msg.message || 'error';
    },
  });
  let fileText = '';
  try { fileText = fs.readFileSync(outFile, 'utf8'); fs.rmSync(outFile, { force: true }); } catch {}
  if (killed) throw Object.assign(new Error(killed), { killed: true });
  const text = (fileText || lastMessage).trim();
  if (!text && (errorText || code !== 0)) {
    const msg = errorText || stderr.trim().split('\n').slice(-3).join(' ') || `codex exited with code ${code}`;
    throw Object.assign(new Error(msg), { sessionProblem: !isNew && /session|thread|rollout|not found/i.test(msg) });
  }
  return { text, sessionId: newSession || sessionId };
}
