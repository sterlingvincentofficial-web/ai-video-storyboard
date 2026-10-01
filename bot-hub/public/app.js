// Bot Hub front-end (no build step, no dependencies).
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const handleOf = (name) => String(name || '').replace(/[^\p{L}\p{N}_.-]/gu, '');

const S = { settings: {}, bots: [], groups: [], providers: {}, runs: {}, current: null, chat: [], status: null };
const COLORS = ['#7c5cff', '#ff7a59', '#18b37e', '#2d9cdb', '#e0a100', '#e8508c', '#00a3a3', '#9b51e0'];
const PERMS = {
  chat: ['Chat only', 'No tools — just talks.'],
  read: ['Read files', 'Can read & search files in its folder, but not change anything.'],
  edit: ['Edit files', 'Can create & edit files inside its working folder. (Recommended)'],
  full: ['Full access', 'Runs commands & edits anywhere without asking. Only for trusted tasks.'],
};
const MODES = {
  roundrobin: ['Round-robin', 'Bots take turns in order (an @mention jumps the line) until the task is done or the turn limit hits.'],
  mentions: ['Hand-off', 'The first bot leads; bots only speak when someone @mentions them.'],
  parallel: ['Everyone at once', 'Every bot answers your message in parallel — great for comparing takes.'],
};

// ------------------------------------------------------------------ api
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

async function loadState() {
  Object.assign(S, await api('GET', '/api/state'));
  renderSidebar();
  renderHeader();
  renderMentionBar();
}
async function loadStatus() {
  try {
    S.status = await api('GET', '/api/providers/status');
    for (const p of ['claude', 'codex']) {
      const s = S.status[p];
      const el = $(`#conn-${p}`);
      el.className = `conn ${s.installed && s.loggedIn ? 'ok' : 'bad'}`;
      el.title = `${p === 'claude' ? 'Claude' : 'Codex'}: ${!s.installed ? 'not installed' : s.loggedIn ? 'signed in' : 'not signed in'}`;
    }
  } catch {}
}

const botById = (id) => S.bots.find((b) => b.id === id);
const groupById = (id) => S.groups.find((g) => g.id === id);
const ctxBusy = (ctx) => !!S.runs[ctx];

// ------------------------------------------------------------------ sidebar
function avatar(bot, size = '') {
  if (!bot) return `<div class="avatar ${size}" style="background:#444">?</div>`;
  return `<div class="avatar ${size}" style="background:${esc(bot.color || '#555')}">${esc(bot.emoji || '🤖')}<span class="pdot ${esc(bot.provider)}"></span></div>`;
}
function groupAvatar(g, size = '') {
  return `<div class="avatar ${size}" style="background:var(--panel-2)">${esc(g.emoji || '💬')}</div>`;
}

function renderSidebar() {
  const gl = $('#group-list');
  gl.innerHTML = S.groups.length ? '' : '<div class="empty-side">No groups yet</div>';
  for (const g of S.groups) {
    const ctx = `group:${g.id}`;
    const el = document.createElement('button');
    el.className = `item ${S.current === ctx ? 'active' : ''}`;
    const names = g.botIds.map((id) => botById(id)?.name).filter(Boolean).join(', ');
    el.innerHTML = `${groupAvatar(g)}<div class="meta"><div class="name">${esc(g.name)}</div><div class="sub">${esc(names || 'no members')}</div></div>${ctxBusy(ctx) ? '<span class="busy-dot"></span>' : ''}`;
    el.onclick = () => openCtx(ctx);
    gl.appendChild(el);
  }
  const bl = $('#bot-list');
  bl.innerHTML = S.bots.length ? '' : '<div class="empty-side">No bots yet</div>';
  for (const b of S.bots) {
    const ctx = `dm:${b.id}`;
    const busy = Object.values(S.runs).some((r) => r.botIds.includes(b.id));
    const el = document.createElement('button');
    el.className = `item ${S.current === ctx ? 'active' : ''}`;
    el.innerHTML = `${avatar(b)}<div class="meta"><div class="name">${esc(b.name)}</div><div class="sub">${esc(providerLabel(b))}</div></div>${busy ? '<span class="busy-dot"></span>' : ''}`;
    el.onclick = () => openCtx(ctx);
    bl.appendChild(el);
  }
}
const providerLabel = (b) => `${b.provider === 'codex' ? 'Codex' : 'Claude'}${b.model ? ` · ${b.model}` : ''}`;

