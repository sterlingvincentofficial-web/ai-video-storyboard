# 🤖 Bot Hub

A local app for your Mac mini where **Claude** and **Codex** bots chat with you and **work with each other**. There are no API keys. It uses the official `claude` and `codex` command-line apps, signed in with your Claude and ChatGPT accounts, so usage counts against your normal plan.

- **Bots**: give each one a name, icon, goal or instructions, provider (Claude or Codex), model and permission level. Each bot remembers its full conversation, like a regular Claude or Codex chat, and keeps **long-term memory notes**. A bot saves a note by writing `[[remember: …]]`, and you can edit the notes yourself.
- **Groups**: put several bots in one chat. They share a working folder, see each other's messages and hand off with `@mentions`. They keep going until the task is done, they hit the turn limit, they need you (`@YourName`), or you press **Stop**.
  - *Round-robin*: bots take turns in order. An @mention lets a bot jump the queue.
  - *Hand-off*: the first bot leads, and the others speak only when @mentioned.
  - *Everyone at once*: all bots answer in parallel, which is handy for comparing their answers.
- Replies stream in live, and you can expand each message to see what the bot did (files edited, commands run).

## Requirements (one-time)

1. **Node.js 18+**: `brew install node`, or download it from nodejs.org
2. **Claude Code**: `curl -fsSL https://claude.ai/install.sh | bash`
3. **Codex CLI**: `npm install -g @openai/codex` (or `brew install codex`)

You only need the ones you'll use. Bot Hub has **no npm dependencies**, so there's nothing to `npm install`.

## Run it

Double-click **`Start Bot Hub.command`**. If macOS blocks it the first time, right-click it and choose Open.
Or, in Terminal:

```bash
cd bot-hub
npm start          # opens http://127.0.0.1:4317
```

Use `PORT=5000 npm start` if 4317 is already in use.

Then open **Accounts & settings** in the bottom-left:
- **Sign in** opens Terminal and runs `claude auth login` or `codex login`. Each one signs you in through your browser.
- **Test connection** sends a tiny prompt to check that everything works.

To get going fast, click **✨ Create a starter team**. It makes an Architect (Claude), a Builder (Codex), a Reviewer (Claude) and a group for them.

## Where things live / safety

- Everything is stored in `bot-hub/data/`: bots, chats and each bot's working folder. Delete that folder to start over.
- By default, bots only work **inside their own folder under `data/workspaces/`**. They touch the rest of your Mac only if you point a bot or group at a different folder, or give a bot **Full access**.
- Permission levels:
  - *Chat only*: no tools.
  - *Read files*: can read but not change anything.
  - *Edit files*: can edit files in its working folder (sandboxed for Codex). This is the default.
  - *Full access*: no prompts and no sandbox.
- The server listens on `127.0.0.1` only, so it isn't reachable from other devices, and it blocks requests from other websites.
- Group chats have a **max turns** limit, so bots can't burn through your usage in a loop.

## How it works

- Each bot gets **one native CLI session per conversation**: one for your 1-on-1 chat and one for each group it's in. Bot Hub resumes that session every turn with `claude --resume` or `codex exec resume`. That's how each bot keeps its own memory without resending the whole history. If a session is lost, Bot Hub starts a fresh one and replays the recent history.
- In groups, each turn sends the bot only the messages it hasn't seen yet, formatted as `[Name]: text`, plus its instructions, the member list and the group rules.
- Goal and memory changes take effect on the bot's next message.

Files: `server.js` (HTTP + live updates), `lib/engine.js` (bots, memory, group turn-taking), `lib/providers.js` (Claude/Codex CLI runners), `public/` (UI).
