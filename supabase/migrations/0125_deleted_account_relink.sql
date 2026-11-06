alter table public.users
  add column previous_account_ids uuid[] not null default '{}'::uuid[];

revoke insert (previous_account_ids), update (previous_account_ids)
  on public.users from public, anon, authenticated;

create or replace function public.canonical_email(addr text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when addr is null then null
    when position('@' in lower(trim(addr))) = 0 then lower(trim(addr))
    else split_part(split_part(lower(trim(addr)), '@', 1), '+', 1)
         || '@' || substring(lower(trim(addr)) from position('@' in lower(trim(addr))) + 1)
  end;
$$;
revoke all on function public.canonical_email(text) from public, anon, authenticated;
grant execute on function public.canonical_email(text) to authenticated;

create or replace function public.canonical_email_hash(addr text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(public.canonical_email(addr), 'UTF8')), 'hex');
$$;
revoke all on function public.canonical_email_hash(text) from public, anon, authenticated;

create index users_active_canonical_email_idx
  on public.users (public.canonical_email(email))
  where deleted_at is null;

create table public.deleted_account_emails (
  email_hash text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  date_of_birth date,
  primary key (email_hash, user_id)
);
create index deleted_account_emails_user_id_idx on public.deleted_account_emails (user_id);

alter table public.deleted_account_emails enable row level security;

create policy deleted_account_emails_select_admin
  on public.deleted_account_emails
  for select
  to authenticated
  using ((select public.is_admin()));

create policy active_user_only
  on public.deleted_account_emails
  as restrictive
  for all
  to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

revoke all on table public.deleted_account_emails from public, anon, authenticated;
grant select on table public.deleted_account_emails to authenticated;

