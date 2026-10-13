-- Community Guidelines acceptance recorded at student sign-up.
--
-- This records the agreement so the app can hold existing student accounts until they
-- accept. The existing users_update policy permits a user to update their own row, so no
-- new policy is needed. The users triggers in 0007 and 0010 guard active_role and status
-- respectively; neither touches these columns.
--
-- Deliberately nullable with no backfill: existing accounts must explicitly consent, and a
-- backfill or NOT NULL constraint would create a false record of acceptance.
alter table public.users add column if not exists guidelines_accepted_at timestamptz;
alter table public.users add column if not exists guidelines_version     text;

comment on column public.users.guidelines_accepted_at is
  'When this user accepted the noot Community Guidelines during student onboarding. Null means the user has not yet accepted.';
comment on column public.users.guidelines_version is
  'The Community Guidelines version accepted, e.g. 2026-10-13 — matches GUIDELINES_VERSION in apps/mobile/lib/guidelines.ts.';
