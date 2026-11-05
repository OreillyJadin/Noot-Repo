# Hosting the web app

The web app is `apps/mobile` exported as a static single-page app
(`pnpm --filter @noot/mobile build:web` → `apps/mobile/dist/`). It talks to the same Supabase
project and Stripe account as the phone app, so an account works on both. `apps/web` (the
Next.js marketing site) is separate and unaffected; trynoot.com itself is Jacob's WordPress site.

## Host: Cloudflare Pages (recommended)

- Free plan allows commercial use, unlimited bandwidth, HTTPS on a `*.pages.dev` address.
  (Vercel's free Hobby plan is non-commercial only; Noot would need Pro.)
- With no top-level `404.html` in the output (our export has none), Pages serves
  `index.html` for unknown paths, which is the SPA fallback deep links like
  `/auth-callback?code=…` and `/tutor_profile` need. Nothing to configure.
- Custom domain `app.trynoot.com`: see `docs/WEB_APP_DOMAIN_AND_BRANDING.md`. Pages adds it without changing the build.

### Steps for Jadin (one time)

1. Sign up / log in at https://dash.cloudflare.com.
2. **Workers & Pages** → **Create** → **Pages** tab → **Connect to Git** → authorize GitHub →
   pick `OreillyJadin/Noot-Repo`.
3. Build settings:
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: `pnpm --filter @noot/mobile build:web`
   - Build output directory: `apps/mobile/dist`
   - Root directory: leave empty (repo root)
4. **Environment variables** (Production), copied from the `production` profile in
   `apps/mobile/eas.json` (all `EXPO_PUBLIC_*` values are public by design, they ship in the app):
   - `NODE_VERSION` = `24`
   - `PNPM_VERSION` = `9.12.0`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (the `pk_live_…` key)
   - `EXPO_PUBLIC_SENTRY_ENVIRONMENT` = `production`
   - `EXPO_PUBLIC_SENTRY_DSN` (optional; web errors go to the same Sentry project)
   For **Preview** deployments use the `preview` profile's values (test-mode Stripe key).
5. **Save and Deploy.** Note the address it gives you, e.g. `https://noot-app.pages.dev`.
   Every push to `main` redeploys; other branches get preview URLs.

## Supabase: let email links open the web app (Jadin, one time)

Password-reset and sign-up emails link back to wherever the request came from
(`<web address>/auth-callback`). Supabase only redirects to allow-listed addresses and
otherwise silently falls back to the Site URL, so add the web address:

1. https://supabase.com/dashboard → the **production** Noot project.
2. **Authentication** → **URL Configuration**.
3. **Site URL**: leave as is (`https://trynoot.com`).
4. **Redirect URLs** → **Add URL** → `https://noot-app.pages.dev/**` (your real Pages address
   from step 5 above, with `/**` at the end) → **Save URLs**.
5. Keep the existing `noot://**` entry; the phone app needs it.

When a custom domain is added later, add `https://<domain>/**` the same way.

How the links behave:
- A link opened in the same browser that asked for it signs straight in (PKCE; the verifier is
  in that browser's localStorage).
- Opened anywhere else (asked on a laptop, tapped on a phone), the link can't be exchanged; the
  screen says so and points at the 6-digit code in the same email, which works anywhere.

## Stripe (later, only if wanted)

Cards work on any HTTPS address with no setup. Apple Pay / Google Pay / Link in the browser
need the web domain registered under Stripe Dashboard → **Settings** → **Payment method domains**
(live and test mode). Not needed until the custom domain exists.
