# noot

Peer-to-peer campus tutoring. One React codebase → **iOS, Android, and a web app**,
plus a **marketing site**. Launching at the University of Alabama, Fall 2026.

## Repo layout

```
apps/
  mobile/    Expo (React Native + RN Web) → iOS, Android, web app
  web/       Next.js marketing site
packages/
  theme/     design tokens (ported from the handoff)
  ui/        shared component kit (RN + RN Web)
  core/      data + auth boundary — the ONLY place that imports Supabase/Stripe
  config/    shared ESLint/TS config (incl. the Supabase/Stripe import guardrail)
supabase/    Postgres migrations + Edge Functions (Phase 1 backend)
design_handoff_noot_app/   design source of truth (do not ship directly)
```

## Docs

- **`ARCHITECTURE.md`** — full technical architecture (stack, data model, Edge Functions,
  auth, payments, video, Phase 2 AWS migration). Start here.
- **`infrastructure-plan.md`** — two-phase infra strategy (Supabase → AWS).
- **`prd-data-models.md`** — data-model PRD (roles, tables).
- **`design_handoff_noot_app/HANDOFF.md`** — authoritative UI/UX spec.

## Getting started

Requires **Node ≥ 20** and **pnpm ≥ 9** (not yet installed in this environment).

```bash
corepack enable            # provides pnpm
pnpm install               # install the whole workspace
pnpm mobile                # run the app (iOS/Android/web) — fast, local network
pnpm mobile-team           # run the app in tunnel mode — teammates can test off-network
pnpm tunnel                # mobile-team inside tmux — survives SSH drops; reattach on the road
pnpm web                   # run the marketing site
pnpm typecheck             # typecheck all packages except @noot/web
pnpm lint                  # lint (enforces the migration-boundary guardrail)
```

## Architecture guardrail

Only `packages/core` and `supabase/functions` may import `@supabase/*` or `stripe`.
Everything else goes through `@noot/core`. This keeps the UI backend-agnostic so the
Phase 2 AWS migration is a swap, not a rewrite (ARCHITECTURE.md §9). Enforced by ESLint.
