# Noot — project context for Claude

Peer-to-peer campus tutoring app. pnpm + Turborepo monorepo. Launching University of
Alabama, Fall 2026. Read `ARCHITECTURE.md` (authoritative) and `HANDOFF_CLAUDE.md`
(current state) before starting work.

**Current priority: `APP_REVIEW_START_HERE.md`** — Apple returned **Guideline 2.1 Information
Needed** on the first submission. That file has the rules for this push, Apple's message verbatim,
and the verification loop; `APP_REVIEW_TICKETS.md` is the work list, `APP_REVIEW_REPLY_DRAFT.md`
the reply whose every claim must be true in code, and `APP_REVIEW_AUDITOR.md` the adversarial
audit prompt to run before calling a ticket done. **Read it before doing App Review work.**

**Newest handoff: `HANDOFF_2026-09-21.md`** — trynoot.com migration, Supabase auth email as
code, the Stripe sandbox→live cutover, and exactly what still blocks the App Review
resubmission. Read it first.

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

## Verifying changes before committing

Expo Go device checks are **not** part of the workflow any more — don't ask for one or block a
commit on it. Verify against the live local backend instead:

- Run the `scripts/verify_*.mts` checks that cover what you changed
  (`pnpm dlx tsx scripts/<name>.mts`), and add one when a change has none.
- For a fast backend-only smoke test of the `@noot/core` data layer:
  `pnpm dlx tsx scripts/verify_backend.mts` (14 checks against the live stack).
- Backend is live locally via Supabase (see below); inspect data in Studio at
  http://localhost:54323.
- **Do NOT verify at http://localhost:8081.** The mobile app's web bundle is broken on
  SDK 57 and web is out of scope (see "Current scope" above).

## Git workflow

Priorities: **security and code quality.** These rules apply to every change, however small.

### One feature = one branch
- **Before writing any code**, branch from an up-to-date main:
  `git checkout main && git pull && git checkout -b <type>/<short-description>`
- Name branches by type: `feat/`, `fix/`, `chore/`, `refactor/`
  (e.g. `fix/onboarding-step4-courses`).
- Keep branches short-lived and tightly scoped. If you notice an unrelated issue mid-task,
  **don't fix it on the current branch** — note it and report it at the end.
- Two features in one session = two branches. Commit and push the first before switching,
  and say clearly when you switch and which branch each change lives on.
- **Never commit directly to `main`.**

### Before every push
- Run **`pnpm lint`**, **`pnpm typecheck`** and **`pnpm test`**, plus the `scripts/verify_*.mts`
  checks that cover the change (see "Verifying changes" above). If any fail, don't push —
  report what failed. (The pre-push hook also runs `pnpm check:preview`; see Conventions.)
- Review your own diff with `git diff main...HEAD` for leftover debug code, commented-out
  blocks, unrelated changes and TODOs.
- Security check on that diff:
  - No secrets, API keys or `.env` / `.noot-secrets.local.env` contents.
  - Stripe: **secret** keys (`sk_live_`, `rk_live_`, `whsec_`) never appear in the repo. Code
    and local/dev config use test-mode keys; the only live key in the repo is the publishable
    `pk_live_` in the `production` profile of `apps/mobile/eas.json`, which ships in the app
    by design.
  - Every new Supabase table has **RLS enabled** with policies written for it, and every
    migration's policies are checked as a non-owner (a `verify_*.mts` that tries the write
    as a plain student, like `verify_student_walls.mts`).
  - User input is validated **server-side** (RLS, triggers, SECURITY DEFINER checks or the
    Edge Function), not only in the app.
- Conventional commit messages (`fix: carry step 3 courses into step 4`), **one logical
  change per commit.**

### Handoff
- Push the branch (`git push -u origin <branch>`), then give Jadin a **ready-to-paste PR
  title and description**: what changed and why, how to verify it (the `verify_*.mts`
  checks run; device steps only if useful), any migrations or env changes, and any risks.
- Jadin opens the PR and reviews the diff. **Never merge without Jadin's explicit go-ahead.**

### After approval
- Merge the PR (squash, keeping `main` linear), delete the branch locally and on the remote,
  then `git checkout main && git pull`.

### Sessions
- Say when it's a good time to start a fresh session: after a feature is merged, before
  switching to unrelated work, or when this session has run long enough that earlier context
  may be stale.
- Before Jadin switches, give a short **handoff note** to paste into the new session: branch,
  status, and anything unfinished.

### Subagents
- Use subagents for **read-only exploration** of the codebase, so the main session stays
  focused.
- **Before every push**, spawn a separate review subagent that hasn't seen the work. It reviews
  `git diff main...HEAD` for bugs, security issues (secrets, missing RLS, unvalidated input,
  auth gaps) and anything outside the branch's scope. Fix what it finds, and summarize its
  findings in the PR description.
- **One feature, one branch at a time** — no parallel feature work unless Jadin explicitly asks
  for it, and then each feature gets its own git worktree.

### Never, without asking first
Force-push, rewrite pushed history, merge, delete a branch Jadin hasn't approved, or modify
`main`, **including applying a migration to production.** Git `main` is linked to the
production Supabase project, so migrations are meant to reach production through the merge.

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

- **Start every session with `source scripts/dev-env.sh`.** It puts `node` on PATH *and*
  exports the credentials from `.noot-secrets.local.env` (Supabase PAT, Expo token, Stripe
  keys), then prints which are set — names and lengths only, never values. Do that instead of
  exporting PATH by hand and re-sourcing the secrets file ad hoc.
  - `.noot-secrets.local.env` is **gitignored and chmod 600**; the values never enter git.
    `.noot-secrets.local.env.example` (committed, empty) documents every key and where to get
    it. `dev-env.sh` re-tightens the file to 600 if it ever drifts.
  - The production `service_role` key is deliberately **not** stored — `SUPABASE_ACCESS_TOKEN`
    can read it from the Management API when needed, so there's no second copy of the most
    dangerous key sitting on disk. The *local* `service_role` key is a published dev constant
    and is already inline in `scripts/verify_*.mts`.
- **`node` is not on PATH by default** if you skip the above:
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
- Commit freely on the feature branch; never on `main` (see Git workflow). Git user is "Jadin".
- DB is snake_case, models are camelCase — every row crosses a `map*` fn in
  `packages/core/src/api`. Note `TutorSummary.userId` (not `.id`).
