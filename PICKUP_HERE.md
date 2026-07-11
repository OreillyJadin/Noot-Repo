# 👋 PICKUP_HERE — where we left off (2026-07-11)

Quick-start for the next session. Full detail lives in `HANDOFF_CLAUDE.md`; product
status in `PRD_STATUS.md`; your manual/dashboard to-dos in `MANUAL_SETUP.md`.

## Latest (2026-07-11) — role-switching + ambassador + admin (all on cloud)

Commits `961e731`…`ad55a6b` on `origin/main`. Built in 3 verified phases; migrations
`0007`–`0011` applied local + cloud, all new edge functions deployed, security-reviewed.

1. **Role-switching** — one account can be student + tutor + ambassador and switch mode from
   Profile (`<RoleSwitcher>` persists `users.active_role`; guard trigger `0007` = must hold the
   role). "Viewing as [Role]" indicator on home headers; ambassador tab set; "Become an
   ambassador/tutor" add-role. **Admin is a separate gated entry, not a switchable mode.**
2. **Ambassador program** — `ambassador_referrals` (unique code + Share sheet) + `ambassador_home`
   dashboard (referral pipeline: signed up → $5 pending → earned, + running total). `list-referrals`
   + `award-referral-bonus` edge fns; codes via `create_my_ambassador_profile` (`0008`).
3. **Admin panel** (Profile → Noot Admin, admin-only) — tutor approval (+ **transcript upload**:
   private Storage bucket `0011` + `expo-document-picker`), user management (suspend/ban via GoTrue),
   booking oversight/disputes, review moderation. Each is a service-role edge fn re-verifying
   `is_admin`. Migration `0009` closes the **tutor self-approve** RLS gap; `0010` guards `users.status`.
4. **Security review** each phase — one finding (unauthenticated `award-referral-bonus`) found + fixed.
   Verified end-to-end on cloud (role switch, ambassador pipeline, all 4 admin actions, non-admin 403).

**New test accounts of note (password `password123`):** multi-role for the switcher —
`sara@` (student+tutor), `ambassador@` (student+ambassador, code `NOOT-DEMO01`, 3 referrals);
admin panel — `admin@`. Full worklog: `notes/2026-07-10-2110-role-switching-ambassador-admin.md`.

## Prior (2026-07-10) — killed ALL dummy data + populated cloud

Commit `71d9cfb` on `origin/main`. Every screen now reads **real database data**; the
ported demo constants are gone.

1. **Real availability** — `lib/availability.ts` turns `tutors.getAvailability()` weekly
   windows into real calendar slots; wired into `b1`/`b3`/`edit_availability`/`tutor_calendar`.
   `DAYS` starts at real today (weekday + year), so `b4`'s booking timestamp is no longer
   hardcoded to 2026.
2. **Deleted the demo arrays** — `TUTORS`/`REVIEWS_POOL`/`tutorById`/`reviewsFor` are gone;
   the `?? TUTORS[0]` fallbacks became a shared `<NoSession/>` guard (`lib/NoSession.tsx`).
3. **New read endpoints** — `@noot/core` `tutorStats()` + `studentStats()` (derived from real
   bookings) wired into `tutor_home`/`tutor_profile`/`home`/`profile`/`c4`.
4. **Real student names** — `resolve-participants` now returns year/major; `lib/useCounterpart.ts`
   resolves the real student everywhere `"Lindsay Thomas"` was hardcoded.
5. **Honest zero-states** (ARCHITECTURE §7) — chat attachments, referral credits, study
   streak/goal, fake saved-card numbers → empty/zero states or real CTAs. Onboarding
   prefills (`t2/t7/t8/t9`) read from the signed-in user.
6. **Cloud populated** — `supabase/seed_cloud.mjs` seeded the cloud project: 5 tutors
   (+availability), 4 students, 8 bookings (upcoming+past), 4 reviews, 8 conversations.
   `resolve-participants` deployed to cloud. Verified 8/8 vs **local AND cloud**
   (`scripts/verify_realdata.mts`); `pnpm -r typecheck` clean; web export bundles clean.

