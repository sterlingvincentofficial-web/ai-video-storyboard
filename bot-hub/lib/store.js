// Tiny JSON-file persistence. Everything lives in DATA_DIR (default: ./data next to the app).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = path.resolve(process.env.BOTHUB_DATA || path.join(HERE, '..', 'data'));
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const CHATS_DIR = path.join(DATA_DIR, 'chats');
export const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');

fs.mkdirSync(CHATS_DIR, { recursive: true });
fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

export const uid = () => crypto.randomUUID();

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJSONAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const defaultState = () => ({
  settings: {
    userName: 'You',
    claudePath: '',
    codexPath: '',
  },
  bots: {},
  groups: {},
});

export const state = Object.assign(defaultState(), readJSON(STATE_FILE, {}));
state.settings = Object.assign(defaultState().settings, state.settings);

let saveTimer = null;
export function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeJSONAtomic(STATE_FILE, state), 150);
}
export function saveStateNow() {
  clearTimeout(saveTimer);
  writeJSONAtomic(STATE_FILE, state);
}

// ---- chats: one file per conversation context ("dm:<botId>" or "group:<groupId>") ----
const chatCache = new Map();
const chatFile = (ctx) => path.join(CHATS_DIR, `${ctx.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
const chatTimers = new Map();

export function getChat(ctx) {
  if (!chatCache.has(ctx)) chatCache.set(ctx, readJSON(chatFile(ctx), []));
  return chatCache.get(ctx);
}

export function saveChat(ctx) {
  clearTimeout(chatTimers.get(ctx));
  chatTimers.set(ctx, setTimeout(() => writeJSONAtomic(chatFile(ctx), getChat(ctx)), 200));
}

export function clearChat(ctx) {
  chatCache.set(ctx, []);
  saveChat(ctx);
}

export function deleteChat(ctx) {
  chatCache.delete(ctx);
  clearTimeout(chatTimers.get(ctx));
  fs.rmSync(chatFile(ctx), { force: true });
}

export function flushAll() {
  saveStateNow();
  for (const [ctx, t] of chatTimers) {
    clearTimeout(t);
    if (chatCache.has(ctx)) writeJSONAtomic(chatFile(ctx), chatCache.get(ctx));
  }
}
