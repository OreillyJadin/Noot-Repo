-- 0060_admin_audit_log.sql — an append-only record of every admin mutation.
--
-- Admins can suspend accounts, decide applications, resolve reports and disputes, and edit
-- roles, profiles and the blocked-term list — and until now none of it left a trail. This
-- migration adds public.admin_actions and wires it into every admin write path:
--
--   • Edge Functions (service role) — admin-set-user-status, approve-tutor, moderate-review
--     and resolve-dispute call logAdminAction() in _shared/audit.ts after the action.
--   • Definer RPCs — schedule_tutor_interview / cancel_tutor_interview (re-created here from
--     their 0051 definitions, unchanged except for one insert each) log in the same
--     transaction, so a notification can never go out without the audit row.
--   • Direct client writes allowed by is_admin() RLS — content_reports UPDATE, user_roles
--     DELETE, tutor_profiles / ambassador_profiles UPDATE and blocked_terms INSERT/UPDATE/
--     DELETE are caught by log_admin_write() triggers. The trigger only logs when the writer
--     is a signed-in admin (auth.uid() is an admin), so service-role writes — which the Edge
--     Functions already log themselves — are never double-logged, and a user editing their
--     OWN profile or role is not an admin action.
--
-- The table is append-only: SELECT goes to admins only, nobody gets INSERT/UPDATE/DELETE
-- (even service_role loses UPDATE/DELETE/TRUNCATE — Edge Functions may append but not
-- rewrite history), so only the postgres role in the SQL editor/Studio can remove rows.
-- details holds identifiers and column names, never values: transcript paths, bios and
-- message text stay out of the log.

