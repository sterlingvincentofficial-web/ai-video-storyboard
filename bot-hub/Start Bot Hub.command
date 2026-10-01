#!/bin/zsh
# Double-click this file in Finder to start Bot Hub. Close the window (or Ctrl+C) to stop it.
cd "$(dirname "$0")"
# Load your shell setup so node / claude / codex are on PATH when launched from Finder.
[ -f ~/.zprofile ] && source ~/.zprofile >/dev/null 2>&1
[ -f ~/.zshrc ] && source ~/.zshrc >/dev/null 2>&1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed. Install it from https://nodejs.org (LTS) or: brew install node"
  read -k 1 "?Press any key to close…"
  exit 1
fi
PORT="${PORT:-4317}" node server.js --open
