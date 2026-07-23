# Noot — project context for Claude

Peer-to-peer campus tutoring app. pnpm + Turborepo monorepo. Launching University of
Alabama, Fall 2026. Read `ARCHITECTURE.md` (authoritative) and `HANDOFF_CLAUDE.md`
(current state) before starting work.

## Golden rule — verify in the live app before committing

**Before committing, open the live local app and manually test that the function we
just worked on actually works.** Don't rely on typecheck or unit checks alone — drive
the real flow in the running app and confirm the behavior end-to-end. Only commit once
you've seen it work.

- The tutoring functions live in the **mobile app** → **http://localhost:8081**
  (`pnpm mobile`, then press `w`, or `pnpm --filter @noot/mobile web`).
- Backend is live locally via Supabase (see below); inspect data in Studio at
  http://localhost:54323.
- For a fast backend-only smoke test of the `@noot/core` data layer:
  `pnpm dlx tsx scripts/verify_backend.mts` (14 checks against the live stack).

## Layout

- `apps/mobile` — Expo (SDK 54) app. Screens read/write through `@noot/core`. Web dev
  server on **:8081**.
- `apps/web` — Next.js marketing site (`pnpm web` → :3000). Not where app features live.
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