// ------------------------------------------------------------------ header
function renderHeader() {
  const h = $('#chat-header');
  const ctx = S.current;
  if (!ctx) { h.innerHTML = '<div class="grow"><div class="title">Bot Hub</div><div class="subtitle">Claude + Codex, working together</div></div>'; return; }
  const [kind, id] = ctx.split(':');
  const busy = ctxBusy(ctx);
  const run = S.runs[ctx];
  if (kind === 'dm') {
    const b = botById(id);
    if (!b) return;
    h.innerHTML = `${avatar(b, 'lg')}
      <div class="grow"><div class="title">${esc(b.name)}</div>
        <div class="subtitle"><span class="badge ${esc(b.provider)}">${b.provider === 'codex' ? 'Codex' : 'Claude'}</span>${b.model ? `<span class="chip">${esc(b.model)}</span>` : ''}<span class="chip">${esc(PERMS[b.permissions]?.[0] || '')}</span>
        ${b.goal ? `<span>${esc(b.goal.split('\n')[0].slice(0, 90))}</span>` : ''}</div></div>
      ${busy ? '<button class="btn stop" data-act="stop">■ Stop</button>' : ''}
      <button class="btn" data-act="folder" title="Open working folder">📁</button>
      <button class="btn" data-act="edit">Edit bot</button>`;
  } else {
    const g = groupById(id);
    if (!g) return;
    const members = g.botIds.map(botById).filter(Boolean);
    h.innerHTML = `${groupAvatar(g, 'lg')}
      <div class="grow"><div class="title">${esc(g.name)}</div>
        <div class="subtitle"><div class="stack">${members.map((b) => avatar(b, 'sm')).join('')}</div>
        <span class="chip">${esc(MODES[g.mode]?.[0] || '')}</span><span class="chip">max ${g.maxTurns} turns</span>
        ${busy ? `<span>turn ${run.turns}${run.botIds.length ? ` · ${run.botIds.map((b) => esc(botById(b)?.name)).join(', ')} working…` : ''}</span>` : ''}</div></div>
      ${busy ? '<button class="btn stop" data-act="stop">■ Stop</button>' : '<button class="btn" data-act="continue" title="Let the bots keep going without a new message">▶ Continue</button>'}
      <button class="btn" data-act="folder" title="Open shared folder">📁</button>
      <button class="btn" data-act="edit">Edit group</button>`;
  }
  h.querySelectorAll('[data-act]').forEach((btn) => {
    btn.onclick = async () => {
      const act = btn.dataset.act;
      if (act === 'stop') await api('POST', `/api/chat/${ctx}/stop`);
      if (act === 'continue') await api('POST', `/api/chat/${ctx}/continue`);
      if (act === 'folder') { const r = await api('POST', `/api/chat/${ctx}/open-folder`); toast(r.dir); }
      if (act === 'edit') kind === 'dm' ? botModal(botById(id)) : groupModal(groupById(id));
    };
  });
}

function renderMentionBar() {
  const bar = $('#mention-bar');
  const hint = $('#composer-hint');
  bar.innerHTML = '';
  if (!S.current) return;
  const [kind, id] = S.current.split(':');
  if (kind === 'group') {
    const g = groupById(id);
    for (const b of (g?.botIds || []).map(botById).filter(Boolean)) {
      const btn = document.createElement('button');
      btn.innerHTML = `${avatar(b, 'sm')}@${esc(handleOf(b.name))}`;
      btn.onclick = () => insertText(`@${handleOf(b.name)} `);
      bar.appendChild(btn);
    }
    hint.textContent = 'Enter to send · Shift+Enter for a new line · @mention a bot to talk to it directly';
  } else {
    hint.textContent = 'Enter to send · Shift+Enter for a new line · this bot remembers the whole conversation';
  }
}
function insertText(t) {
  const i = $('#input');
  const pos = i.selectionStart ?? i.value.length;
  i.value = i.value.slice(0, pos) + t + i.value.slice(pos);
  i.focus(); i.selectionStart = i.selectionEnd = pos + t.length; autosize();
}

