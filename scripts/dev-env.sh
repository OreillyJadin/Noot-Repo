#!/usr/bin/env bash
# Load everything a dev/agent session needs. Source it, don't run it:
#
#   source scripts/dev-env.sh
#
# Does two things that every session otherwise has to rediscover:
#   1. puts node on PATH (it isn't there by default on this box)
#   2. exports the credentials from .noot-secrets.local.env
#
# CONTAINS NO SECRETS. Safe to commit. The values live only in
# .noot-secrets.local.env, which is gitignored and chmod 600.

_noot_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- 1. node ---------------------------------------------------------------
_noot_node="$HOME/.local/node-v22.23.1-linux-x64/bin"
if [ -d "$_noot_node" ]; then
  case ":$PATH:" in *":$_noot_node:"*) ;; *) export PATH="$_noot_node:$PATH";; esac
fi

# --- 2. secrets ------------------------------------------------------------
_noot_secrets="$_noot_root/.noot-secrets.local.env"
if [ -f "$_noot_secrets" ]; then
  # Refuse to load a world-readable secrets file rather than silently accepting it.
  _noot_perms="$(stat -c '%a' "$_noot_secrets")"
  if [ "$_noot_perms" != "600" ]; then
    echo "⚠️  $_noot_secrets is mode $_noot_perms — tightening to 600" >&2
    chmod 600 "$_noot_secrets"
  fi
  set -a
  # shellcheck disable=SC1090
  . "$_noot_secrets"
  set +a
else
  echo "⚠️  No .noot-secrets.local.env — copy .noot-secrets.local.env.example and fill it in." >&2
fi

# --- report (names and shapes only, never values) --------------------------
_noot_report() {
  local name len
  # STRIPE_SECRET_KEY stays the SANDBOX key on purpose — the verify_* scripts create real
  # PaymentIntents against whatever it points at. The _LIVE pair is only for configuring
  # the production project and production builds.
  for name in SUPABASE_ACCESS_TOKEN EXPO_TOKEN STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY \
              STRIPE_SECRET_KEY_LIVE STRIPE_PUBLISHABLE_KEY_LIVE STRIPE_WEBHOOK_SECRET_LIVE; do
    len="$(eval "printf '%s' \"\${#$name}\"")"
    if [ "$len" -gt 0 ]; then printf '  ✅ %-26s (%s chars)\n' "$name" "$len"
    else printf '  ⚠️  %-26s not set\n' "$name"; fi
  done
}

echo "noot dev env loaded — node $(node --version 2>/dev/null || echo 'MISSING'), supabase $(supabase --version 2>/dev/null | head -1 || echo 'MISSING')"
_noot_report
unset _noot_root _noot_node _noot_secrets _noot_perms
