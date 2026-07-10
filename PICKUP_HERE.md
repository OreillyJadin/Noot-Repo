# 👋 PICKUP_HERE — where we left off (2026-07-10)

Quick-start for the next session. Full detail lives in `HANDOFF_CLAUDE.md`; product
status in `PRD_STATUS.md`; your manual/dashboard to-dos in `MANUAL_SETUP.md`.

## What we did since the last pickup (2026-07-07 → 07-10)

1. **Reworked auth to password-first.** Sign-**up** is now *verification only* (name +
   campus email → magic link proving the `.edu`), then the user **sets a password** in
   onboarding. Sign-**in** is **email + password**. Added `signInWithPassword`,
   `setPassword`, `sendPasswordReset`, `sendSignupVerification` + the `signin` /
   `set_password` / `forgot_password` screens. Verified via `scripts/verify_password_auth.mts`.
2. **Biometric launch gate + encrypted session storage.** `AuthGate` prompts Face/Touch ID
   on cold launch (opt-in via `enable_faceid`); session persisted through `secureStorage`.
3. **Upgraded to Expo SDK 54** (React 19 / RN 0.81).
4. **Closed two data gaps:** `listPast` (real "Past" sessions tab) and the
   `tutors.getAvailability` read endpoint (⚠️ endpoint only — **not yet wired** into the
   booking calendar or edit-availability screen; those still show demo slots).
5. **Real counterparty names** via the `resolve-participants` edge function (no more
   hardcoded "Lindsay Thomas"); browse tabs filter by category.
6. **UX polish:** dark mode (`themePref`), shared `EmptyState` + `Skeleton`, empty/loading
   states across screens, unified tab-bar nav (reselect scrolls to top).
7. **Dev/testing infra:** `seed_test_accounts.mjs` (ambassador/tutor/admin accounts) and a
   `pnpm tunnel` tmux wrapper (survives SSH drops, auto-picks a free port) for on-the-road
   Expo testing.

All commits pushed to `origin/main` (through `839b012`). Working tree clean.

## State in one line

Core student loop — **sign up/verify → set password → sign in → find tutor → message →
book → upcoming/past → cancel/rate** — is built and **runs on the real cloud database**.
⚠️ **Money is still simulated** (no real charge).

## Biggest gaps (see PRD_STATUS.md for the full map)

- 🔴 **Real Stripe** (charge / capture / tutor payout / Connect / webhook) — the long pole.
- 🔴 **Ambassador program**, **Admin + tutor approval**, **push notifications**.
- 🟡 Cloud **SMTP** not set up → real `.edu` students can't verify/sign up yet (dashboard task).
- 🟡 **Availability read endpoint exists but no screen uses it** — booking calendar (`b1`/`b3`)
  and `edit_availability` still show demo slots. Wiring this is a small, high-value next step.
- 🟡 Realtime chat (`chat.subscribe`) still unverified; server-side booking validation absent.

## Pick up next — good options

- **A) Wire real availability into booking** (small, honest win): consume
  `tutors.getAvailability` in `b1`/`b3` + `edit_availability` so the calendar stops lying.
- **B) Real Stripe:** start the payments workstream — biggest thing before taking real money.
- **C) Ship a testable build:** cloud SMTP → EAS/TestFlight build on real phones
  (biometric gate + deep links need a real device build, not Expo Go).

## Handy commands

```bash
export PATH="$HOME/.local/node-v22.23.1-linux-x64/bin:$PATH"   # node isn't on PATH by default

pnpm --filter @noot/mobile web        # run the app → http://localhost:8081
pnpm tunnel                           # run the app in a persistent tunnel (test off-network)
node supabase/seed_demo.mjs           # re-seed local demo data
node supabase/seed_test_accounts.mjs  # seed ambassador/tutor/admin test accounts
pnpm dlx tsx scripts/verify_booking_cloud.mts   # smoke-test booking against cloud
pnpm dlx tsx scripts/verify_password_auth.mts   # smoke-test password auth
pnpm dlx tsx scripts/verify_magiclink.mts       # smoke-test magic-link (local)
```

Dev sign-in (skip verification): `student@crimson.ua.edu` / `sara@crimson.ua.edu`, pw `password123`.
App currently points at **cloud** (`apps/mobile/.env`).
