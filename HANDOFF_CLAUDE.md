# Handoff — for the next Claude chat

_Updated 2026-07-11. Read this first, then `ARCHITECTURE.md` (authoritative for the whole system)._

> **Latest (2026-07-11, roles + ambassador + admin — commits `961e731`…`ad55a6b`):**
> **Role-switching** shipped — one account can be student + tutor + ambassador and switch mode from
> Profile (`<RoleSwitcher>` persists `users.active_role`, guard trigger `0007`; "Viewing as" indicator).
> The full **Ambassador program** (referral share screen + dashboard pipeline/earnings; `list-referrals`
> + `award-referral-bonus` fns; codes via `create_my_ambassador_profile`). The full **Admin panel**
> (gated off Profile): tutor approval + **transcript upload** (private `transcripts` Storage bucket,
> `expo-document-picker`), user management (suspend/ban via GoTrue), booking oversight/disputes, review
> moderation — each a service-role Edge Function that re-verifies `is_admin`. Migration `0009` closes the
> **tutor self-approve** RLS gap. Migrations `0007`–`0011` applied local + cloud; all new fns deployed.
> Security-reviewed after each phase (one finding — unauthenticated `award-referral-bonus` — fixed).
> Full worklog: `notes/2026-07-10-2110-role-switching-ambassador-admin.md`.

> **Prior (2026-07-10, "kill all dummy data" session — commit `71d9cfb`):** every screen now
> reads **real database data** — the ported demo constants are deleted. Real tutor availability is
> wired into the booking calendar; `TUTORS`/`REVIEWS_POOL`/`tutorById` are gone (replaced by a
> `<NoSession/>` guard); new `@noot/core` `tutorStats()`/`studentStats()` power the dashboards;
> `resolve-participants` (now +year/major, **deployed to cloud**) resolves real student names;
> remaining un-backed figures became honest zero-states. **The cloud project is fully seeded**
> (`supabase/seed_cloud.mjs`: 5 tutors +availability, 4 students, 8 bookings, reviews, chats).
> Verified 8/8 vs local AND cloud (`scripts/verify_realdata.mts`). Details in the session section below.

> **What changed since 2026-07-06** (details in "Session 2026-07-07→07-10" below): auth is now
> **password-first** (signup = verify-only → set password; sign-in = email+password), upgraded to
> **Expo SDK 54**, added a **biometric launch gate** + encrypted session storage, `listPast` (real
> Past sessions), the `tutors.getAvailability` read endpoint, the `resolve-participants` edge
> function (real counterparty names), dark mode + Empty/Skeleton states, and the `pnpm tunnel` helper.

## TL;DR of where we are

The app is now **wired to a live Supabase backend and verified end-to-end.** All migrations
are applied (local AND cloud), the `@noot/core` data layer is fully implemented (no more
stubs), and the mobile screens read/write through it. A backend smoke test drives the real
`@noot/core` code against the DB and passes 14/14 — verified against **both** local and cloud.

**As of 2026-07-06 the app points at the CLOUD project** (`apps/mobile/.env` →
`https://nepnxbvseuzuayhxaigo.supabase.co`), so it works on real phones via Expo Go. Local
values are kept commented in `.env` for easy switch-back.

## Repo shape (context)

pnpm + Turborepo monorepo. Peer-to-peer campus tutoring, launching University of Alabama Fall 2026.
- `apps/mobile` — Expo (iOS/Android/web app). Screens now read/write through `@noot/core`
  against the live backend (was in-memory `lib/store.tsx`/`lib/data.ts` before).
- `apps/web` — Next.js marketing site.
- `packages/core` — the data/auth boundary. **Screens must never import `@supabase/*` directly**
  (ARCHITECTURE.md §10 guardrail); everything goes through here.
- `packages/ui`, `packages/theme`, `packages/config`.
- `supabase/` — the backend (migrations, functions, config).

## Backend: live and verified

