# 👋 PICKUP_HERE — where we left off (2026-07-06)

Quick-start for the next session. Full detail lives in `HANDOFF_CLAUDE.md`; product
status in `PRD_STATUS.md`; your manual/dashboard to-dos in `MANUAL_SETUP.md`.

## What we did this session

1. **Answered "does new-user data hit Supabase?" — yes.** Verified the `.edu` campus gate +
   auto-provisioning trigger (new signup → `public.users` row) against the live backend.
2. **Built real magic-link sign-in (deep-linking).** `sendMagicLink` now returns to a new
   `/auth-callback` route that exchanges the link's code for a session (PKCE). Verified
   end-to-end locally via Mailpit. `commit c30d8ab`.
3. **Verified the booking loop end-to-end.** `confirm-booking` (and cancel/reschedule/
   no-show/rating) were already built AND deployed to cloud — verified book → Upcoming →
   cancel → 100% refund against the **real cloud DB**. `commit 5a41a75`.
4. **Live click-through confirmed.** You booked **MGT 300** through the running app; it
   landed in cloud as a confirmed booking (kept it on purpose).
5. **Wrote planning docs:** `PRD_STATUS.md` (feature-by-feature build status) + updated
   `MANUAL_SETUP.md`. `commit ef7527f`.
6. **Fixed local stack:** Postgres 15→17 (matched cloud); reset + re-seeded the local DB.

All commits pushed to `origin/main` (through `ef7527f`). Working tree clean.

## State in one line

Core student loop — **sign in → find tutor → message → book → upcoming → cancel/rate** —
is built and **runs on the real cloud database**. ⚠️ **Money is simulated** (no real charge).

## Biggest gaps (see PRD_STATUS.md for the full map)

- 🔴 **Real Stripe** (charge / capture / tutor payout / Connect / webhook) — the long pole.
- 🔴 **Ambassador program**, **Admin + tutor approval**, **push notifications**.
- 🟡 Cloud **SMTP** not set up → real `.edu` students can't sign in yet (dashboard task).
- 🟡 Booking uses **demo availability** (no availability-read endpoint); no past-sessions endpoint.

## Pick up next — two good options

- **A) Ship a testable build:** set up cloud SMTP, then an EAS/TestFlight build to put it on
  real phones. (See hosting "Gate 1" discussion.)
- **B) Real Stripe:** start the payments workstream — biggest thing before taking real money.

## Handy commands

```bash
export PATH="$HOME/.local/node-v22.23.1-linux-x64/bin:$PATH"   # node isn't on PATH by default

pnpm --filter @noot/mobile web        # run the app → http://localhost:8081
node supabase/seed_demo.mjs           # re-seed local demo data
pnpm dlx tsx scripts/verify_booking_cloud.mts   # smoke-test booking against cloud
pnpm dlx tsx scripts/verify_magiclink.mts       # smoke-test magic-link (local)
```

Dev sign-in (skip magic link): `student@crimson.ua.edu` / `sara@crimson.ua.edu`, pw `password123`.
App currently points at **cloud** (`apps/mobile/.env`).
