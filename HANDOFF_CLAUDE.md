# Handoff — for the next Claude chat

_Updated 2026-07-06. Read this first, then `ARCHITECTURE.md` (authoritative for the whole system)._

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

1. **Edge Functions** — only `create-payment-intent` is a skeleton. `stripe-webhook`,
   `confirm-booking`, `complete-session`, `submit-review`/`moderate-review`, `cancel-booking`,
   `approve-tutor`, `award-referral-bonus`, `send-reminders` are unwritten (ARCHITECTURE.md §5).
   Bookings can't be created from the app yet (that path is an Edge Function). `listUpcoming`
   returns 0 until `confirm-booking` exists.
2. **Realtime `chat.subscribe`** (websocket) was NOT exercised by the smoke test — only the
   insert/read message flow was. Low risk but unverified.
3. **Column-level hardening** — RLS can't stop a tutor editing their own
   `tutor_profiles.approval_status`; needs a trigger (approval only via `approve-tutor`
   service role). Noted in `0002_rls.sql`.
4. **Real magic-link auth (SMTP)** — only part (a) remains. (b) is DONE (2026-07-06, see
   "Magic-link deep-linking" below): the app now sends a real `emailRedirectTo`, has an
   `/auth-callback` route that exchanges the `?code=` for a session, and routes new vs.
   returning users. What's LEFT is (a): **cloud SMTP is not configured** so magic-link emails
   don't deliver to real addresses (see "Cloud auth / SMTP setup" below) + mirroring the
   redirect allow-list into the cloud dashboard. Local dev sidesteps SMTP via Mailpit.
5. **Message attachments** — `models.MessageAttachment` exists but no table.
6. **ESLint guardrail** (ban `@supabase/*` imports outside `packages/core`/`supabase/functions`)
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