// ------------------------------------------------------------------ messages
function md(src) {
  // Small, safe markdown: escape first, then format.
  const blocks = [];
  let s = String(src || '').replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => { blocks.push(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/(^|[\s(])@([\p{L}\p{N}_.-]+)/gu, '$1<span class="mention">@$2</span>')
    .replace(/\[DONE\]/g, '<span class="done-tag">DONE</span>');
  const out = [];
  let list = null;
  for (const line of s.split('\n')) {
    const ul = line.match(/^\s*[-*•]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (list !== tag) { if (list) out.push(`</${list}>`); out.push(`<${tag}>`); list = tag; }
      out.push(`<li>${(ul || ol)[1]}</li>`);
      continue;
    }
    if (list) { out.push(`</${list}>`); list = null; }
    if (h) out.push(`<h${h[1].length + 1}>${h[2]}</h${h[1].length + 1}>`);
    else if (line.startsWith('&gt; ')) out.push(`<blockquote>${line.slice(5)}</blockquote>`);
    else if (line.trim() === '') out.push('<br>');
    else out.push(`<p>${line}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join('').replace(/(<br>){2,}/g, '<br>').replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
}

const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function messageEl(m) {
  const el = document.createElement('div');
  el.dataset.id = m.id;
  if (m.role === 'user') {
    el.className = 'msg user';
    el.innerHTML = `<div class="bubble">${esc(m.text).replace(/(^|\s)@([\p{L}\p{N}_.-]+)/gu, '$1<span class="mention">@$2</span>')}</div>`;
    return el;
  }
  if (m.role === 'system') { el.className = 'msg system'; el.innerHTML = `<span>${esc(m.text)}</span>`; return el; }
  const bot = botById(m.botId) || { name: m.botName || 'Removed bot', provider: m.provider, color: '#555', emoji: '🤖' };
  if (m.pass && m.status === 'done') { el.className = 'msg pass'; el.textContent = `${bot.name} passed`; return el; }
  el.className = 'msg bot';
  const acts = m.activity || [];
  el.innerHTML = `${avatar(bot)}
    <div class="body">
      <div class="who"><b style="color:${esc(bot.color)}">${esc(bot.name)}</b><span class="badge ${esc(m.provider || bot.provider)}">${m.provider === 'codex' ? 'Codex' : 'Claude'}</span>${m.model ? `<span class="chip">${esc(m.model)}</span>` : ''}<span class="time">${fmtTime(m.ts)}</span></div>
      ${acts.length ? `<details class="activity" ${m.status === 'thinking' ? 'open' : ''}><summary>🔧 ${acts.length} action${acts.length > 1 ? 's' : ''}</summary><ol>${acts.map((a) => `<li>${esc(a)}</li>`).join('')}</ol></details>` : ''}
      <div class="text">${m.text ? md(m.text) : ''}</div>
      ${m.status === 'thinking' ? '<div class="thinking"><i></i><i></i><i></i></div>' : ''}
      ${m.status === 'stopped' ? '<div class="stopped">■ stopped</div>' : ''}
      ${m.status === 'error' ? `<div class="error">⚠ ${esc(m.error || m.text || 'Something went wrong')}</div>` : ''}
      ${m.remembered?.length ? `<div class="mem">🧠 Saved to memory: ${m.remembered.map(esc).join(' · ')}</div>` : ''}
    </div>`;
  return el;
}

function nearBottom() { const box = $('#messages'); return box.scrollHeight - box.scrollTop - box.clientHeight < 120; }
function scrollBottom() { const box = $('#messages'); box.scrollTop = box.scrollHeight; }

function renderMessages() {
  const box = $('#messages');
  box.innerHTML = '';
  if (!S.current) return renderWelcome();
  if (!S.chat.length) {
    const [kind, id] = S.current.split(':');
    const empty = document.createElement('div');
    empty.className = 'welcome';
    if (kind === 'dm') {
      const b = botById(id);
      empty.innerHTML = `${avatar(b, 'lg').replace('class="avatar lg"', 'class="avatar lg" style="margin:0 auto 12px;background:' + esc(b?.color) + '"')}<h1>${esc(b?.name)}</h1><p>${esc(b?.goal || 'Say hi. This bot keeps its own memory of everything you talk about.')}</p>`;
    } else {
      const g = groupById(id);
      empty.innerHTML = `<h1>${esc(g?.emoji)} ${esc(g?.name)}</h1><p>${g?.botIds.length ? 'Give the group a task. The bots will discuss it, split the work, and build on each other.' : 'This group has no bots yet. Click “Edit group” to add some.'}</p>`;
    }
    box.appendChild(empty);
    return;
  }
  for (const m of S.chat) box.appendChild(messageEl(m));
  scrollBottom();
}

function upsertMessage(m) {
  const stick = nearBottom();
  const i = S.chat.findIndex((x) => x.id === m.id);
  if (i >= 0) S.chat[i] = m; else S.chat.push(m);
  const box = $('#messages');
  if (box.querySelector('.welcome')) box.innerHTML = '';
  const old = box.querySelector(`[data-id="${m.id}"]`);
  const el = messageEl(m);
  old ? old.replaceWith(el) : box.appendChild(el);
  if (stick) scrollBottom();
}

function renderWelcome() {
  const box = $('#messages');
  box.innerHTML = `<div class="welcome">
    <h1>Your bots, working together</h1>
    <p>Bot Hub runs Claude Code and Codex on this Mac using the accounts you're signed in with — no API keys. Make bots with their own goals and memory, then drop them into groups so they can talk and build things together.</p>
    <div class="cards">
      <div class="card"><b>1 · Sign in</b><span>Open <i>Accounts &amp; settings</i> and sign in to Claude and/or Codex.</span></div>
      <div class="card"><b>2 · Make bots</b><span>Name, goal, model, permissions. Each keeps its own memory.</span></div>
      <div class="card"><b>3 · Start a group</b><span>Give them a task and watch them hand work to each other.</span></div>
    </div>
    <button class="primary" id="starter">✨ Create a starter team</button>
    <p style="font-size:12px">Makes an “Architect” (Claude), a “Builder” (Codex), a “Reviewer” (Claude) and a group for them.</p>
  </div>`;
  $('#starter').onclick = createStarterTeam;
}

async function createStarterTeam() {
  const a = await api('POST', '/api/bots', { name: 'Architect', provider: 'claude', model: 'opus', emoji: '🧠', color: '#d97757', permissions: 'edit',
    goal: 'You are the team lead and architect. Break the task into clear steps, decide the plan, and delegate implementation to @Builder and review to @Reviewer. Keep everyone on track.' });
  const b = await api('POST', '/api/bots', { name: 'Builder', provider: 'codex', model: '', emoji: '🛠️', color: '#10a37f', permissions: 'edit',
    goal: 'You are the implementer. Write working code and files in the shared folder based on the plan. Report exactly what you built and ask @Reviewer to check it.' });
  const c = await api('POST', '/api/bots', { name: 'Reviewer', provider: 'claude', model: 'sonnet', emoji: '🔍', color: '#2d9cdb', permissions: 'read',
    goal: 'You are the reviewer. Read what was built, find bugs and gaps, and give specific, actionable feedback. Approve with [DONE] when it is genuinely good.' });
  const g = await api('POST', '/api/groups', { name: 'Build Team', emoji: '🚀', botIds: [a.id, b.id, c.id], mode: 'roundrobin', maxTurns: 10,
    goal: 'Turn the human\'s request into working, reviewed results.' });
  await loadState();
  openCtx(`group:${g.id}`);
  toast('Starter team created');
}

// ------------------------------------------------------------------ navigation
async function openCtx(ctx) {
  S.current = ctx;
  location.hash = ctx;
  S.chat = await api('GET', `/api/chat/${ctx}`);
  renderSidebar(); renderHeader(); renderMentionBar(); renderMessages();
  $('#input').placeholder = ctx.startsWith('group:') ? `Message ${groupById(ctx.slice(6))?.name || 'the group'}…` : `Message ${botById(ctx.slice(3))?.name || ''}…`;
  $('#input').focus();
}

// ------------------------------------------------------------------ composer
function autosize() { const i = $('#input'); i.style.height = 'auto'; i.style.height = `${Math.min(i.scrollHeight, 220)}px`; }
$('#input').addEventListener('input', autosize);
$('#input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
});
$('#composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#input').value.trim();
  if (!text) return;
  if (!S.current) return toast('Pick a bot or group first');
  $('#input').value = ''; autosize();
  try { await api('POST', `/api/chat/${S.current}/messages`, { text }); }
  catch (err) { toast(err.message); $('#input').value = text; }
});

// ------------------------------------------------------------------ modals
function modal(title, bodyHTML, footHTML) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="overlay"><div class="modal"><div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close>✕</button></div><div class="modal-body">${bodyHTML}</div><div class="modal-foot">${footHTML}</div></div></div>`;
  const overlay = root.firstElementChild;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-close]').onclick = close;
  return { el: overlay, close };
}

function botModal(bot) {
  const isNew = !bot;
  const b = bot ? { ...bot } : { name: '', provider: 'claude', model: '', goal: '', memory: '', permissions: 'edit', workdir: '', emoji: '🤖', color: COLORS[Math.floor(Math.random() * COLORS.length)] };
  const { el, close } = modal(isNew ? 'New bot' : `Edit ${esc(b.name)}`, `
    <div class="row">
      <div class="field" style="flex:0 0 auto"><label>Icon</label><input type="text" class="emoji-input" name="emoji" value="${esc(b.emoji)}" maxlength="4"></div>
      <div class="field"><label>Name</label><input type="text" name="name" value="${esc(b.name)}" placeholder="e.g. Researcher" required></div>
    </div>
    <div class="field"><label>Color</label><div class="swatches">${COLORS.map((c) => `<button type="button" class="swatch ${c === b.color ? 'on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div></div>
    <div class="field"><label>Model provider</label><div class="seg" id="prov"><button type="button" data-v="claude">Claude</button><button type="button" data-v="codex">Codex</button></div>
      ${isNew ? '' : '<div class="help">Switching provider starts this bot\'s chats fresh (its memory notes are kept).</div>'}</div>
    <div class="field"><label>Model</label><input type="text" name="model" list="models" value="${esc(b.model)}" placeholder="Blank = account default (click for suggestions)"><datalist id="models"></datalist></div>
    <div class="field"><label>Goal / instructions</label><textarea name="goal" rows="5" placeholder="Who is this bot and what is it trying to do? e.g. “You are a meticulous researcher. Always cite sources and challenge weak claims.”">${esc(b.goal)}</textarea></div>
    <div class="field"><label>What it's allowed to do</label><div class="opt" id="perms">${Object.entries(PERMS).map(([k, [t, d]]) => `<label class="radio ${k === b.permissions ? 'on' : ''}"><input type="radio" name="permissions" value="${k}" ${k === b.permissions ? 'checked' : ''}><div><b>${t}</b><span>${d}</span></div></label>`).join('')}</div></div>
    <div class="field"><label>Working folder <span style="font-weight:400;color:var(--muted)">(optional)</span></label><input type="text" name="workdir" value="${esc(b.workdir)}" placeholder="Default: its own private folder inside Bot Hub's data">
      <div class="help">Point it at a project (e.g. ~/Projects/my-app) to let it work there in 1-on-1 chats. In groups it uses the group's shared folder.</div></div>
    <div class="field"><label>Long-term memory</label><textarea class="mono" name="memory" rows="5" placeholder="Facts this bot always knows. Bots add to this themselves with [[remember: …]].">${esc(b.memory)}</textarea>
      <div class="help">Separate from chat history: every chat & group thread this bot is in also has its own full conversation memory.</div></div>
  `, `${isNew ? '' : '<div class="left"><button class="btn danger" data-act="delete">Delete</button><button class="btn" data-act="reset">Reset chat memory…</button></div>'}<button class="btn" data-close2>Cancel</button><button class="primary" data-act="save">${isNew ? 'Create bot' : 'Save'}</button>`);

  const setProv = (p) => {
    b.provider = p;
    el.querySelectorAll('#prov button').forEach((x) => x.classList.toggle('on', x.dataset.v === p));
    const fill = (list) => { if (b.provider === p) $('#models', el).innerHTML = list.map((m) => `<option value="${esc(m)}">`).join(''); };
    fill(S.providers[p]?.models || []);
    if (p === 'codex') api('GET', '/api/providers/codex/models').then(fill).catch(() => {});
  };
  setProv(b.provider);
  el.querySelectorAll('#prov button').forEach((x) => (x.onclick = () => setProv(x.dataset.v)));
  el.querySelectorAll('.swatch').forEach((x) => (x.onclick = () => { b.color = x.dataset.color; el.querySelectorAll('.swatch').forEach((y) => y.classList.toggle('on', y === x)); }));
  el.querySelectorAll('#perms input').forEach((x) => (x.onchange = () => el.querySelectorAll('#perms label').forEach((l) => l.classList.toggle('on', l.contains(x) && x.checked))));
  el.querySelector('[data-close2]').onclick = close;
  el.querySelector('[data-act=save]').onclick = async () => {
    const val = (n) => el.querySelector(`[name=${n}]`).value;
    const data = { name: val('name').trim(), emoji: val('emoji').trim() || '🤖', color: b.color, provider: b.provider, model: val('model').trim(), goal: val('goal'), memory: val('memory'), workdir: val('workdir').trim(), permissions: el.querySelector('[name=permissions]:checked')?.value || 'edit' };
    if (!data.name) return toast('Give your bot a name');
    if (S.bots.some((x) => x.id !== b.id && handleOf(x.name).toLowerCase() === handleOf(data.name).toLowerCase())) return toast('Another bot already has that name');
    try {
      const saved = isNew ? await api('POST', '/api/bots', data) : await api('PATCH', `/api/bots/${b.id}`, data);
      close(); await loadState();
      if (isNew) openCtx(`dm:${saved.id}`); else renderMessages();
      toast(isNew ? 'Bot created' : 'Saved');
    } catch (e) { toast(e.message); }
  };
  el.querySelector('[data-act=delete]')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${b.name}? Its chats and memory will be removed.`)) return;
    await api('DELETE', `/api/bots/${b.id}`); close();
    if (S.current === `dm:${b.id}`) S.current = null;
    await loadState(); S.current ? openCtx(S.current) : renderMessages();
  });
  el.querySelector('[data-act=reset]')?.addEventListener('click', async () => {
    const wipeNotes = confirm(`Reset ${b.name}'s conversation memory?\n\nOK = also wipe its long-term memory notes\nCancel = choose whether to keep the notes next`);
    if (!wipeNotes && !confirm(`Reset ${b.name}'s chats but KEEP its long-term memory notes?`)) return;
    await api('POST', `/api/bots/${b.id}/reset`, { memory: wipeNotes, dm: true });
    close(); await loadState(); if (S.current) openCtx(S.current);
    toast('Memory reset');
  });
}

