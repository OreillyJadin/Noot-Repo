#!/usr/bin/env bash
# Keep the Expo tunnel (`pnpm mobile-team`) running in a persistent tmux session.
#
# The tunnel's ngrok URL only lives as long as its process does — if the shell
# dies (SSH drop, laptop sleep, OOM kill) the endpoint 404s with ERR_NGROK_3200.
# Running it inside tmux detaches the process from the shell, so it survives
# disconnects and you can reattach from anywhere (e.g. SSH from your phone).
#
# Usage:
#   ./scripts/tunnel.sh          # start (or reattach to) the tunnel session
#   ./scripts/tunnel.sh status   # is it running?
#   ./scripts/tunnel.sh stop     # kill the tunnel session
#
# Inside the session:
#   detach (leave it running):  Ctrl+b  then  d
#   reattach later:             ./scripts/tunnel.sh   (or: tmux attach -t noot-tunnel)

set -euo pipefail

SESSION="noot-tunnel"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# `node` is not on PATH by default on this box (see CLAUDE.md).
NODE_BIN="$HOME/.local/node-v22.23.1-linux-x64/bin"
[ -d "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is not installed. Install it with:  sudo apt install tmux" >&2
  exit 1
fi

cmd="${1:-start}"

case "$cmd" in
  status)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "✓ tunnel session '$SESSION' is running.  Attach with: ./scripts/tunnel.sh"
    else
      echo "✗ no tunnel session running.  Start it with: ./scripts/tunnel.sh"
    fi
    ;;
  stop)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      tmux kill-session -t "$SESSION"
      echo "Stopped tunnel session '$SESSION'."
    else
      echo "No tunnel session '$SESSION' to stop."
    fi
    ;;
  start)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "Tunnel already running — reattaching. (Detach with Ctrl+b then d.)"
    else
      echo "Starting tunnel in tmux session '$SESSION'..."
      # Start detached so restarts don't stack, then run the tunnel inside it.
      tmux new-session -d -s "$SESSION" -c "$REPO_ROOT" \
        "export PATH=\"$NODE_BIN:\$PATH\"; exec pnpm mobile-team"
    fi
    echo
    echo "  Detach (keep it running):  Ctrl+b  then  d"
    echo "  Reattach later:            ./scripts/tunnel.sh"
    echo "  Stop:                      ./scripts/tunnel.sh stop"
    echo
    # Only attach if we have a terminal (skips cleanly in non-interactive runs).
    if [ -t 1 ]; then
      exec tmux attach -t "$SESSION"
    else
      echo "(no TTY — session left running in the background)"
    fi
    ;;
  *)
    echo "Usage: ./scripts/tunnel.sh [start|status|stop]" >&2
    exit 1
    ;;
esac
