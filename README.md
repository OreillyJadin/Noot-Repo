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

## Error tracking and uptime (Sentry)

Sentry is optional and stays off until a DSN is configured. The mobile app reports crashes
and unhandled errors. Edge Functions report thrown errors and any 5xx response, along with
the function name and HTTP method/path (without query parameters). Request bodies and headers
are never sent, and emails and credentials are scrubbed.

### Create the Sentry projects

1. Create a free account at [sentry.io](https://sentry.io).
2. Create a project with platform **React Native**, for example `noot-mobile`.
3. Create another project with platform **Deno**, for example `noot-functions`.
4. For each project, open **Project Settings → Client Keys (DSN)** and copy its DSN.

### Enable mobile error reporting

Add the mobile project's DSN to the `env` object in each profile (`development`, `preview`,
and `production`) in `apps/mobile/eas.json`:

```json
"EXPO_PUBLIC_SENTRY_DSN": "PASTE_THE_MOBILE_PROJECT_DSN_HERE"
```

A DSN only allows the app to send events, so it is safe to commit. A new EAS build is needed
for the setting to take effect in the installed app.

### Enable Edge Function error reporting

Set the functions project's DSN as a Supabase secret. The functions read it on each request,
so no code change or redeploy is needed:

```sh
supabase secrets set SENTRY_DSN='PASTE_THE_FUNCTIONS_PROJECT_DSN_HERE' --project-ref nepnxbvseuzuayhxaigo
```

Optionally set a Sentry environment name for function events:

```sh
supabase secrets set SENTRY_ENVIRONMENT=production --project-ref nepnxbvseuzuayhxaigo
```

### Email alerts

In each Sentry project, open **Alerts → Create Alert → Issues**, choose **A new issue is
created**, and select email as the notification action.

### Source maps (optional, later)

Source maps make production stack traces point to the original app source. Create an
organization auth token in **Settings → Auth Tokens**, then add it to EAS as a secret for
each build environment you use:

```sh
eas env:create --name SENTRY_AUTH_TOKEN --value 'PASTE_THE_ORG_AUTH_TOKEN_HERE' --visibility secret --environment production
eas env:create --name SENTRY_AUTH_TOKEN --value 'PASTE_THE_ORG_AUTH_TOKEN_HERE' --visibility secret --environment preview
eas env:create --name SENTRY_AUTH_TOKEN --value 'PASTE_THE_ORG_AUTH_TOKEN_HERE' --visibility secret --environment development
```

Add your Sentry organization and mobile project names to the
`@sentry/react-native/expo` plugin options in `apps/mobile/app.json`, then remove
`SENTRY_DISABLE_AUTO_UPLOAD` from `apps/mobile/eas.json`. Keep the auth token in EAS secrets;
do not put it in the repository.

### Uptime checks

A free monitor such as Better Stack can check
`https://nepnxbvseuzuayhxaigo.supabase.co/functions/v1/connect-return`. It is the only
function deployed with JWT verification off that answers a plain `GET` without side effects.
It responds with `302` to `noot://connect-return`, so configure the monitor not to follow
redirects and expect status `302`.

Other function URLs answer `401` without a login. Treating that as “up” only confirms that
the Supabase gateway is reachable. Each check invokes a function and counts against the
Supabase quota, so a few-minute interval is plenty.

## Architecture guardrail

Only `packages/core` and `supabase/functions` may import `@supabase/*` or `stripe`.
Everything else goes through `@noot/core`. This keeps the UI backend-agnostic so the
Phase 2 AWS migration is a swap, not a rewrite (ARCHITECTURE.md §9). Enforced by ESLint.
