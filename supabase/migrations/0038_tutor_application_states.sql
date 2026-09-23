-- 0038_tutor_application_states.sql — tutor application lifecycle + verification (tracker T4/T6).
--
-- Two things are tracked separately from here on:
--   • WHERE THE APPLICATION IS: draft (row exists, submitted_at null) → in review
--     (submitted_at set, approval_status 'pending') → approved / rejected. Before this,
--     "pending" meant anything from "opened step 2" to "submitted", and the admin queue
--     filled with half-finished applications.
--   • WHETHER THE GRADES ARE VERIFIED: grades_verified_at, set only by an admin via the
--     approve-tutor Edge Function. Drives the Verified badge and the platform fee
--     (17.5% verified, 32.5% unverified — supabase/functions/_shared/fees.ts).
--
-- ⚠️ SECURITY: also closes a hole. The 0009 guard only fired on UPDATE, and the 0002 insert
-- policy only checks user_id — so any signed-in user could INSERT their own tutor_profiles
-- row with approval_status = 'approved' and appear in search, bookable, with no admin
-- involved. They could also set their own stripe_payouts_enabled, rating_avg, etc. The guard
-- now covers INSERT and UPDATE and every field only the server may set.

-- ---------- columns ----------
alter table public.tutor_profiles add column if not exists submitted_at          timestamptz;
alter table public.tutor_profiles add column if not exists transcript_skipped    boolean not null default false;
alter table public.tutor_profiles add column if not exists grades_verified_at    timestamptz;
alter table public.tutor_profiles add column if not exists grades_verified_by    uuid references public.users(id);
alter table public.tutor_profiles add column if not exists agreement_signed_at   timestamptz;
alter table public.tutor_profiles add column if not exists agreement_signed_name text;
alter table public.tutor_profiles add column if not exists agreement_version     text;

comment on column public.tutor_profiles.submitted_at is
  'When the tutor submitted the application for review. Null = draft. Set only by submit_tutor_application().';
comment on column public.tutor_profiles.transcript_skipped is
  'The tutor chose "sign up as unverified" on step 6 instead of uploading a transcript.';
comment on column public.tutor_profiles.grades_verified_at is
  'An admin checked the transcript. Drives the Verified badge and the lower platform fee.';

-- ---------- backfill (no grandfathering: nobody starts verified) ----------
-- Every existing pending/approved/rejected row predates the draft state, so treat it as
-- submitted — pending rows stay in the admin queue, approved tutors stay live (unverified).
update public.tutor_profiles
   set submitted_at = coalesce(reviewed_at, created_at)
 where submitted_at is null;