function groupModal(group) {
  const isNew = !group;
  const g = group ? { ...group, botIds: [...group.botIds] } : { name: '', emoji: '💬', goal: '', botIds: [], mode: 'roundrobin', maxTurns: 8, workdir: '' };
  const { el, close } = modal(isNew ? 'New group' : `Edit ${esc(g.name)}`, `
    <div class="row">
      <div class="field" style="flex:0 0 auto"><label>Icon</label><input type="text" class="emoji-input" name="emoji" value="${esc(g.emoji)}" maxlength="4"></div>
      <div class="field"><label>Name</label><input type="text" name="name" value="${esc(g.name)}" placeholder="e.g. Launch squad"></div>
    </div>
    <div class="field"><label>Members <span style="font-weight:400;color:var(--muted)">(click to add — number = speaking order)</span></label><div class="members" id="members"></div>
      ${S.bots.length ? '' : '<div class="help">You have no bots yet — create some first.</div>'}</div>
    <div class="field"><label>Group mission <span style="font-weight:400;color:var(--muted)">(optional)</span></label><textarea name="goal" rows="3" placeholder="What is this group for? Every member sees this.">${esc(g.goal)}</textarea></div>
    <div class="field"><label>How they take turns</label><div class="opt" id="modes">${Object.entries(MODES).map(([k, [t, d]]) => `<label class="radio ${k === g.mode ? 'on' : ''}"><input type="radio" name="mode" value="${k}" ${k === g.mode ? 'checked' : ''}><div><b>${t}</b><span>${d}</span></div></label>`).join('')}</div></div>
    <div class="row">
      <div class="field"><label>Max bot turns per message</label><input type="number" name="maxTurns" min="1" max="100" value="${esc(g.maxTurns)}"><div class="help">Safety limit so they don't loop forever. Hit Continue for more.</div></div>
      <div class="field"><label>Shared folder <span style="font-weight:400;color:var(--muted)">(optional)</span></label><input type="text" name="workdir" value="${esc(g.workdir)}" placeholder="Default: a folder inside Bot Hub"><div class="help">Where the group reads & writes files together.</div></div>
    </div>
  `, `${isNew ? '' : '<div class="left"><button class="btn danger" data-act="delete">Delete</button><button class="btn" data-act="clear">Clear chat</button></div>'}<button class="btn" data-close2>Cancel</button><button class="primary" data-act="save">${isNew ? 'Create group' : 'Save'}</button>`);

  const renderMembers = () => {
    $('#members', el).innerHTML = S.bots.map((b) => {
      const idx = g.botIds.indexOf(b.id);
      return `<div class="member ${idx >= 0 ? 'on' : ''}" data-id="${b.id}">${avatar(b, 'sm')}<div class="grow"><b>${esc(b.name)}</b> <span style="color:var(--muted);font-size:12px">${esc(providerLabel(b))}</span></div><span class="order">${idx >= 0 ? idx + 1 : ''}</span></div>`;
    }).join('');
    el.querySelectorAll('.member').forEach((m) => (m.onclick = () => {
      const id = m.dataset.id;
      g.botIds = g.botIds.includes(id) ? g.botIds.filter((x) => x !== id) : [...g.botIds, id];
      renderMembers();
    }));
  };
  renderMembers();
  el.querySelectorAll('#modes input').forEach((x) => (x.onchange = () => el.querySelectorAll('#modes label').forEach((l) => l.classList.toggle('on', l.contains(x) && x.checked))));
  el.querySelector('[data-close2]').onclick = close;
  el.querySelector('[data-act=save]').onclick = async () => {
    const val = (n) => el.querySelector(`[name=${n}]`).value;
    const data = { name: val('name').trim() || 'New group', emoji: val('emoji').trim() || '💬', goal: val('goal'), botIds: g.botIds, mode: el.querySelector('[name=mode]:checked')?.value, maxTurns: Number(val('maxTurns')) || 8, workdir: val('workdir').trim() };
    try {
      const saved = isNew ? await api('POST', '/api/groups', data) : await api('PATCH', `/api/groups/${g.id}`, data);
      close(); await loadState();
      if (isNew) openCtx(`group:${saved.id}`); else renderMessages();
      toast(isNew ? 'Group created' : 'Saved');
    } catch (e) { toast(e.message); }
  };
  el.querySelector('[data-act=delete]')?.addEventListener('click', async () => {
    if (!confirm(`Delete the group “${g.name}”? (The bots themselves are kept.)`)) return;
    await api('DELETE', `/api/groups/${g.id}`); close();
    if (S.current === `group:${g.id}`) S.current = null;
    await loadState(); S.current ? openCtx(S.current) : renderMessages();
  });
  el.querySelector('[data-act=clear]')?.addEventListener('click', async () => {
    if (!confirm('Clear this group\'s chat? Bots also forget this group\'s conversation (their long-term memory notes stay).')) return;
    await api('POST', `/api/chat/group:${g.id}/clear`); close(); openCtx(`group:${g.id}`);
  });
}

