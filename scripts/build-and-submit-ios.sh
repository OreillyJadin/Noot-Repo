#!/usr/bin/env bash
# Build the iOS app on EAS and send it to TestFlight in one go.
#
#   Run it:    bash scripts/npxbuildandsubmit.sh
#   Or copy:   cat scripts/npxbuildandsubmit.sh   (the two commands at the bottom)
#
# Uses the `production` profile in apps/mobile/eas.json (production Supabase + live Stripe)
# and the App Store Connect details under `submit.production`. EAS builds the folder as it
# is on disk, so this refuses to run with uncommitted changes (override: ALLOW_DIRTY=1).
# EAS bumps the iOS build number itself and, with appVersionSource "local", writes the new
# number into apps/mobile/app.json — commit that change after the build.
# Any extra arguments are passed through to `eas build` (e.g. --no-wait).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# node on PATH + EXPO_TOKEN (and the other credentials) from .noot-secrets.local.env.
# Sourced before `set -u`: its key report reads keys that may be unset.
source "$ROOT/scripts/dev-env.sh"
set -euo pipefail

if [[ "${ALLOW_DIRTY:-}" != "1" ]] && [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  echo "Uncommitted changes would ship in this build. Commit them, or rerun with ALLOW_DIRTY=1." >&2
  exit 1
fi

# ── the two commands ───────────────────────────────────────────────────────────
cd "$ROOT/apps/mobile"
npx eas-cli@latest build --platform ios --profile production --auto-submit "$@"