-- ---------- guard: server-only fields ----------
-- Direct client writes run as the `authenticated` (or `anon`) role. The service role
-- (Edge Functions) and SECURITY DEFINER functions below run as other roles, so checking
-- current_user lets those through while blocking every direct client write. (The old
-- guard checked the JWT role, which a SECURITY DEFINER function doesn't change.)
create or replace function protect_tutor_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    -- A client-created row always starts as a fresh draft, whatever it asked for.
    NEW.approval_status           := 'pending';
    NEW.reviewed_by               := null;
    NEW.reviewed_at               := null;
    NEW.submitted_at              := null;
    NEW.grades_verified_at        := null;
    NEW.grades_verified_by        := null;
    NEW.agreement_signed_at       := null;
    NEW.agreement_signed_name     := null;
    NEW.agreement_version         := null;
    NEW.stripe_connect_account_id := null;
    NEW.stripe_charges_enabled    := false;
    NEW.stripe_payouts_enabled    := false;
    NEW.stripe_onboarded_at       := null;
    NEW.rating_avg                := null;
    NEW.total_sessions            := 0;
    NEW.verified_grade            := null;
    return NEW;
  end if;

  if NEW.approval_status           is distinct from OLD.approval_status
     or NEW.reviewed_by               is distinct from OLD.reviewed_by
     or NEW.reviewed_at               is distinct from OLD.reviewed_at
     or NEW.submitted_at              is distinct from OLD.submitted_at
     or NEW.grades_verified_at        is distinct from OLD.grades_verified_at
     or NEW.grades_verified_by        is distinct from OLD.grades_verified_by
     or NEW.agreement_signed_at       is distinct from OLD.agreement_signed_at
     or NEW.agreement_signed_name     is distinct from OLD.agreement_signed_name
     or NEW.agreement_version         is distinct from OLD.agreement_version
     or NEW.stripe_connect_account_id is distinct from OLD.stripe_connect_account_id
     or NEW.stripe_charges_enabled    is distinct from OLD.stripe_charges_enabled
     or NEW.stripe_payouts_enabled    is distinct from OLD.stripe_payouts_enabled
     or NEW.stripe_onboarded_at       is distinct from OLD.stripe_onboarded_at
     or NEW.rating_avg                is distinct from OLD.rating_avg
     or NEW.total_sessions            is distinct from OLD.total_sessions
     or NEW.verified_grade            is distinct from OLD.verified_grade then
    raise exception 'these tutor profile fields can only be set by the server'
      using errcode = 'insufficient_privilege';
  end if;
  return NEW;
end $$;

drop trigger if exists protect_tutor_approval_trg on tutor_profiles;
create trigger protect_tutor_approval_trg
  before insert or update on tutor_profiles
  for each row
  execute function protect_tutor_approval();

-- ---------- step 7: sign the agreement (server-stamped time) ----------
create or replace function sign_tutor_agreement(signed_name text, version text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  stamped timestamptz := now();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(signed_name), '') = '' or coalesce(trim(version), '') = '' then
    raise exception 'type your full name to sign' using errcode = 'check_violation';
  end if;
  insert into tutor_profiles (user_id) values (uid) on conflict (user_id) do nothing;
  update tutor_profiles
     set agreement_signed_at = stamped,
         agreement_signed_name = trim(signed_name),
         agreement_version = trim(version),
         updated_at = now()
   where user_id = uid;
  return stamped;
end $$;

grant execute on function sign_tutor_agreement(text, text) to authenticated;

-- ---------- what's still missing before an application can be submitted ----------
-- The server's copy of the step gating (the app mirrors it in @noot/core for the UI).
-- Returns the missing requirement keys; empty = ready to submit.
create or replace function tutor_application_missing(uid uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    case when coalesce(trim(u.first_name), '') = '' or coalesce(trim(u.last_name), '') = '' then 'name' end,
    case when u.avatar_url is null then 'photo' end,
    case when not exists (select 1 from tutor_courses c where c.tutor_id = uid) then 'courses' end,
    case when not exists (select 1 from tutor_courses c where c.tutor_id = uid)
           or exists (select 1 from tutor_courses c where c.tutor_id = uid and c.hourly_rate < 10) then 'rates' end,
    case when not exists (select 1 from tutor_availability a where a.tutor_id = uid) then 'availability' end,
    case when tp.transcript_url is null and not coalesce(tp.transcript_skipped, false) then 'transcript' end,
    case when tp.agreement_signed_at is null then 'agreement' end,
    case when not coalesce(tp.stripe_payouts_enabled, false) then 'payouts' end
  ], null)
  from users u
  left join tutor_profiles tp on tp.user_id = u.id
  where u.id = uid;
$$;

revoke all on function tutor_application_missing(uuid) from public;

-- ---------- step 9: submit for review ----------
create or replace function submit_tutor_application()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  missing text[];
  status approval_status;
  stamped timestamptz := now();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  select approval_status into status from tutor_profiles where user_id = uid;
  if status = 'approved' then
    raise exception 'already approved' using errcode = 'check_violation';
  end if;
  missing := tutor_application_missing(uid);
  if missing is null or cardinality(missing) > 0 then
    raise exception 'application incomplete: %', array_to_string(coalesce(missing, array['profile']), ', ')
      using errcode = 'check_violation';
  end if;
  -- A rejected applicant who fixes things and resubmits goes back into the queue.
  update tutor_profiles
     set submitted_at = stamped,
         approval_status = 'pending',
         reviewed_by = null,
         reviewed_at = null,
         updated_at = now()
   where user_id = uid;
  return stamped;
end $$;

grant execute on function submit_tutor_application() to authenticated;
