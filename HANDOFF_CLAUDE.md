# Handoff — for the next Claude chat

_Updated 2026-07-05. Read this first, then `ARCHITECTURE.md` (authoritative for the whole system)._

## TL;DR of where we are

The app is now **wired to a live Supabase backend and verified end-to-end.** The local
stack is running, all migrations are applied, the `@noot/core` data layer is fully
implemented (no more stubs), and the mobile screens read/write through it. A backend
smoke test drives the real `@noot/core` code against the live DB and passes 14/14.

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
- **`apps/mobile/.env`** is set to the local stack (URL + anon key, verified to match
  `supabase status`). `_layout.tsx` calls `initSupabase()` from `EXPO_PUBLIC_SUPABASE_*`.

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

### Fixed this session
- The pre-existing `process`-not-typed errors in `apps/mobile/app/_layout.tsx` are resolved
  by a new ambient `apps/mobile/expo-env.d.ts` (declares the `process` global + our
  `EXPO_PUBLIC_*` keys, merging with `expo/types`' `NodeJS.ProcessEnv`). Deliberately did NOT
  add `@types/node` — it would add Node globals that don't exist in the RN runtime.

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
4. **Magic-link deep-linking** — real magic-link redirect into the app isn't built; local dev
   uses `devSignIn` / Mailpit. `signup.tsx`'s "Open the link (demo)" is still a fake deep-link.
5. **Message attachments** — `models.MessageAttachment` exists but no table.
6. **ESLint guardrail** (ban `@supabase/*` imports outside `packages/core`/`supabase/functions`)
   — verify it's actually configured. `@noot/core` re-exports `getSupabase` from its root,
   which could let a screen bypass the `api`/`auth` wrappers — consider not re-exporting the
   raw client from the package root.

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