async function settingsModal() {
  const { el, close } = modal('Accounts & settings', `
    <div class="note">Bot Hub talks to Claude and Codex through their official command-line apps, signed in with your <b>Claude</b> and <b>ChatGPT</b> accounts — no API keys, and usage counts against your plan like normal.</div>
    <div id="prov-cards"><div class="note">Checking…</div></div>
    <div class="field"><label>Your name in groups</label><input type="text" name="userName" value="${esc(S.settings.userName)}"><div class="help">Bots can @mention you when they need you.</div></div>
    <div class="note" style="font-size:12px">Data folder: <code>${esc(S.dataDir)}</code></div>
  `, '<button class="primary" data-act="save">Done</button>');

  const renderCards = () => {
    const st = S.status || {};
    $('#prov-cards', el).innerHTML = ['claude', 'codex'].map((p) => {
      const s = st[p] || {};
      const label = p === 'claude' ? 'Claude Code' : 'Codex';
      const install = p === 'claude' ? 'curl -fsSL https://claude.ai/install.sh | bash' : 'npm install -g @openai/codex   (or: brew install codex)';
      const statusText = !s.installed ? 'Not installed' : s.loggedIn ? `Signed in${s.detail ? ` · ${s.detail}` : ''}` : 'Installed — not signed in';
      return `<div class="provider-card" style="margin-bottom:10px">
        <div class="top"><span class="badge ${p}">${label}</span><span class="status ${s.installed && s.loggedIn ? 'ok' : 'bad'}">${esc(statusText)}</span><span style="margin-left:auto;color:var(--faint);font-size:12px">${esc(s.version || '')}</span></div>
        ${!s.installed ? `<div style="font-size:12.5px">Install it in Terminal:<br><code>${esc(install)}</code></div>` : ''}
        <div class="actions">
          ${s.installed ? `<button class="btn" data-login="${p}">${s.loggedIn ? 'Switch account' : 'Sign in'}</button><button class="btn" data-test="${p}">Test connection</button>` : ''}
          <button class="btn" data-recheck>Re-check</button>
        </div>
        <div class="field"><label style="font-weight:500;font-size:12px;color:var(--muted)">Custom path to the ${p} app (only if it isn't found automatically)</label><input type="text" name="${p}Path" value="${esc(S.settings[`${p}Path`] || '')}" placeholder="${esc(s.bin || `/opt/homebrew/bin/${p}`)}"></div>
        <div class="test-out" data-out="${p}" style="font-size:12.5px"></div>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-login]').forEach((b) => (b.onclick = async () => {
      const r = await api('POST', `/api/providers/${b.dataset.login}/login`);
      toast(r.opened ? 'Finish signing in in the Terminal window that just opened' : `Run in Terminal: ${r.command}`);
    }));
    el.querySelectorAll('[data-test]').forEach((b) => (b.onclick = async () => {
      const out = el.querySelector(`[data-out=${b.dataset.test}]`);
      out.textContent = 'Testing… (first run can take ~20s)';
      try { const r = await api('POST', `/api/providers/${b.dataset.test}/test`, {}); out.innerHTML = `<span style="color:var(--ok)">✓ ${esc(r.reply)}</span> <span style="color:var(--faint)">(${(r.ms / 1000).toFixed(1)}s)</span>`; }
      catch (e) { out.innerHTML = `<span style="color:var(--danger)">✗ ${esc(e.message)}</span>`; }
    }));
    el.querySelectorAll('[data-recheck]').forEach((b) => (b.onclick = async () => { await savePaths(); await loadStatus(); renderCards(); }));
  };
  const savePaths = async () => {
    const data = { userName: el.querySelector('[name=userName]').value.trim() || 'You' };
    for (const p of ['claude', 'codex']) { const i = el.querySelector(`[name=${p}Path]`); if (i) data[`${p}Path`] = i.value.trim(); }
    S.settings = await api('PATCH', '/api/settings', data);
  };
  renderCards();
  loadStatus().then(renderCards);
  el.querySelector('[data-act=save]').onclick = async () => { await savePaths(); close(); loadStatus(); };
}

$('#new-bot').onclick = () => botModal(null);
$('#new-group').onclick = () => groupModal(null);
$('#open-settings').onclick = settingsModal;

// ------------------------------------------------------------------ live updates
function connectEvents() {
  const es = new EventSource('/api/events');
  es.onmessage = async (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'message' && ev.ctx === S.current) upsertMessage(ev.message);
    else if (ev.type === 'delta' && ev.ctx === S.current) {
      const m = S.chat.find((x) => x.id === ev.id);
      if (m) { m.text = (m.text || '') + ev.text; upsertMessage(m); }
    } else if (ev.type === 'activity' && ev.ctx === S.current) {
      const m = S.chat.find((x) => x.id === ev.id);
      if (m) { m.activity = [...(m.activity || []), ev.text]; upsertMessage(m); }
    } else if (ev.type === 'run') {
      if (ev.running) S.runs[ev.ctx] = { botIds: ev.botIds, turns: ev.turns }; else delete S.runs[ev.ctx];
      renderSidebar(); if (ev.ctx === S.current) renderHeader();
    } else if (['bots', 'groups', 'settings'].includes(ev.type)) {
      await loadState();
    } else if (ev.type === 'cleared' && ev.ctx === S.current) {
      S.chat = []; renderMessages();
    }
  };
  es.onerror = () => {}; // EventSource reconnects on its own
  es.onopen = () => { if (S.current) api('GET', `/api/chat/${S.current}`).then((c) => { S.chat = c; renderMessages(); }); loadState(); };
}

// ------------------------------------------------------------------ boot
(async () => {
  await loadState();
  loadStatus();
  connectEvents();
  const h = decodeURIComponent(location.hash.slice(1));
  if (h && ((h.startsWith('dm:') && botById(h.slice(3))) || (h.startsWith('group:') && groupById(h.slice(6))))) openCtx(h);
  else renderMessages();
})();
