#!/usr/bin/env bash
# Build the iOS app on EAS and send it to TestFlight in one go.
#
#   Run it:    bash scripts/npxbuildandsubmit.sh
#   Or copy:   cat scripts/npxbuildandsubmit.sh   (the two commands at the bottom)
#
# Uses the `production` profile in apps/mobile/eas.json (production Supabase + live Stripe)
# and the App Store Connect details under `submit.production`. EAS builds the folder as it
# is on disk, including uncommitted changes, and bumps the iOS build number itself.
# Any extra arguments are passed through to `eas build` (e.g. --no-wait).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# node on PATH + EXPO_TOKEN (and the other credentials) from .noot-secrets.local.env
source "$ROOT/scripts/dev-env.sh"

# ── the two commands ───────────────────────────────────────────────────────────
cd "$ROOT/apps/mobile"
npx eas-cli@latest build --platform ios --profile production --auto-submit "$@"