**Test accounts (cloud + local, password `password123`):** students `student@`,
`student1@`, `student2@`, `student3@`; tutors `sara@`, `devon@`, `maya@`, `alex@`, `nina@`
`crimson.ua.edu`.

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

Core student loop + **role-switching, the ambassador program, and the admin panel** are all
built and **run on the real cloud database with no dummy data anywhere**. ⚠️ **Money is still
simulated** (no real charge) — that's the one big thing before launch.

## Biggest gaps (see PRD_STATUS.md for the full map)

- 🔴 **Real Stripe** (charge / capture / tutor payout / Connect / webhook) — now the long pole.
  Seeded earnings/payouts reflect *simulated* money (`sim_pi_…`). Also unblocks `award-referral-bonus`
  (built, fires on the unbuilt `complete-session`) + the auto-complete cron.
- 🔴 **Push notifications** (registration + reminders).
- 🟡 **Server-side booking validation** (scheduled_at inside a window + no overlap) still absent.
- 🟡 Cloud **SMTP** not set up → real `.edu` students can't verify/sign up yet (dashboard task).
  (Seeded test accounts are pre-confirmed via the admin API, so they log in without SMTP.)
- 🟡 **Not click-tested in a live browser** — everything this stretch was verified via typecheck +
  web bundle + backend smoke scripts. Do a manual pass (roles/ambassador/admin especially) per the golden rule.
- ⚪ Anti-abuse / hardening (from the security review): referral attribution is spoofable via signup
  metadata (gaming, not a hole); `users.status` enforced via GoTrue ban but not RLS-level (~1h token
  lingering); no server-side transcript file-type/size cap. Realtime chat (`chat.subscribe`) still unverified.
- ⚪ Device-only: `expo-document-picker` (transcript upload) + the biometric gate need a real build to fully test.

## Pick up next — good options

- **A) Real Stripe:** the payments workstream — the last big thing before taking real money
  (`create-payment-intent` real charge, `stripe-webhook`, `complete-session` capture+payout,
  Connect onboarding). Unblocks `award-referral-bonus` + auto-complete too.
- **B) Ship a testable build:** cloud SMTP → EAS/TestFlight on real phones — and click-test
  roles/ambassador/admin + the transcript picker + biometric gate (device-only bits).
- **C) Server-side booking validation** + **push notifications** — smaller, self-contained.
- _(Role-switching, ambassador program, and the admin panel are all DONE as of this session.)_

## Handy commands

```bash
export PATH="$HOME/.local/node-v22.23.1-linux-x64/bin:$PATH"   # node isn't on PATH by default

pnpm --filter @noot/mobile web        # run the app → http://localhost:8081
pnpm tunnel                           # run the app in a persistent tunnel (test off-network)
node supabase/seed_cloud.mjs          # FULL populate (tutors+availability, students, bookings, chats, reviews, ambassador+referrals)
node supabase/seed_demo.mjs           # lighter re-seed (tutors + availability + dev student only)
node supabase/seed_test_accounts.mjs  # seed ambassador/tutor/admin test accounts
pnpm dlx tsx scripts/verify_realdata.mts        # smoke-test availability + tutor/student stats + names
pnpm dlx tsx scripts/verify_booking_cloud.mts   # smoke-test booking against cloud
pnpm dlx tsx scripts/verify_password_auth.mts   # smoke-test password auth

# seed CLOUD (get the key: supabase projects api-keys --project-ref nepnxbvseuzuayhxaigo):
#   SUPABASE_URL=https://nepnxbvseuzuayhxaigo.supabase.co SUPABASE_SERVICE_ROLE_KEY=… node supabase/seed_cloud.mjs
```

Dev sign-in (all `password123`) — students `student@`/`student1@`/`student2@`/`student3@`,
tutors `sara@`/`devon@`/`maya@`/`alex@`/`nina@` `crimson.ua.edu`.
App currently points at **cloud** (`apps/mobile/.env`), which is now fully seeded.
