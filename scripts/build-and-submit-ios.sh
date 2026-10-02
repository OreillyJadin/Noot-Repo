#!/usr/bin/env bash
# Build the iOS app on EAS and send it to TestFlight in one go.
#
#   Run it:    bash scripts/build-and-submit-ios.sh
#   Or copy:   cat scripts/build-and-submit-ios.sh   (the two commands at the bottom)
#
# Uses the `production` profile in apps/mobile/eas.json (production Supabase + live Stripe)
# and the App Store Connect details under `submit.production`. EAS builds the folder as it
# is on disk, so this refuses to run with uncommitted changes (override: ALLOW_DIRTY=1).
# EAS bumps the iOS build number itself and, with appVersionSource "local", writes the new
# number into apps/mobile/app.json — commit that change after the build.
# Any extra arguments are passed through to `eas build` (e.g. --no-wait).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

set -euo pipefail

# Take only what the build needs from dev-env.sh: node on PATH and EXPO_TOKEN. The other
# credentials (live Stripe keys, Supabase PAT) are kept out of this process, and unset in
# case the calling shell already exported them, since eas-cli is code fresh from npm.
eval "$(bash -c 'source "$1" >/dev/null 2>&1; printf "PATH=%q\nEXPO_TOKEN=%q\n" "$PATH" "${EXPO_TOKEN:-}"' _ "$ROOT/scripts/dev-env.sh")"
export PATH EXPO_TOKEN
unset SUPABASE_ACCESS_TOKEN STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY \
      STRIPE_SECRET_KEY_LIVE STRIPE_PUBLISHABLE_KEY_LIVE STRIPE_WEBHOOK_SECRET_LIVE

if [[ "${ALLOW_DIRTY:-}" != "1" ]] && [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  echo "Uncommitted changes would ship in this build. Commit them, or rerun with ALLOW_DIRTY=1." >&2
  exit 1
fi

# eas-cli is pinned so builds are reproducible; bump it deliberately.
# ── the two commands ───────────────────────────────────────────────────────────
cd "$ROOT/apps/mobile"
npx eas-cli@24.8.0 build --platform ios --profile production --auto-submit "$@"
