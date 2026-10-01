// Bots, memory, and the group "conductor" that lets bots talk and work with each other.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { state, saveState, getChat, saveChat, clearChat, deleteChat, uid, WORKSPACES_DIR } from './store.js';
import { runTurn, resolveBin, PROVIDERS } from './providers.js';

export const bus = new EventEmitter();
bus.setMaxListeners(100);
const emit = (type, data) => bus.emit('event', { type, ...data });

const BACKLOG = 40; // messages replayed to a brand-new session joining an existing conversation

// ------------------------------------------------------------------ helpers
export const handleOf = (name) => String(name || '').replace(/[^\p{L}\p{N}_.-]/gu, '');

export function ctxInfo(ctx) {
  const [kind, id] = ctx.split(':');
  if (kind === 'dm') { const bot = state.bots[id]; return bot ? { kind, id, bot, botIds: [id] } : null; }
  if (kind === 'group') { const group = state.groups[id]; return group ? { kind, id, group, botIds: group.botIds.filter((b) => state.bots[b]) } : null; }
  return null;
}

export function workdirFor(ctx) {
  const info = ctxInfo(ctx);
  const custom = info?.kind === 'group' ? info.group.workdir : info?.bot?.workdir;
  const dir = custom ? custom.replace(/^~(?=\/|$)/, process.env.HOME || '') : path.join(WORKSPACES_DIR, ctx.replace(':', '-'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function addMessage(ctx, msg) {
  const chat = getChat(ctx);
  const seq = (chat.at(-1)?.seq || 0) + 1;
  const m = { id: uid(), seq, ts: Date.now(), ...msg };
  chat.push(m);
  saveChat(ctx);
  emit('message', { ctx, message: m });
  return m;
}

function updateMessage(ctx, m, patch) {
  Object.assign(m, patch);
  saveChat(ctx);
  emit('message', { ctx, message: m });
}

function speakerName(m) {
  if (m.role === 'user') return `${state.settings.userName || 'You'} (human)`;
  if (m.role === 'bot') return state.bots[m.botId]?.name || m.botName || 'Removed bot';
  return 'System';
}

function rosterLine(bot) {
  const model = bot.model ? ` · ${bot.model}` : '';
  const goal = (bot.goal || '').split('\n')[0].slice(0, 160);
  return `- @${handleOf(bot.name)} (${PROVIDERS[bot.provider]?.label || bot.provider}${model})${goal ? `: ${goal}` : ''}`;
}

function systemPromptFor(bot, ctx, cwd) {
  const info = ctxInfo(ctx);
  const user = state.settings.userName || 'You';
  const lines = [
    `You are "${bot.name}", an AI bot inside Bot Hub — a local app where ${user} runs several AI bots (Claude and Codex) that chat with them and work with each other.`,
    '',
    '## Your goal / instructions',
    bot.goal?.trim() || '(none set — be a helpful collaborator)',
    '',
    '## Your long-term memory',
    bot.memory?.trim() || '(empty)',
    'To save something to long-term memory (it persists across all your chats and groups), write a line like: [[remember: the fact to keep]]',
    '',
    `## Working folder\n${cwd}\nPut any files you create here.`,
  ];
  if (info?.kind === 'group') {
    const g = info.group;
    const others = info.botIds.filter((b) => b !== bot.id).map((b) => rosterLine(state.bots[b]));
    lines.push(
      '',
      `## Group chat: "${g.name}"`,
      g.goal?.trim() ? `Group mission: ${g.goal.trim()}` : '',
      'Members:',
      `- @${handleOf(user)}: the human who runs this group`,
      ...others,
      `- @${handleOf(bot.name)}: you`,
      '',
      '## How this group works',
      '- New messages from others arrive formatted as "[Name]: text". Reply with only your own message — never prefix it with your name and never write lines for other members.',
      '- Mention @Name to hand a task or question to a specific bot. It will speak next.',
      `- Mention @${handleOf(user)} when you need the human's input or approval; the group pauses for them.`,
      '- Build on what others said; don\'t repeat their work. Divide tasks sensibly. Keep messages focused.',
      '- The working folder above is shared by the whole group — use it to hand files to each other.',
      '- If you have nothing useful to add right now, reply with exactly [PASS].',
      '- When the group\'s current task is fully complete, end your message with [DONE].',
    );
  }
  return lines.filter((l) => l !== null).join('\n');
}

function formatMessages(msgs) {
  return msgs.map((m) => `[${speakerName(m)}]: ${m.text}`).join('\n\n');
}

function parseMentions(text, botIds, selfId) {
  const found = [];
  const re = /@([\p{L}\p{N}_.-]+)/gu;
  let m;
  while ((m = re.exec(text))) {
    const h = m[1].replace(/[.]+$/, '').toLowerCase();
    const id = botIds.find((b) => b !== selfId && handleOf(state.bots[b].name).toLowerCase() === h);
    if (id && !found.includes(id)) found.push(id);
  }
  return found;
}

function mentionsUser(text) {
  const h = handleOf(state.settings.userName || 'You').toLowerCase();
  const re = /@([\p{L}\p{N}_.-]+)/gu;
  let m;
  while ((m = re.exec(text))) {
    const t = m[1].replace(/[.]+$/, '').toLowerCase();
    if (t === h || t === 'user' || t === 'human') return true;
  }
  return false;
}

// ------------------------------------------------------------------ one bot turn
async function botTurn(ctx, botId, signal, { kickoff = false } = {}) {
  const bot = state.bots[botId];
  if (!bot) return null;
  const info = ctxInfo(ctx);
  const chat = getChat(ctx);
  const cwd = workdirFor(ctx);
  bot.sessions ||= {};
  let sess = bot.sessions[ctx];
  if (!sess || sess.provider !== bot.provider || sess.cwd !== cwd) {
    sess = bot.sessions[ctx] = { provider: bot.provider, cwd, sessionId: null, seenSeq: 0, sysHash: null };
  }

  // Messages still being written when we built the prompt are remembered in `skipped` and delivered next time.
  const isVisible = (m) => m.role !== 'system' && m.status !== 'error' && !(m.role === 'bot' && m.botId === botId) && !m.pass;
  const unseen = (from) => chat.filter((m) => (m.seq > from || (sess.skipped || []).includes(m.seq)) && isVisible(m));
  const lastSeq = chat.at(-1)?.seq || 0;

  if (signal?.aborted) return { stopped: true };
  const placeholder = addMessage(ctx, { role: 'bot', botId, botName: bot.name, provider: bot.provider, model: bot.model || '', text: '', status: 'thinking', activity: [] });
  emit('run', { ctx, botId, status: 'thinking' });

  const bin = await resolveBin(bot.provider, bot.provider === 'claude' ? state.settings.claudePath : state.settings.codexPath);
  if (!bin) {
    updateMessage(ctx, placeholder, { status: 'error', text: `${PROVIDERS[bot.provider].label} CLI not found. Open Settings to install / sign in.` });
    return { error: true };
  }

  const attempt = async (fresh) => {
    if (fresh) Object.assign(sess, { sessionId: null, sysHash: null });
    const isNew = !sess.sessionId;
    // A brand-new session gets recent history so it can catch up; otherwise just what's new.
    const candidates = unseen(isNew ? 0 : sess.seenSeq).filter((m) => m.seq < placeholder.seq);
    const skipped = candidates.filter((m) => m.status === 'thinking').map((m) => m.seq);
    let msgs = candidates.filter((m) => m.status !== 'thinking');
    if (isNew) msgs = msgs.slice(-BACKLOG);
    const sys = systemPromptFor(bot, ctx, cwd);
    const sysHash = crypto.createHash('sha1').update(sys).digest('hex');

    let prompt;
    if (info.kind === 'dm' && msgs.every((m) => m.role === 'user')) {
      prompt = msgs.map((m) => m.text).join('\n\n') || 'Continue.';
    } else {
      const header = info.kind === 'group' ? `New messages in "${info.group.name}" since your last turn:` : 'Conversation so far:';
      prompt = msgs.length ? `${header}\n\n${formatMessages(msgs)}\n\n` : '';
      prompt += info.kind === 'group'
        ? `— It's your turn, @${handleOf(bot.name)}. ${kickoff ? 'Keep the work moving.' : ''} Reply with [PASS] if you have nothing to add.`
        : '';
    }
    // Codex has no system-prompt flag, so its context rides along whenever it changes.
    if (bot.provider === 'codex' && sess.sysHash !== sysHash) prompt = `<bot-context>\n${sys}\n</bot-context>\n\n${prompt}`;

    const sessionId = sess.sessionId || (bot.provider === 'claude' ? crypto.randomUUID() : null);
    let streamed = '';
    const res = await runTurn({
      provider: bot.provider, bin, model: bot.model, permissions: bot.permissions || 'edit', cwd, prompt,
      systemPrompt: bot.provider === 'claude' ? sys : null, sessionId, isNew, signal,
      onEvent: (ev) => {
        if (ev.type === 'delta') { streamed += ev.text; placeholder.text = streamed; emit('delta', { ctx, id: placeholder.id, text: ev.text }); }
        if (ev.type === 'activity') { placeholder.activity.push(ev.text); emit('activity', { ctx, id: placeholder.id, text: ev.text }); }
      },
    });
    sess.sessionId = res.sessionId || sessionId;
    sess.sysHash = sysHash;
    sess.seenSeq = lastSeq;
    sess.skipped = skipped;
    return res;
  };

  try {
    let res;
    try { res = await attempt(false); }
    catch (e) {
      if (!e.sessionProblem) throw e;
      placeholder.activity.push('Session expired — starting a fresh one with recent history');
      res = await attempt(true);
    }
    let text = res.text || '';
    // memory
    const remembered = [];
    text = text.replace(/\[\[\s*remember\s*:\s*([\s\S]*?)\]\]/gi, (_, fact) => { remembered.push(fact.trim()); return ''; });
    if (remembered.length) {
      const date = new Date().toISOString().slice(0, 10);
      bot.memory = `${(bot.memory || '').trim()}\n${remembered.map((f) => `- (${date}) ${f}`).join('\n')}`.trim();
      emit('bots', {});
    }
    // strip an accidental "[Name]:" prefix
    text = text.replace(new RegExp(`^\\s*\\[?@?${bot.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]?\\s*:\\s*`, 'i'), '').trim();
    const pass = /^\[PASS\]\.?$/i.test(text) || (!text && !remembered.length);
    const done = /\[DONE\]/i.test(text);
    updateMessage(ctx, placeholder, { text: pass ? '' : text, status: 'done', pass, done, remembered });
    saveState();
    return { text, pass, done, message: placeholder };
  } catch (e) {
    updateMessage(ctx, placeholder, { status: e.killed ? 'stopped' : 'error', text: placeholder.text || '', error: e.message });
    saveState();
    return { error: true, stopped: !!e.killed };
  }
}

// ------------------------------------------------------------------ conductor
const runs = new Map(); // ctx -> { controller, pending: [], turns, botId, wake }

export function runStatus() {
  const out = {};
  for (const [ctx, r] of runs) out[ctx] = { botIds: [...r.active], turns: r.turns };
  return out;
}

function emitRun(ctx) {
  const r = runs.get(ctx);
  emit('run', { ctx, running: !!r, botIds: r ? [...r.active] : [], turns: r?.turns || 0 });
}

export function postMessage(ctx, text) {
  const info = ctxInfo(ctx);
  if (!info) throw new Error('Unknown conversation');
  const msg = addMessage(ctx, { role: 'user', text });
  if (!info.botIds.length) { addMessage(ctx, { role: 'system', text: 'Add some bots to this group first.' }); return msg; }
  const existing = runs.get(ctx);
  if (existing) {
    // Already running: bots will see this message on their next turn; mentions jump the queue.
    const mentioned = parseMentions(text, info.botIds, null);
    existing.pending.unshift(...mentioned.filter((b) => !existing.pending.includes(b)));
    existing.turns = Math.max(0, existing.turns - 2); // a human nudge buys a couple more turns
    if (info.kind === 'dm') existing.pending.push(info.botIds[0]);
    return msg;
  }
  conduct(ctx, { text });
  return msg;
}

export function continueRun(ctx) {
  if (runs.has(ctx)) return;
  conduct(ctx, { text: '', kickoff: true });
}

export function stopRun(ctx) {
  const r = runs.get(ctx);
  if (!r) return;
  r.pending.length = 0;
  r.stopped = true;
  r.controller.abort();
}

async function conduct(ctx, trigger) {
  const info = ctxInfo(ctx);
  const r = { controller: new AbortController(), pending: [], turns: 0, active: new Set(), stopped: false };
  runs.set(ctx, r);
  emitRun(ctx);
  try {
    if (info.kind === 'dm') {
      r.pending.push(info.id);
      while (r.pending.length && !r.stopped) {
        r.pending.length = 0;
        r.active.add(info.id); emitRun(ctx);
        await botTurn(ctx, info.id, r.controller.signal);
        r.active.delete(info.id);
      }
      return;
    }

    const g = info.group;
    const order = () => ctxInfo(ctx)?.botIds || [];
    const maxTurns = Math.max(1, Number(g.maxTurns) || 8);
    const mode = g.mode || 'roundrobin';
    const mentioned = parseMentions(trigger.text, order(), null);

    if (mode === 'parallel' && !mentioned.length && !trigger.kickoff) {
      const ids = order();
      ids.forEach((id) => r.active.add(id)); emitRun(ctx);
      const results = await Promise.all(ids.map((id) => botTurn(ctx, id, r.controller.signal).finally(() => { r.active.delete(id); emitRun(ctx); })));
      r.turns += ids.length;
      // Follow-ups only if someone explicitly handed off to another bot.
      for (const res of results) if (res?.text) r.pending.push(...parseMentions(res.text, order(), res.message.botId));
      r.pending = [...new Set(r.pending)];
      if (!r.pending.length) return;
    } else if (mentioned.length) {
      r.pending.push(...mentioned);
    } else {
      // Continue picks up after whoever spoke last; a fresh human message starts with the first bot.
      const ids = order();
      const lastBot = trigger.kickoff ? getChat(ctx).findLast((m) => m.role === 'bot' && ids.includes(m.botId))?.botId : null;
      r.pending.push(lastBot ? ids[(ids.indexOf(lastBot) + 1) % ids.length] : ids[0]);
    }

    let passStreak = 0;
    let last = null;
    while (!r.stopped && r.turns < maxTurns) {
      const ids = order();
      if (!ids.length) break;
      let next = r.pending.shift();
      while (next && !ids.includes(next)) next = r.pending.shift();
      if (!next) {
        if (mode !== 'roundrobin' || !last) break;
        next = ids[(ids.indexOf(last) + 1) % ids.length];
        if (ids.length === 1 && last === next && r.turns > 0) break;
      }
      r.active.add(next); emitRun(ctx);
      const res = await botTurn(ctx, next, r.controller.signal, { kickoff: trigger.kickoff && r.turns === 0 });
      r.active.delete(next);
      r.turns++; emitRun(ctx);
      last = next;
      if (!res || res.stopped) break;
      if (res.error) { passStreak++; if (passStreak >= ids.length) break; continue; }
      if (res.pass) { passStreak++; if (passStreak >= ids.length) break; continue; }
      passStreak = 0;
      if (res.done) break;
      if (mentionsUser(res.text)) break; // waiting on the human
      const handoff = parseMentions(res.text, ids, next);
      if (handoff.length) r.pending = [...handoff, ...r.pending.filter((b) => !handoff.includes(b))];
    }
    if (!r.stopped && r.turns >= maxTurns) {
      addMessage(ctx, { role: 'system', text: `Paused after ${r.turns} turns. Hit Continue to let them keep going, or send a message.` });
    }
  } catch (e) {
    console.error('[bot-hub] conductor error', e);
    addMessage(ctx, { role: 'system', text: `Error: ${e.message}` });
  } finally {
    runs.delete(ctx);
    emitRun(ctx);
  }
}

// ------------------------------------------------------------------ CRUD
const COLORS = ['#7c5cff', '#ff7a59', '#18b37e', '#2d9cdb', '#e0a100', '#e8508c', '#00a3a3', '#9b51e0'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const BOT_FIELDS = ['name', 'provider', 'model', 'goal', 'memory', 'permissions', 'workdir', 'emoji', 'color'];
const GROUP_FIELDS = ['name', 'goal', 'botIds', 'mode', 'maxTurns', 'workdir', 'emoji'];

function cleanBot(input, bot = {}) {
  for (const k of BOT_FIELDS) if (k in input) bot[k] = input[k];
  bot.name = String(bot.name || 'New bot').trim().slice(0, 60) || 'New bot';
  if (!PROVIDERS[bot.provider]) bot.provider = 'claude';
  if (!['chat', 'read', 'edit', 'full'].includes(bot.permissions)) bot.permissions = 'edit';
  bot.model = String(bot.model || '').trim();
  bot.workdir = String(bot.workdir || '').trim();
  return bot;
}

export function createBot(input) {
  const bot = cleanBot(input, { id: uid(), createdAt: Date.now(), sessions: {}, memory: '', color: pick(COLORS), emoji: '🤖' });
  state.bots[bot.id] = bot;
  saveState(); emit('bots', {});
  return bot;
}

export function updateBot(id, input) {
  const bot = state.bots[id];
  if (!bot) throw new Error('No such bot');
  const prevProvider = bot.provider;
  cleanBot(input, bot);
  if (bot.provider !== prevProvider) bot.sessions = {}; // can't carry a Claude session into Codex
  saveState(); emit('bots', {});
  return bot;
}

export function deleteBot(id) {
  stopRun(`dm:${id}`);
  delete state.bots[id];
  for (const g of Object.values(state.groups)) g.botIds = g.botIds.filter((b) => b !== id);
  deleteChat(`dm:${id}`);
  saveState(); emit('bots', {}); emit('groups', {});
}

// Wipes the bot's chat sessions (and optionally its saved memory notes).
export function resetBot(id, { memory = false, dm = true } = {}) {
  const bot = state.bots[id];
  if (!bot) throw new Error('No such bot');
  bot.sessions = {};
  if (memory) bot.memory = '';
  if (dm) clearChat(`dm:${id}`);
  saveState(); emit('bots', {}); emit('cleared', { ctx: `dm:${id}` });
}

function cleanGroup(input, g = {}) {
  for (const k of GROUP_FIELDS) if (k in input) g[k] = input[k];
  g.name = String(g.name || 'New group').trim().slice(0, 60) || 'New group';
  g.botIds = [...new Set((g.botIds || []).filter((b) => state.bots[b]))];
  if (!['roundrobin', 'mentions', 'parallel'].includes(g.mode)) g.mode = 'roundrobin';
  g.maxTurns = Math.min(100, Math.max(1, Number(g.maxTurns) || 8));
  g.workdir = String(g.workdir || '').trim();
  return g;
}

export function createGroup(input) {
  const g = cleanGroup(input, { id: uid(), createdAt: Date.now(), emoji: '💬' });
  state.groups[g.id] = g;
  saveState(); emit('groups', {});
  return g;
}

export function updateGroup(id, input) {
  const g = state.groups[id];
  if (!g) throw new Error('No such group');
  cleanGroup(input, g);
  saveState(); emit('groups', {});
  return g;
}

export function deleteGroup(id) {
  stopRun(`group:${id}`);
  delete state.groups[id];
  for (const b of Object.values(state.bots)) delete b.sessions?.[`group:${id}`];
  deleteChat(`group:${id}`);
  saveState(); emit('groups', {});
}

export function clearConversation(ctx) {
  stopRun(ctx);
  clearChat(ctx);
  for (const b of Object.values(state.bots)) delete b.sessions?.[ctx];
  saveState(); emit('cleared', { ctx });
}
