# supabase/

Backend for noot — Phase 1 (ARCHITECTURE.md §3–§6).

- `config.toml` — local stack config for the Supabase CLI.
- `migrations/` — SQL schema, RLS, and the `.edu` auth gate:
  - `0001_init.sql` — tables + enums (ARCHITECTURE.md §4 / prd-data-models.md).
  - `0002_rls.sql` — Row Level Security. Client (anon key) touches only its own rows +
    public-by-design data; all trust-sensitive writes go through Edge Functions (service role).
  - `0003_auth_and_campus_gate.sql` — `campuses` allowlist + a trigger on `auth.users` that
    rejects non-campus emails, plus a trigger that mirrors new signups into `public.users`
    with a default `student` role.
- `functions/` — Edge Functions: server-only logic (Stripe, review moderation, refund math,
  referral bonuses). These + `packages/core` are the ONLY places allowed to import
  Supabase/Stripe directly (ARCHITECTURE.md §10 guardrail).
- `seed.sql` — dev seed notes.

## Schema decisions (read before touching migrations)

- **Authoritative model is ARCHITECTURE.md §4** (resolved decisions), which supersedes
  `prd-data-models.md`: multiple roles per account (`user_roles` + `users.active_role`),
  admin-moderated reviews (`subject_user_id` + `approval_status`), weekly availability +
  one-off overrides, flat $5 one-time ambassador bonus.
- **Every person reference points to `public.users(id)` (= `auth.uid()`)** so every RLS
  policy is a join-free `auth.uid() = <col>` check. `tutor_profiles` / `ambassador_profiles`
  are 1:1 satellites keyed by `user_id`. (This is why bookings/reviews FK to `users`, not to
  the profile tables the PRD named.)
- `public.users.id` is a FK to `auth.users.id`; the row is auto-created by the
  `handle_new_user` trigger — the app never inserts it directly.

## Prerequisites (not yet installed on this machine)

- **Supabase CLI** — https://supabase.com/docs/guides/cli (`brew install supabase/tap/supabase`
  or the npm/binary install).
- **Docker** — required for the local stack (`supabase start`).

## Local dev

```bash
supabase start            # boots Postgres + Auth + Studio + Inbucket (Docker)
supabase db reset         # applies migrations/ then seed.sql
supabase status           # prints API URL + anon key for apps/mobile/.env
supabase functions serve  # run Edge Functions locally
```

Then wire the app:

```bash
cp apps/mobile/.env.example apps/mobile/.env
# set EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
# set EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase status`>
```

Sign-up magic links are caught by **Inbucket** at http://localhost:54324 (no real email
sent locally). Try a `@crimson.ua.edu` address — anything off the `campuses` allowlist is
rejected by the `enforce_campus_email` trigger.

## Cloud (staging / prod)

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push          # apply migrations to the linked project
```

Set the app's `.env` from **Project Settings → API** (URL + anon key). For real magic-link
email delivery, configure an SMTP provider and the redirect URLs in Auth settings
(`site_url` / `additional_redirect_urls`).
