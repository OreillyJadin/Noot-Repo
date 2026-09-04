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
#   reattach later:             ./scripts/tunnel.sh   (or: tmux attach -t noot-team)
#
# Runs in Expo Go mode (--go) so teammates just scan the QR and it opens in Expo Go.

set -euo pipefail

SESSION="noot-team"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# `node` is not on PATH by default on this box (see CLAUDE.md).
NODE_BIN="$HOME/.local/node-v22.23.1-linux-x64/bin"
[ -d "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is not installed. Install it with:  sudo apt install tmux" >&2
  exit 1
fi

# Pick the first free Metro port at/after 8081. Expo only shows its interactive
# "Use port 8082 instead? (Y/n)" prompt when the requested port is busy — and a
# detached tmux session has no one to answer it, so it hangs forever. By handing
# Expo a port we know is free, that prompt never fires and startup stays fully
# hands-off (e.g. when your local `pnpm mobile` already holds 8081).
find_free_port() {
  local p=8081
  while [ "$p" -lt 8099 ]; do
    if command -v ss >/dev/null 2>&1; then
      ss -ltn 2>/dev/null | grep -q "[:.]$p " || { echo "$p"; return 0; }
    else
      # Fallback: probe via /dev/tcp — a refused connection means the port is free.
      (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null && exec 3>&- || { echo "$p"; return 0; }
    fi
    p=$((p + 1))
  done
  echo 8081  # give up gracefully; Expo will prompt as before
}

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
      PORT="$(find_free_port)"
      echo "Starting tunnel in tmux session '$SESSION' (Metro port $PORT)..."
      # Pass the free port through the pnpm alias chain so Expo never prompts.
      # dev:tunnel is `expo start --tunnel`; `-- --port N --go` appends to it.
      # --go forces Expo Go mode (the project has expo-dev-client, which would otherwise
      # default to a dev-build QR that needs a keypress to switch — no good when detached).
      RUN="pnpm --filter @noot/mobile dev:tunnel -- --port $PORT --go"
      # Start detached so restarts don't stack. Run the tunnel, then DROP TO A
      # SHELL instead of exec — so if the tunnel crashes or exits, the pane (and
      # its logs) stay alive to inspect when you reattach, and you can just
      # re-run the command to restart. `exec`-ing the tunnel would take the whole
      # session down with it, leaving nothing to debug on the road.
      inner="export PATH=\"$NODE_BIN:\$PATH\"
set -a; . \"$REPO_ROOT/.noot-secrets.local.env\" 2>/dev/null || true; set +a
$RUN
ec=\$?
printf '\n\n=== tunnel exited (code %s) — logs above. Restart: $RUN ===\n\n' \"\$ec\"
exec \"\$SHELL\""
      tmux new-session -d -s "$SESSION" -c "$REPO_ROOT" "$inner"
      # Belt-and-suspenders: keep the pane even if the shell itself ever dies.
      tmux set-option -t "$SESSION" remain-on-exit on 2>/dev/null || true
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