- **Supabase CLI 2.109.0 + Docker are installed**; the local stack is up (`supabase status`).
  API `http://127.0.0.1:54321`, Studio `:54323`, Mailpit/Inbucket `:54324`, DB `:54322`.
- **All 5 migrations applied** (`supabase migration list` shows 0001–0005 local+remote):
  - `0001_init.sql` — 13-table schema, 8 enums, indexes, `updated_at` triggers.
  - `0002_rls.sql` — RLS + SECURITY DEFINER helpers + policies.
  - `0003_auth_and_campus_gate.sql` — `campuses` allowlist (UA seeded), `.edu`/campus
    email gate + `handle_new_user` provisioning trigger on `auth.users`.
  - `0004_profile_extensions.sql` — profile column extensions.
  - `0005_grants.sql` — role grants.
- **Seed data** via `supabase/seed_demo.mjs` (idempotent, service-role admin API): 5 approved
  demo tutors + a dev student. Dev password for all accounts: `password123`.
  Run: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed_demo.mjs`
  (defaults target the local stack). Dev login: `student@crimson.ua.edu` / tutor
  `sara@crimson.ua.edu`.
- **Cloud project** `nepnxbvseuzuayhxaigo` (us-east-1, Postgres 17, ACTIVE, linked via
  `supabase link`). All 5 migrations applied there too; seeded with the same demo data
  (2026-07-06). `_layout.tsx` calls `initSupabase()` from `EXPO_PUBLIC_SUPABASE_*`.
- **`apps/mobile/.env` currently points at CLOUD** (URL + anon key). The local stack values
  are commented in the same file — swap the comments to go back to local. `.env` is gitignored;
  keys never hit the repo.

### Switching env targets
- **Cloud → local:** in `apps/mobile/.env`, comment the cloud `EXPO_PUBLIC_SUPABASE_*` lines
  and uncomment the local ones (`http://127.0.0.1:54321` + local anon key). Local needs the
  Docker stack up (`supabase start`).
- **Seed cloud:** `SUPABASE_URL=https://nepnxbvseuzuayhxaigo.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<cloud service_role> node supabase/seed_demo.mjs`
  (get the key: `supabase projects api-keys --project-ref nepnxbvseuzuayhxaigo`).
- **Push new migrations to cloud:** `supabase db push` (no Docker needed).

## State of `packages/core`

- `models/index.ts` — ✅ all domain types.
- `supabase.ts` — ✅ real singleton client (`initSupabase`/`getSupabase`).
- `auth/index.ts` — ✅ `sendMagicLink`, `signOut`, `getSessionUserId`, plus **`devSignIn`**
  (email+password, DEV ONLY — local `enable_confirmations` off so signUp returns a session).
- `api/index.ts` — ✅ **fully implemented** (was the big gap). `getMe`, `profile.*`
  (updatePersonal/setCourses/updateTutorProfile/updateRates/setTutorCourses/updateAvailability),
  `tutors.*` (search/getById/listSaved/save/unsave), `listUpcoming`, `chat.*`
  (getOrCreateConversation/listMessages/sendMessage/subscribe/listConversations),
  `reviews.listForTutor`, and `createPaymentIntent` (Edge Function). All rows cross a `map*`
  fn (snake_case → camelCase). **Note: `TutorSummary.userId`, not `.id`.**

## Verification done this session (2026-07-05)

- `scripts/verify_backend.mts` drives the real `@noot/core` auth + api against the live
  local stack. **14/14 pass**: devSignIn → getMe → tutor search (all + by course) → getById →
  save/listSaved/unsave (RLS-scoped writes) → chat create/send/list → listUpcoming.
  Run: `pnpm dlx tsx scripts/verify_backend.mts` (node is at
  `~/.local/node-v22.23.1-linux-x64/bin` — add to PATH).
- `pnpm --filter @noot/core typecheck` — clean.
- `pnpm --filter @noot/mobile typecheck` — **clean** (fixed this session, see below).

