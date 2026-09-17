-- Terms acceptance recorded at sign-up (APP_REVIEW_TICKETS.md T9, Guideline 1.2).
--
-- The reply to App Review states "Everyone accepts Terms of Use at sign-up with zero
-- tolerance for objectionable content and abusive behavior." This stores the acceptance so
-- the claim is provable per user. (The published document is still outstanding — see
-- APP_REVIEW_TICKETS.md T23 and the draft in legal/TERMS_OF_USE.md.)
alter table public.users add column if not exists terms_accepted_at timestamptz;
alter table public.users add column if not exists terms_version     text;

comment on column public.users.terms_accepted_at is
  'When this user accepted the Terms of Use during onboarding (Guideline 1.2). Null for accounts created before 0030.';
comment on column public.users.terms_version is
  'The Terms version accepted, e.g. 2026-09-17 — matches TERMS_VERSION in apps/mobile/lib/legal.ts and the effective date of legal/TERMS_OF_USE.md.';

-- Recording acceptance is a write to the user's OWN row, which the existing users_update
-- policy already permits, so no new policy is needed. It is deliberately NOT a trigger or
-- a NOT NULL constraint: back-filling existing accounts would be a false record of consent.
