# Noot — project context for Claude

Peer-to-peer campus tutoring app. pnpm + Turborepo monorepo. Launching University of
Alabama, Fall 2026. Read `ARCHITECTURE.md` (authoritative) and `HANDOFF_CLAUDE.md`
(current state) before starting work.

**Newest state: `PICKUP_HERE.md`** — the Expo **SDK 54→57** upgrade (done, on `main`,
device-verified in Expo Go): what changed, the gotchas, and what still needs a new EAS build.

**Latest handoff: `HANDOFF_2026-08-11.md`** — App Store readiness state, what's blocking
submission, and the split between what Jadin must do (§3, needs credentials/domain/device)
and what a session can pick up unaided (§3.5). Read it before planning work.

## Current scope — mobile only, no web (2026-09-04)

**We are only working on the mobile app (iOS + Android) right now. Web is out of scope.**
That means both:

- **`apps/web`** (the Next.js marketing site) — don't touch it, don't feature-work it.
- **The mobile app's own web target** (`platform=web` / react-native-web at :8081) — not a
  supported surface right now. **Its Metro bundle is currently broken on SDK 57** (see
  `PICKUP_HERE.md`). Do not spend time fixing it unless asked; do not treat a web bundle
  failure as a blocker for mobile work.

iOS and Android are the only targets that must build and run.

## Golden rule — verify in the live app before committing

**Before committing, open the live local app and manually test that the function we
just worked on actually works.** Don't rely on typecheck or unit checks alone — drive
the real flow in the running app and confirm the behavior end-to-end. Only commit once
you've seen it work.

- The tutoring functions live in the **mobile app**. Verify on **iOS or Android** —
  `pnpm mobile`, then scan the QR with **Expo Go** (needs Expo Go on **SDK 57**), or use
  the EAS dev build for anything needing native modules (PaymentSheet, Face ID).
- **Do NOT verify at http://localhost:8081.** That was the old habit and it no longer
  works — the mobile app's web bundle is broken on SDK 57 and web is out of scope
  (see "Current scope" above). If you have no device, say the flow is unverified rather
  than substituting the web target.
- Backend is live locally via Supabase (see below); inspect data in Studio at
  http://localhost:54323.
- For a fast backend-only smoke test of the `@noot/core` data layer:
  `pnpm dlx tsx scripts/verify_backend.mts` (14 checks against the live stack).

## Layout

- `apps/mobile` — Expo (**SDK 57**, RN 0.86, React 19.2) app. Screens read/write through
  `@noot/core`. iOS + Android only; the :8081 web dev server is not a supported surface.
- `apps/web` — Next.js marketing site (`pnpm web` → :3000). Not where app features live,
  and **out of scope right now**.
- `packages/core` — the data/auth boundary. **Screens must NEVER import `@supabase/*`
  directly** — everything goes through `@noot/core` (ARCHITECTURE.md §10).
- `packages/ui`, `packages/theme`, `packages/config`.
- `supabase/` — backend as code: migrations, functions, config, `seed_demo.mjs`.

## Local environment gotchas

- **`node` is not on PATH by default.** Add it first:
  `export PATH="$HOME/.local/node-v22.23.1-linux-x64/bin:$PATH"`
- Supabase local stack: `supabase start` / `supabase status`. API :54321, Studio :54323,
  Mailpit :54324, DB :54322. Migrations 0001–0005 apply on `supabase db reset`.
- Dev sign-in (local only): `student@crimson.ua.edu` / tutor `sara@crimson.ua.edu`,
  password `password123`. Re-seed with `node supabase/seed_demo.mjs`.
- `apps/mobile/.env` points at the local stack (`EXPO_PUBLIC_SUPABASE_*`).
- **Don't remove the explicit `react-native-worklets` (0.10.1) and `react-native-reanimated`
  (4.5.1) pins in `apps/mobile/package.json`.** They aren't imported by our code — they're
  peers of `expo-modules-core`/`@expo/ui`, and `.npmrc`'s `auto-install-peers=true` otherwise
  resolves them *ahead* of what SDK 57 supports (0.12.x / 4.6.x) and the install warns.
- After any dependency change run **`npx expo-doctor@latest`** from `apps/mobile` — it catches
  app.json schema drift and SDK version mismatches that typecheck can't see.

## Conventions

- **Before pushing to GitHub, verify the Supabase Preview won't fail.** Run
  `pnpm check:preview` (a pre-push git hook also runs it automatically). It compares
  `supabase/migrations/*.sql` against the remote migration history and fails if the remote
  has a version with no local file — the exact cause of a red "Supabase Preview" check
  (usually the Stripe Sync Engine adding a timestamp-versioned migration). Fix by relabeling
  the remote row to a numeric version with a matching local file, or add the local file
  (see `0016_enable_rls_stripe_schema.sql` for the guarded pattern). Needs
  `SUPABASE_ACCESS_TOKEN` (env or `.noot-secrets.local.env`). On a fresh clone run
  `pnpm hooks:install` to enable the hook. Bypass once with `SKIP_SUPABASE_CHECK=1 git push`.
- Commit only when asked; don't commit unprompted. Git user is "Jadin".
- DB is snake_case, models are camelCase — every row crosses a `map*` fn in
  `packages/core/src/api`. Note `TutorSummary.userId` (not `.id`).