create table if not exists public.admin_actions (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid not null references public.users(id),
  action     text not null,
  target_type text,
  target_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_actor_idx on public.admin_actions (actor_id, created_at desc);
create index if not exists admin_actions_target_idx on public.admin_actions (target_type, target_id);

alter table public.admin_actions enable row level security;

-- Admins (active ones, like every other policy since 0051) can read the log; nobody else can.
drop policy if exists admin_actions_admin_read on public.admin_actions;
create policy admin_actions_admin_read on public.admin_actions
  for select to authenticated
  using ((select public.is_admin()) and (select public.is_active_user()));

-- Append-only. No insert/update/delete policies — the only writers are the service-role
-- Edge Functions (RLS doesn't apply to service role) and the SECURITY DEFINER trigger
-- functions (which insert as the table owner). SELECT is the only grant; even service_role
-- loses UPDATE/DELETE/TRUNCATE, so a compromised or buggy function can add rows but can
-- never edit or erase the trail. Only the postgres role (SQL editor / Studio) can delete.
revoke all on public.admin_actions from public, anon, authenticated;
grant select on public.admin_actions to authenticated;
revoke update, delete, truncate on public.admin_actions from service_role;

-- ---------- trigger function: direct client writes under is_admin() RLS ----------
create or replace function public.log_admin_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_action text;
  v_target_type text;
  v_target_id text;
  v_details jsonb := '{}'::jsonb;
  v_changed text[];
begin
  -- A service-role write (Edge Function) has no caller uid and is logged by the function
  -- itself; anything the writer isn't an admin for isn't an admin action.
  if v_actor is null or not public.is_admin() then
    return null;
  end if;

  if tg_table_name = 'content_reports' and tg_op = 'UPDATE' then
    -- Admin-only table: every UPDATE is a resolution (status open → actioned/dismissed).
    v_action := 'report.' || new.status;
    v_target_type := 'content_report';
    v_target_id := new.id::text;
    v_details := jsonb_strip_nulls(jsonb_build_object(
      'old_status', old.status,
      'new_status', new.status,
      'target_kind', new.target_kind,
      'subject_user_id', new.target_user_id,
      'target_message_id', new.target_message_id,
      'target_review_id', new.target_review_id
    ));

  elsif tg_table_name = 'user_roles' and tg_op = 'DELETE' then
    if old.user_id = v_actor then return null; end if; -- removing your own role isn't an admin action
    v_action := 'user_role.remove';
    v_target_type := 'user';
    v_target_id := old.user_id::text;
    v_details := jsonb_build_object('role', old.role);

  elsif tg_table_name in ('tutor_profiles', 'ambassador_profiles') and tg_op = 'UPDATE' then
    if old.user_id = v_actor then return null; end if; -- an admin editing their own profile isn't an admin action
    -- Column NAMES only — the log records that the bio changed, never what it says.
    v_changed := array(
      select key from jsonb_each(to_jsonb(new)) as e(key, value)
      where key <> 'updated_at' and to_jsonb(old) -> key is distinct from e.value
    );
    if cardinality(v_changed) = 0 then return null; end if;
    if tg_table_name = 'tutor_profiles' then
      v_action := 'tutor_profile.update';
    else
      v_action := 'ambassador_profile.update';
    end if;
    v_target_type := 'user';
    v_target_id := new.user_id::text;
    v_details := jsonb_build_object('changed', to_jsonb(v_changed));

  elsif tg_table_name = 'blocked_terms' then
    if tg_op = 'INSERT' then
      v_action := 'blocked_term.add';
      v_target_id := new.term;
      v_details := jsonb_build_object('category', new.category);
    elsif tg_op = 'UPDATE' then
      v_action := 'blocked_term.update';
      v_target_id := new.term;
      v_details := jsonb_build_object('category', new.category);
      if old.term is distinct from new.term then
        v_details := v_details || jsonb_build_object('old_term', old.term);
      end if;
    else -- DELETE
      v_action := 'blocked_term.remove';
      v_target_id := old.term;
      v_details := jsonb_build_object('category', old.category);
    end if;
    v_target_type := 'blocked_term';

  else
    return null;
  end if;

  insert into public.admin_actions (actor_id, action, target_type, target_id, details)
  values (v_actor, v_action, v_target_type, v_target_id, v_details);
  return null;
end;
$$;
-- Trigger function: never meant to be called over the API (0050 pattern).
revoke execute on function public.log_admin_write() from public, anon, authenticated;

drop trigger if exists admin_audit_content_reports on public.content_reports;
create trigger admin_audit_content_reports after update on public.content_reports
  for each row execute function public.log_admin_write();
drop trigger if exists admin_audit_user_roles on public.user_roles;
create trigger admin_audit_user_roles after delete on public.user_roles
  for each row execute function public.log_admin_write();
drop trigger if exists admin_audit_tutor_profiles on public.tutor_profiles;
create trigger admin_audit_tutor_profiles after update on public.tutor_profiles
  for each row execute function public.log_admin_write();
drop trigger if exists admin_audit_ambassador_profiles on public.ambassador_profiles;
create trigger admin_audit_ambassador_profiles after update on public.ambassador_profiles
  for each row execute function public.log_admin_write();
drop trigger if exists admin_audit_blocked_terms on public.blocked_terms;
create trigger admin_audit_blocked_terms after insert or update or delete on public.blocked_terms
  for each row execute function public.log_admin_write();

-- ---------- definer RPCs (0051 definitions + one audit insert each) ----------
create or replace function public.schedule_tutor_interview(p_tutor uuid, p_at timestamptz, p_details text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_details text := left(trim(coalesce(p_details, '')), 500);
  v_id uuid;
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
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

  insert into public.admin_actions (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'interview.schedule', 'user', p_tutor::text,
          jsonb_build_object('interview_id', v_id, 'scheduled_at', p_at));

  perform create_notification(
    p_tutor, 'system', 'Your noot interview is scheduled',
    interview_time_label(p_at) || case when v_details <> '' then ' · ' || v_details else '' end,
    jsonb_build_object('interviewId', v_id, 'scheduledAt', p_at)
  );
  return v_id;
end $$;
revoke execute on function public.schedule_tutor_interview(uuid, timestamptz, text) from public, anon;
grant execute on function public.schedule_tutor_interview(uuid, timestamptz, text) to authenticated;

create or replace function public.cancel_tutor_interview(p_tutor uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if not is_admin() then
    raise exception 'only an admin can cancel an interview' using errcode = 'insufficient_privilege';
  end if;
  update tutor_interviews set cancelled_at = now()
   where tutor_id = p_tutor and cancelled_at is null
   returning scheduled_at into v_at;
  if v_at is null then return false; end if;
  insert into public.admin_actions (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'interview.cancel', 'user', p_tutor::text,
          jsonb_build_object('scheduled_at', v_at));
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
revoke execute on function public.cancel_tutor_interview(uuid) from public, anon;
grant execute on function public.cancel_tutor_interview(uuid) to authenticated;
