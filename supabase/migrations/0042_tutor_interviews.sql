-- 0042_tutor_interviews.sql — schedule a verification interview with a tutor applicant (ERR-005).
--
-- After a tutor submits their application, a noot team member talks to them before approving.
-- Arranging that was done outside the app. Now the admin's approvals screen offers times
-- from the applicant's OWN weekly availability (tutor_availability, set in onboarding step 5);
-- the admin picks one, and the tutor is notified and sees it on their "in review" banner.
--
-- The interview does not gate approval — approve-tutor is unchanged. This only records when
-- the two agreed to meet.
--
-- ⚠️ SECURITY-REVIEW: no client may write this table. Rows are created and cancelled only by
-- the SECURITY DEFINER functions below, which check the caller is an admin. A tutor reads
-- their own interview; admins read all; nobody else reads any.
create table tutor_interviews (
  id            uuid primary key default gen_random_uuid(),
  tutor_id      uuid not null references users(id) on delete cascade,
  scheduled_at  timestamptz not null,
  -- Where or how to meet (a link or a place). Written by the admin, shown to the tutor.
  details       text not null default '' check (char_length(details) <= 500),
  scheduled_by  uuid references users(id) on delete set null,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- One live interview per tutor; rescheduling cancels the old row and adds a new one.
create unique index tutor_interviews_one_active_idx on tutor_interviews (tutor_id) where cancelled_at is null;

alter table tutor_interviews enable row level security;

create policy tutor_interviews_select on tutor_interviews for select to authenticated
  using (tutor_id = auth.uid() or is_admin());
-- (No insert / update / delete policy — see the functions below.)

-- Column by column: scheduled_by (which admin set it) is not for the tutor to read.
revoke all on tutor_interviews from anon, authenticated;
grant select (id, tutor_id, scheduled_at, details, cancelled_at, created_at) on tutor_interviews to authenticated;

-- "Tue, Oct 6 at 3:00 PM CT" — the campus is in Central time, and a notification is plain
-- text read on a lock screen, so say the zone rather than assume the phone's.
create or replace function interview_time_label(p_at timestamptz)
returns text language sql stable set search_path = public as $$
  select trim(to_char(p_at at time zone 'America/Chicago', 'Dy, Mon FMDD "at" FMHH12:MI AM')) || ' CT';
$$;
revoke all on function interview_time_label(timestamptz) from public, anon, authenticated;

-- Admin: set (or move) a tutor's interview. Returns the new row's id.
create or replace function schedule_tutor_interview(p_tutor uuid, p_at timestamptz, p_details text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_details text := left(trim(coalesce(p_details, '')), 500);
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'only an admin can schedule an interview' using errcode = 'insufficient_privilege';
  end if;
  if p_tutor is null or p_at is null then
    raise exception 'a tutor and a time are required' using errcode = 'check_violation';
  end if;
  -- Two admins scheduling the same tutor at once: one waits for the other, then replaces
  -- their time, rather than failing on the one-live-interview index.
  perform pg_advisory_xact_lock(hashtext('tutor_interview:' || p_tutor::text));
  -- Only someone who has actually applied (a submitted application) and still has an account.
  if not exists (
    select 1 from tutor_profiles tp join users u on u.id = tp.user_id
     where tp.user_id = p_tutor and tp.submitted_at is not null and u.deleted_at is null
  ) then
    raise exception 'this person has not submitted a tutor application' using errcode = 'check_violation';
  end if;
  if p_at <= now() then
    raise exception 'pick a time in the future' using errcode = 'check_violation';
  end if;
  if p_at > now() + interval '60 days' then
    raise exception 'pick a time within the next 60 days' using errcode = 'check_violation';
  end if;

  update tutor_interviews set cancelled_at = now() where tutor_id = p_tutor and cancelled_at is null;
  insert into tutor_interviews (tutor_id, scheduled_at, details, scheduled_by)
  values (p_tutor, p_at, v_details, auth.uid())
  returning id into v_id;

  perform create_notification(
    p_tutor, 'system', 'Your noot interview is scheduled',
    interview_time_label(p_at) || case when v_details <> '' then ' · ' || v_details else '' end,
    jsonb_build_object('interviewId', v_id, 'scheduledAt', p_at)
  );
  return v_id;
end $$;

-- Admin: call off a tutor's interview. True if there was one to cancel.
create or replace function cancel_tutor_interview(p_tutor uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if not is_admin() then
    raise exception 'only an admin can cancel an interview' using errcode = 'insufficient_privilege';
  end if;
  update tutor_interviews set cancelled_at = now()
   where tutor_id = p_tutor and cancelled_at is null
   returning scheduled_at into v_at;
  if v_at is null then return false; end if;
  -- No need to tell them about an interview that had already passed.
  if v_at > now() then
    perform create_notification(
      p_tutor, 'system', 'Your noot interview was cancelled',
      'The interview on ' || interview_time_label(v_at) || ' is off. We’ll be in touch with a new time.',
      jsonb_build_object('scheduledAt', v_at)
    );
  end if;
  return true;
end $$;

-- Once the application is decided (approved or rejected) the interview has served its purpose.
-- Close it quietly, so it can't linger on the tutor's banner or resurface on a re-application.
-- No notification: the decision itself is what the tutor hears about.
create or replace function close_interview_on_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update tutor_interviews set cancelled_at = now() where tutor_id = new.user_id and cancelled_at is null;
  return new;
end $$;
revoke all on function close_interview_on_decision() from public, anon, authenticated;

create trigger close_interview_on_decision_trg
  after update of approval_status on tutor_profiles
  for each row
  when (new.approval_status is distinct from old.approval_status and new.approval_status in ('approved', 'rejected'))
  execute function close_interview_on_decision();

-- Supabase grants new functions to anon/authenticated directly, not only via PUBLIC. Signed-in
-- users may call these; the admin check inside is what decides.
revoke execute on function schedule_tutor_interview(uuid, timestamptz, text) from public, anon;
revoke execute on function cancel_tutor_interview(uuid) from public, anon;
grant execute on function schedule_tutor_interview(uuid, timestamptz, text) to authenticated;
grant execute on function cancel_tutor_interview(uuid) to authenticated;