create or replace function public.record_deleted_account_email(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_dob date;
begin
  select email, date_of_birth
    into v_email, v_dob
    from public.users
   where id = p_user;

  if not found then
    raise exception 'account does not exist' using errcode = 'no_data_found';
  end if;

  insert into public.deleted_account_emails (email_hash, user_id, date_of_birth)
  values (public.canonical_email_hash(v_email), p_user, v_dob)
  on conflict do nothing;
end;
$$;

revoke all on function public.record_deleted_account_email(uuid) from public, anon, authenticated;
grant execute on function public.record_deleted_account_email(uuid) to service_role;

create or replace function public.sync_blocked_signup_email(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_status public.user_status;
  v_deleted_at timestamptz;
begin
  select email, status, deleted_at
    into v_email, v_status, v_deleted_at
    from public.users
   where id = p_user;

  if not found then
    raise exception 'account does not exist' using errcode = 'no_data_found';
  end if;

  if v_status = 'active' then
    delete from public.blocked_signup_emails where user_id = p_user;
    return;
  end if;

  if v_status not in ('suspended', 'banned') then
    return;
  end if;

  if v_deleted_at is not null then
    insert into public.blocked_signup_emails (email_hash, user_id, status)
    select email_hash, p_user, v_status
      from public.deleted_account_emails
     where user_id = p_user
    on conflict (email_hash) do update
      set user_id = excluded.user_id, status = excluded.status;
  else
    insert into public.blocked_signup_emails (email_hash, user_id, status)
    values (public.canonical_email_hash(v_email), p_user, v_status)
    on conflict (email_hash) do update
      set user_id = excluded.user_id, status = excluded.status;
  end if;
end;
$$;
revoke all on function public.sync_blocked_signup_email(uuid) from public, anon, authenticated;
grant execute on function public.sync_blocked_signup_email(uuid) to service_role;

create or replace function public.block_signup_email(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_status public.user_status;
  v_deleted_at timestamptz;
begin
  select email, status, deleted_at
    into v_email, v_status, v_deleted_at
    from public.users
   where id = p_user;

  if v_status <> 'active' and v_deleted_at is null then
    insert into public.blocked_signup_emails (email_hash, user_id, status)
    values (public.canonical_email_hash(v_email), p_user, v_status)
    on conflict (email_hash) do nothing;
  end if;
end;
$$;
revoke all on function public.block_signup_email(uuid) from public, anon, authenticated;
grant execute on function public.block_signup_email(uuid) to service_role;

create or replace function public.block_banned_reregistration()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if exists (
    select 1
      from public.blocked_signup_emails
     where email_hash in (
       public.signup_email_hash(new.email),
       public.canonical_email_hash(new.email)
     )
  ) then
    raise exception 'This email can''t be used to create a noot account'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.block_banned_reregistration() from public, anon, authenticated;

create or replace function public.check_signup_email(p_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  client text := coalesce(
    auth.uid()::text,
    nullif(trim(headers->>'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown');
  recent int;
  blocked public.blocked_signup_emails%rowtype;
begin
  delete from public.invite_code_checks where checked_at < now() - interval '1 hour';
  select count(*) into recent
    from public.invite_code_checks
   where client_key = client
     and checked_at > now() - interval '10 minutes';
  if recent >= 30 then
    raise exception 'Too many invite code checks. Try again in a few minutes.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.invite_code_checks (client_key) values (client);

  select *
    into blocked
    from public.blocked_signup_emails
   where email_hash in (
     public.signup_email_hash(p_email),
     public.canonical_email_hash(p_email)
   )
   order by created_at desc
   limit 1;
  if not found then
    return true;
  end if;

  if not exists (
    select 1
      from public.content_reports r
     where r.target_kind = 'user'
       and r.target_user_id = blocked.user_id
       and r.auto_flagged
       and r.status = 'open'
  ) then
    begin
      insert into public.content_reports (
        reporter_id, auto_flagged, target_kind, target_user_id, reason, detail
      )
      values (
        null, true, 'user', blocked.user_id, 'other',
        'A ' || blocked.status::text || ' account''s email tried to sign up again.'
      );
    exception when others then
      raise warning 'check_signup_email: could not flag blocked email: %', sqlerrm;
    end;
  end if;
  return false;
end;
$$;
revoke all on function public.check_signup_email(text) from public;
grant execute on function public.check_signup_email(text) to anon, authenticated;

create or replace function public.confirm_date_of_birth(p_dob date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current date;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.is_active_user() then
    raise exception 'Account is inactive' using errcode = 'insufficient_privilege';
  end if;
  if p_dob is null or p_dob > current_date or p_dob < date '1900-01-01' then
    raise exception 'Invalid date of birth' using errcode = '22023';
  end if;

  select date_of_birth into v_current
    from public.users
   where id = v_uid;

  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
  if v_current is not null then
    if v_current <> p_dob then
      raise exception 'Date of birth can''t be changed. Contact support@trynoot.com.'
        using errcode = 'insufficient_privilege';
    end if;
    return public.is_adult(v_uid);
  end if;

  perform set_config('noot.dob_write', 'on', true);
  update public.users set date_of_birth = p_dob where id = v_uid;
  return public.is_adult(v_uid);
end;
$$;
revoke all on function public.confirm_date_of_birth(date) from public, anon, authenticated;
grant execute on function public.confirm_date_of_birth(date) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_dob_text text := new.raw_user_meta_data ->> 'date_of_birth';
  v_dob date;
  v_previous_account_ids uuid[];
  v_minor_dob_mismatch boolean;
begin
  if v_dob_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    begin
      v_dob := v_dob_text::date;
    exception when others then
      v_dob := null;
    end;
  end if;

  if v_dob is not null then
    if v_dob < date '1900-01-01' or v_dob > current_date then
      v_dob := null;
    elsif v_dob > current_date - interval '18 years' then
      raise exception 'You must be 18 or older to use noot.';
    end if;
  end if;

  if exists (
    select 1
      from public.users
     where deleted_at is null
       and public.canonical_email(email) = public.canonical_email(new.email)
       and email <> new.email
  ) then
    raise exception 'An account with this email already exists'
      using errcode = 'unique_violation';
  end if;

  select coalesce(array_agg(user_id order by deleted_at, user_id), '{}'::uuid[]),
         coalesce(bool_or(
           date_of_birth is not null
           and date_of_birth > deleted_at::date - interval '18 years'
           and date_of_birth is distinct from v_dob
         ), false)
    into v_previous_account_ids, v_minor_dob_mismatch
    from public.deleted_account_emails
   where email_hash = public.canonical_email_hash(new.email);

  if v_minor_dob_mismatch then
    raise exception 'Date of birth must match the previous under-18 account.'
      using errcode = 'check_violation';
  end if;

  insert into public.users (id, email, first_name, last_name, date_of_birth, previous_account_ids)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    v_dob,
    v_previous_account_ids
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict do nothing;

  if cardinality(v_previous_account_ids) > 0 and not exists (
    select 1
      from public.content_reports
     where target_kind = 'user'
       and target_user_id = new.id
       and auto_flagged
       and status = 'open'
  ) then
    begin
      insert into public.content_reports (
        reporter_id, auto_flagged, target_kind, target_user_id, reason, detail
      )
      values (
        null, true, 'user', new.id, 'other',
        'Re-signed up after deleting an account.'
      );
    exception when others then
      raise warning 'handle_new_user: could not flag deleted-email signup: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.admin_block_deleted_email(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_at timestamptz;
  v_email_count integer;
begin
  if not public.is_admin() then
    raise exception 'only an admin can block a deleted account email'
      using errcode = 'insufficient_privilege';
  end if;

  select deleted_at
    into v_deleted_at
    from public.users
   where id = p_user;

  if not found or v_deleted_at is null then
    raise exception 'account is not deleted' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.deleted_account_emails where user_id = p_user) then
    raise exception 'no deleted signup email is available to block' using errcode = 'check_violation';
  end if;

  insert into public.blocked_signup_emails (email_hash, user_id, status)
  select email_hash, p_user, 'banned'::public.user_status
    from public.deleted_account_emails
   where user_id = p_user
  on conflict (email_hash) do nothing;
  get diagnostics v_email_count = row_count;

  insert into public.admin_actions (actor_id, action, target_type, target_id, details)
  values (
    auth.uid(),
    'deleted_email.block',
    'user',
    p_user::text,
    jsonb_build_object('email_count', v_email_count)
  );
end;
$$;

revoke all on function public.admin_block_deleted_email(uuid) from public, anon;
grant execute on function public.admin_block_deleted_email(uuid) to authenticated;

create or replace function public.admin_user_history(p_user uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user jsonb;
  v_counts jsonb;
  v_bookings jsonb;
  v_reports jsonb;
  v_admin_actions jsonb;
  v_previous_accounts jsonb;
begin
  if not is_admin() then
    raise exception 'only an admin can view user history' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
           'id', u.id,
           'first_name', u.first_name,
           'last_name', u.last_name,
           'email', u.email,
           'status', case when u.deleted_at is not null then 'deleted' else u.status::text end,
           'created_at', u.created_at,
           'roles', coalesce(
             (select jsonb_agg(r.role::text order by r.role) from user_roles r where r.user_id = u.id),
             '[]'::jsonb
           )
         )
    into v_user
    from users u
   where u.id = p_user;

  select jsonb_build_object(
           'sessions_as_student', (select count(*) from bookings b where b.student_id = p_user),
           'sessions_as_tutor', (select count(*) from bookings b where b.tutor_id = p_user),
           'completed_as_student', (select count(*) from bookings b where b.student_id = p_user and b.status = 'completed'),
           'completed_as_tutor', (select count(*) from bookings b where b.tutor_id = p_user and b.status = 'completed'),
           'student_cancels_full', (
             select count(*) from bookings b
              where b.student_id = p_user
                and b.cancelled_by_role = 'student'
                and b.cancelled_from_status = 'confirmed'
                and b.refund_percent = 100
           ),
           'student_cancels_partial', (
             select count(*) from bookings b
              where b.student_id = p_user
                and b.cancelled_by_role = 'student'
                and b.cancelled_from_status = 'confirmed'
                and b.refund_percent < 100
           ),
           'student_request_cancels', (
             select count(*) from bookings b
              where b.student_id = p_user
                and b.cancelled_by_role = 'student'
                and b.cancelled_from_status = 'pending'
           ),
           'tutor_cancels', (
             select count(*) from bookings b
              where b.tutor_id = p_user
                and b.cancelled_by_role = 'tutor'
                and b.cancelled_from_status = 'confirmed'
           ),
           'tutor_cancels_30d', (
             select count(*) from bookings b
              where b.tutor_id = p_user
                and b.cancelled_by_role = 'tutor'
                and b.cancelled_from_status = 'confirmed'
                and b.cancelled_at >= now() - interval '30 days'
           ),
           'tutor_declines', (
             select count(*) from bookings b
              where b.tutor_id = p_user and b.cancel_reason = 'tutor_declined'
           ),
           'requests_expired', (
             select count(*) from bookings b
              where b.tutor_id = p_user and b.cancel_reason = 'tutor_no_response'
           ),
           'no_shows_as_student', (
             select count(*) from bookings b
              where b.student_id = p_user and b.no_show_party = 'student'
           ),
           'no_shows_as_tutor', (
             select count(*) from bookings b
              where b.tutor_id = p_user and b.no_show_party = 'tutor'
           ),
           'reports_received', (
             select count(*) from content_reports r
              where r.target_user_id = p_user
                 or exists (
                      select 1 from messages m
                       where m.id = r.target_message_id and m.sender_id = p_user
                    )
                 or exists (
                      select 1 from reviews rv
                       where rv.id = r.target_review_id and rv.reviewer_id = p_user
                    )
           ),
           'reports_filed', (select count(*) from content_reports r where r.reporter_id = p_user)
         )
    into v_counts;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', b.id,
               'scheduled_at', b.scheduled_at,
               'subject', b.subject,
               'status', b.status,
               'role', case when b.student_id = p_user then 'student' else 'tutor' end,
               'counterpart_name', coalesce(nullif(trim(concat_ws(' ', counterpart.first_name, counterpart.last_name)), ''), 'Deleted account'),
               'price', b.price,
               'refund_percent', b.refund_percent,
               'cancelled_by_role', b.cancelled_by_role,
               'cancelled_from_status', b.cancelled_from_status,
               'cancel_reason', b.cancel_reason,
               'no_show_party', b.no_show_party
             )
             order by b.scheduled_at desc
           ),
           '[]'::jsonb
         )
    into v_bookings
    from (
      select b.*
        from bookings b
       where b.student_id = p_user or b.tutor_id = p_user
       order by b.scheduled_at desc
       limit 50
    ) b
    left join users counterpart
      on counterpart.id = case when b.student_id = p_user then b.tutor_id else b.student_id end;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', r.id,
               'target_kind', r.target_kind,
               'reason', r.reason,
               'detail', r.detail,
               'status', r.status,
               'created_at', r.created_at
             )
             order by r.created_at desc
           ),
           '[]'::jsonb
         )
    into v_reports
    from (
      select r.*
        from content_reports r
       where r.target_user_id = p_user
          or exists (
               select 1 from messages m
                where m.id = r.target_message_id and m.sender_id = p_user
             )
          or exists (
               select 1 from reviews rv
                where rv.id = r.target_review_id and rv.reviewer_id = p_user
             )
       order by r.created_at desc
       limit 50
    ) r;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'action', a.action,
               'actor_name', coalesce(nullif(trim(concat_ws(' ', actor.first_name, actor.last_name)), ''), 'Deleted account'),
               'details', a.details,
               'created_at', a.created_at
             )
             order by a.created_at desc
           ),
           '[]'::jsonb
         )
    into v_admin_actions
    from (
      select a.*
        from admin_actions a
       where a.target_id = p_user::text
       order by a.created_at desc
       limit 50
    ) a
    left join users actor on actor.id = a.actor_id;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', previous.id,
               'deleted_at', previous.deleted_at,
               'no_shows', (
                 select count(*) from bookings b
                  where (b.student_id = previous.id and b.no_show_party = 'student')
                     or (b.tutor_id = previous.id and b.no_show_party = 'tutor')
               ),
               'tutor_cancels_30d', (
                 select count(*) from bookings b
                  where b.tutor_id = previous.id
                    and b.cancelled_by_role = 'tutor'
                    and b.cancelled_from_status = 'confirmed'
                    and b.cancelled_at >= now() - interval '30 days'
               )
             )
             order by previous.deleted_at desc nulls last, previous.id
           ),
           '[]'::jsonb
         )
    into v_previous_accounts
    from users target_user
    cross join lateral unnest(target_user.previous_account_ids) as previous_ids(id)
    join users previous on previous.id = previous_ids.id
   where target_user.id = p_user;

  return jsonb_build_object(
    'user', v_user,
    'counts', v_counts,
    'bookings', v_bookings,
    'reports', v_reports,
    'admin_actions', v_admin_actions,
    'previous_accounts', v_previous_accounts
  );
end;
$$;

revoke execute on function public.admin_user_history(uuid) from public, anon;
grant execute on function public.admin_user_history(uuid) to authenticated;