The same smoke test was re-run against the **cloud** project (env vars pointed at
`https://nepnxbvseuzuayhxaigo.supabase.co`) after switching `.env` — **14/14 pass on cloud too.**

### Fixed this session
- The pre-existing `process`-not-typed errors in `apps/mobile/app/_layout.tsx` are resolved
  by a new ambient `apps/mobile/expo-env.d.ts` (declares the `process` global + our
  `EXPO_PUBLIC_*` keys, merging with `expo/types`' `NodeJS.ProcessEnv`). Deliberately did NOT
  add `@types/node` — it would add Node globals that don't exist in the RN runtime.

## Screen-wiring audit & fixes (2026-07-06)

A full audit of all 47 screens (reachability, nav edges vs the design's
`design_handoff_noot_app/app/screens-map.jsx`, and `@noot/core` wiring). Fixes landed:

**Navigation / reachability:**
- `role.tsx` — was the real onboarding bug: both role buttons pushed `/home` and never
  persisted the role. Now `setRole(sel)` + routes Student → `/student_profile`, Tutor →
  `/t1`. Un-orphans `student_profile` (S1) and the whole `t1…t10` tutor onboarding.
- Role-aware tabs: all 8 tab screens now read `role` from `useApp()` and pass it to
  `<TabBar>` (was hardcoded `"student"`); tab switching standardized to
  `router.replace('/'+key)` (also fixed `tutor_calendar` which used `push`).
- `xsc` (cancel) + `xns` (no-show) un-orphaned — entry links added on `sessions.tsx`.
- Sign-in labeling: auth screen reads `?mode=login|signup` so "Log In" no longer shows a
  page titled "Sign up" (magic-link = one flow; only the copy differs).

**Read-only data wiring** (added `apps/mobile/lib/useMe.ts` — the `getMe()` hook):
- ~21 screens now read real data via `@noot/core` (identity, tutor lists, saved list,
  upcoming sessions, chat threads) instead of `lib/data.ts` demo constants / hardcoded
  "Lindsay Thomas". Places with no API yet are marked `// TODO(api): …`.

**Dev shortcuts (`signup.tsx`):** `__DEV__`-gated devSignIn shortcuts are correct (real
session + `setRole`). Fixed: dev student now lands on `/home` (was `/student_home`), and the
"Open the link (demo)" fake deep-link is now `__DEV__`-only (it advanced to `/verified`
without a session — would strand a real prod user unauthenticated).

**Verified:** whole-workspace `pnpm -r typecheck` clean; `expo export --platform web`
bundles all 805 modules with no errors and serves 200. NOT click-tested in a live browser
(none available in that session) — do a manual pass per the golden rule.

**Not done (needs Edge Functions — see below):** write mutations remain UI-only stubs
(`b4` payment, `c2/c3` ratings, `xsc/xtc/xtr/xsr/xns` cancel/refund/reschedule/no-show) and
`sessions` "Past" / tutor earnings/stats / availability-read have no endpoints yet.

## Known TODOs / gaps (roughly prioritized)

1. **Edge Functions** — DEPLOYED to cloud (all ACTIVE): booking set (`create-payment-intent`,
   `confirm-booking`, `cancel-booking`, `reschedule-booking`, `report-no-show`, `submit-rating`,
   `resolve-participants`) + as of 2026-07-11 the ambassador/admin set (`list-referrals`,
   `award-referral-bonus`, `approve-tutor`, `moderate-review`, `admin-set-user-status`,
   `resolve-dispute`). **Money is simulated** (`sim_pi_…`, no real charge/payout).
   Still UNWRITTEN: `stripe-webhook`, `complete-session`, `connect-onboarding-link`,
   `send-reminders`/`auto-complete` (crons) (ARCHITECTURE.md §5). Real Stripe money movement is
   the big remaining piece — it also triggers `award-referral-bonus` (built, awaiting `complete-session`).
2. ~~**Wire availability read into the UI**~~ — **DONE 2026-07-10** (`lib/availability.ts`,
   consumed by `b1`/`b3`/`edit_availability`/`tutor_calendar`). Still open: **server-side booking
   validation** (scheduled_at inside a window + no overlap with a confirmed booking).
3. **Realtime `chat.subscribe`** (websocket) was NOT exercised by the smoke test — only the
   insert/read message flow was. Low risk but unverified.
4. ~~**Column-level hardening** — tutor editing their own `tutor_profiles.approval_status`~~ —
   **DONE 2026-07-11** (migration `0009` trigger: approval fields are service-role-only, so
   `approve-tutor` is the sole writer). `0010` similarly guards `users.status`. Both verified.
5. **Cloud SMTP (blocks real signups)** — signup verification + password-reset emails go through
   Supabase auth email. On cloud that's the built-in sender (members-only, hard rate-limited), so
   real `.edu` students can't verify yet. Wire a real SMTP provider + mirror the redirect
   allow-list into the cloud dashboard (see "Cloud auth / SMTP setup" below). The app-side
   deep-linking (`/auth-callback`, PKCE) is DONE. Local dev sidesteps SMTP via Mailpit.
6. **Message attachments** — `models.MessageAttachment` exists but no table.
7. **ESLint guardrail** (ban `@supabase/*` imports outside `packages/core`/`supabase/functions`)
   — verify it's actually configured. `@noot/core` re-exports `getSupabase` from its root,
   which could let a screen bypass the `api`/`auth` wrappers — consider not re-exporting the
   raw client from the package root.

## Cloud auth / SMTP setup (before real `.edu` sign-ups)

**Why this is needed:** on cloud, `sendMagicLink` (`signInWithOtp`) sends an email. Supabase's
built-in email service only delivers to project members and is hard rate-limited (a few/hour) —
it is NOT for real users. Until a real SMTP provider is wired, real students can't receive a
magic link. (Local dev doesn't hit this: emails land in Mailpit at `http://localhost:54324`,
and `devSignIn` skips email entirely.) Seeded demo accounts also skip it — they're created
pre-confirmed via the admin API, so `devSignIn` password login works on cloud today.

**Steps (do these in the Supabase dashboard for project `nepnxbvseuzuayhxaigo`):**

1. **Pick an SMTP provider** — Resend, Postmark, SendGrid, or AWS SES. Verify a sending domain
   (e.g. `mail.noot.app`) with SPF + DKIM records so mail isn't spam-filtered.
2. **Dashboard → Authentication → Emails → SMTP Settings → enable Custom SMTP** and fill:
   - Host / Port (587 STARTTLS or 465 SSL), Username, Password (the provider's API key/creds)
   - Sender email (on the verified domain) + sender name ("Noot")
3. **Dashboard → Authentication → Rate Limits** — raise the email send rate above the tiny
   built-in default to something sane for launch.
4. **Redirect URLs — Dashboard → Authentication → URL Configuration:**
   - Site URL + Additional Redirect URLs must include the app's magic-link return target.
   - These mirror `supabase/config.toml`'s `[auth] site_url` / `additional_redirect_urls`
     (currently `http://localhost:8081` and `noot://`). Add the production web origin and the
     real app deep-link scheme (`noot://…`) here too. **Cloud dashboard settings are separate
     from `config.toml`** (config.toml only drives the LOCAL stack unless you `supabase config
     push`), so set them in both places.
5. **Customize the magic-link email template** (Authentication → Emails → Templates) — subject/
   body/branding. Keep the `{{ .ConfirmationURL }}` token.
6. **Confirmation vs OTP:** cloud has email confirmations ON by default (that's why an
   un-seeded `devSignIn` signUp gets no session). For real users the magic link IS the
   confirmation — no change needed. Don't turn confirmations off on cloud.
7. **App-side deep-link work — DONE** (2026-07-06, see "Magic-link deep-linking" below). The
   `/auth-callback` route already exchanges the emailed link's code for a session. Once SMTP +
   the cloud redirect URLs (step 4) are set, real `.edu` sign-ups work end-to-end.

**Test after setup:** sign up with a real `@crimson.ua.edu` address (campus gate in `0003`
allows it) → confirm the email arrives from your domain → tapping the link signs you in.
Config-only changes here have no local runtime surface; verify by doing that real sign-up.

## Magic-link deep-linking (built 2026-07-06)

The app-side of real magic-link auth (was TODO #4b) is DONE and verified end-to-end against
the local stack. How it flows:

1. `signup.tsx` → `auth.sendMagicLink(email, Linking.createURL('/auth-callback'))` sets
   `emailRedirectTo` so the emailed link returns to the app (web: `http://localhost:8081/auth-callback`,
   device build: `noot://auth-callback`).
2. Supabase emails a link to GoTrue `/auth/v1/verify?...&redirect_to=…`; following it `303`s to
   `/auth-callback?code=<uuid>` (PKCE).
3. `apps/mobile/app/auth-callback.tsx` (new route) calls `auth.completeAuthFromUrl(url)` →
   `exchangeCodeForSession(code)` (with a `token_hash`/`verifyOtp` fallback), then routes:
   onboarded (`firstName` set) → `/home` or `/tutor_home` by role; new user → `/verified`.
4. Client config (`packages/core/src/supabase.ts`): `flowType: 'pkce'`, `detectSessionInUrl:
   false` (we parse the URL ourselves), and a `storage` adapter — `_layout.tsx` passes
   AsyncStorage on native (session + PKCE verifier survive a restart), localStorage on web.

**Verify:** `pnpm dlx tsx scripts/verify_magiclink.mts` — drives the real `@noot/core`
functions: send → read Mailpit → follow verify link → exchange code → `getMe`. 5/5 pass.

**Caveats / still TODO:**
- **Not click-tested in a live Expo web browser** — core logic + `expo export` bundling are
  verified; do a manual pass on `pnpm mobile` → `w`.
- **Expo Go** uses the `exp://…` scheme, not `noot://` — device deep-linking needs a real
  dev/prod build. Web dev works today.
- **Cloud redirect URLs**: `config.toml`'s `additional_redirect_urls` now includes
  `http://localhost:8081/**` + `noot://**`, but cloud dashboard URL config is separate — mirror
  it there (see SMTP setup step 4).
- **Cross-device links** break PKCE (verifier is on the sending device). Same-device (the norm)
  works; revisit `token_hash` flow if cross-device is needed.

## Session 2026-07-07→07-10 (what landed after the 07-06 handoff)

Commits `cb1488c … 839b012` on `origin/main`. Highlights:

- **Auth reworked to password-first** (`4184728`, `7d8ba9e`, `9edf0f0`). The magic link is no
  longer the day-to-day sign-in path:
  - **Sign-up = verification only.** `signup.tsx` collects name + campus email and calls
    `auth.sendSignupVerification(email, first, last, redirectTo)` → magic link proves the `.edu`.
    There is deliberately **no password field at signup**.
  - **Set password in onboarding.** After `/auth-callback`, a verified-but-new user goes to
    `set_password.tsx` → `auth.setPassword(pw)`.
  - **Sign-in = email + password** (`signin.tsx` → `auth.signInWithPassword`). `forgot_password.tsx`
    → `auth.sendPasswordReset`.
  - New `@noot/core/auth` exports: `sendSignupVerification`, `signInWithPassword`, `setPassword`,
    `sendPasswordReset`. `sendMagicLink`/`completeAuthFromUrl`/`devSignIn` still present.
  - Verified: `scripts/verify_password_auth.mts` (+ `verify_mutations.mts`).
- **Biometric launch gate + encrypted storage** (`9edf0f0`). `lib/AuthGate.tsx` wraps the root
  `<Stack>`: on a cold launch with a persisted session and biometric opt-in, it requires Face/Touch
  ID before revealing the app. `lib/biometrics.ts` + `lib/secureStorage.ts`; opt-in via
  `enable_faceid.tsx`. **Not device-tested** (Expo Go / no biometric hardware in dev).
- **Expo SDK 54** (`cb1488c`) — React 19 / RN 0.81. (CLAUDE.md updated from SDK 52.)
- **Data-layer additions** (`755d90d`, `a5c0eb8`, `033691d`):
  - `api.listPast()` — real completed/past bookings; wired into `sessions.tsx` "Past" tab.
  - `tutors.getAvailability(tutorId)` — recurring weekly windows read (RLS allows any auth read).
    **⚠️ Built but unconsumed:** booking `b1`/`b3` and `edit_availability.tsx` still compute demo
    slots (`TODO(api)` markers remain in-code). Wiring this is the cleanest next task.
  - `tutors.search({ course, categoryPrefixes })` — category-prefix filtering for browse tabs.
- **`resolve-participants` edge function** (`b1993f`, `940f1bc`) — resolves counterparty display
  names for chat/session lists (killed the hardcoded "Lindsay Thomas"). Deployed; present in
  `supabase/functions/`. Real student names now show in tutor sessions.
- **UX polish** (`033691d`, `a5c0eb8`, `1d9ffb4`): dark mode (`lib/themePref.tsx`), shared
  `packages/ui` `EmptyState` + `Skeleton`, empty/loading states across screens, unified tab-bar nav
  (`lib/useTabNav.ts` — reselect scrolls to top / soft-resets).
- **Test infra**: `supabase/seed_test_accounts.mjs` (ambassador/tutor/admin accounts) and the
  `pnpm tunnel` tmux wrapper (`scripts/tunnel.sh`, `d6a5341`/`98018b4`/`839b012`) — persistent Expo
  tunnel that survives SSH drops and auto-picks a free Metro port (README documents it).

## Session 2026-07-10 (later) — killed ALL dummy data + populated cloud (`71d9cfb`)

Goal: "get rid of all the dummy data and only use real database data," then populate the cloud
so nothing renders empty. Every screen now reads live `@noot/core` data.

**Tier 1 — real availability + no fake tutors/reviews:**
- New `apps/mobile/lib/availability.ts` — `slotsFromWindows` / `nextFromWindows` / `isTimeOpen`
  map `tutors.getAvailability()` weekly windows onto the 14-day calendar. Consumed by `b1`
  (next-available per tutor), `b3` (slot picker), `edit_availability` (prefills the block grid),
  `tutor_calendar` (open-slot grid). The mock `slotsFor()` is deleted.
- `lib/data.ts`: `DAYS` now starts at **real today** and carries `dowNum` (0-6) + `year`; `b4`'s
  `computeScheduledAt` uses `dayObj.year` (no more hardcoded 2026). Removed `TUTORS`,
  `REVIEWS_POOL`, `tutorById`, `reviewsFor`; kept the `toTutor`/`toReview` adapters + `Day`/`Tutor`
  types. The `?? TUTORS[0]` fallbacks across `b2/b3/b4/c1/c2/xsc/xsr/xtc/xns/xtr/tb2/sessions`
  became a shared `<NoSession/>` guard (`lib/NoSession.tsx`).

**Tier 2 — new `@noot/core` read endpoints (`api/index.ts`):**
- `tutorStats()` → `{ sessionsTaught, hoursTaught, earnedThisWeek, earnedTotal, avgRating,
  cancelledCount, cancelRate }` from the tutor's real bookings + profile rating. Wired into
  `tutor_home`, `tutor_profile`, `c4`.
- `studentStats()` → `{ sessionsCompleted, upcomingCount, hoursLearned }`. Wired into `home`
  (momentum) + `profile` (with a `listSaved` count).
- `resolveParticipantNames()` + the `resolve-participants` edge function now also return
  `year`/`major`. New `lib/useCounterpart.ts` resolves the real student (falls back to the first
  booking counterparty, then "Your student") — replaces the hardcoded `"Lindsay Thomas"` in
  `tb1/tb2/xtc/xns/xtr/c1/c3/chat_tutor`.

**Tier 3 — honest zero/empty states (ARCHITECTURE §7, "don't port the demo numbers"):**
- Chat attachments (`chat`/`chat_tutor`) → empty until Storage upload exists. Referral credits
  (`profile`) → CTA with no fabricated balance. Study streak / monthly goal (`home`) → removed
  (no data model). Fake saved-card / payout last-4 → "no card on file" / "not connected".
  Onboarding prefills (`t2/t7/t8/t9`) read from the signed-in user.

**Data + cloud:**
- `supabase/seed_demo.mjs` now seeds tutor availability. New **`supabase/seed_cloud.mjs`** is the
  full populate: 5 tutors (+availability +courses), 4 students (`student`/`student1..3`), 8
  bookings (upcoming+past), 4 approved reviews, 8 conversations + 16 messages. Idempotent.
- **Cloud** (`nepnxbvseuzuayhxaigo`) seeded via the service role; `resolve-participants` **deployed**
  to cloud (it was missing from the deployed set — the 6 booking/payment fns were there, it wasn't).
- `.env` still points at cloud; it's now fully populated. Test accounts are pre-confirmed (admin
  API), so they sign in with `password123` without SMTP.

**Verification:** `scripts/verify_realdata.mts` (availability→slots, tutorStats, studentStats,
resolve shape) — **8/8 vs local AND cloud**. `verify_backend.mts` still 14/14. `pnpm -r typecheck`
clean. `expo export --platform web` bundles 845 modules, no errors. **Not click-tested in a live
browser** — do a manual pass per the golden rule.

**Known non-dummy TODOs left (missing endpoints/features, not fake data):** chat attachment upload
(Storage) + `message_attachments` table; the reschedule-proposal time shown on `xsr` (no read for a
pending proposal); tutor onboarding doesn't persist a draft across `t2→t9`, so `t9`'s preview
course/rate are illustrative; server-side booking validation (window + overlap) still unenforced.

## Key schema decision (don't undo without reading)

**Every person reference points to `public.users(id)` (= `auth.uid()`)** so every RLS policy is
a join-free `auth.uid() = <col>` check. `tutor_profiles` / `ambassador_profiles` are 1:1
satellites keyed by `user_id`. So `bookings.tutor_id`, `reviews.subject_user_id`, etc. FK to
`users`, **not** to the profile tables `prd-data-models.md` named. Deliberate, consistent with
the "one account, multiple roles" decision (ARCHITECTURE.md §4). `public.users.id` FKs to
`auth.users.id` and is auto-created by `handle_new_user` — the app never inserts it.
ARCHITECTURE.md §4 "resolved decisions" supersede `prd-data-models.md` on conflict.

## Git / environment notes

- Git user is "Jadin". Commit only when the user asks — don't commit unprompted.
- `node` is not on PATH by default: `~/.local/node-v22.23.1-linux-x64/bin`.
- The Supabase CLI `.deb` installer is gitignored (`*.deb`).
- **`MANUAL_SETUP.md`** (root) is the owner-facing checklist of dashboard/deploy steps
  (SMTP, redeploys, local-vs-cloud). Point the user there for "what do I need to do?".
- **Local Postgres is now 17** (`config.toml [db] major_version = 17`). On 2026-07-06 the
  local stack wouldn't start: CLI 2.109 runs PG17.6 but the volume was PG15. Fixed by
  removing `supabase_db_noot` volume + `supabase start` (fresh) + `node supabase/seed_demo.mjs`.
  Local demo data is disposable — always reproducible from migrations + the seed script.
- **Local edge runtime only serves functions present at `supabase start`.** After adding a
  new function, `supabase stop && supabase start` (a `docker restart` won't pick it up).
  Cloud is unaffected — deploy with `supabase functions deploy`.
