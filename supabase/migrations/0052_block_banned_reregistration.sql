-- 0052_block_banned_reregistration.sql — keep banned and suspended emails out after deletion (ERR-021).
--
-- A deleted account is de-identified so its financial history can remain, but an account that
-- was suspended or banned must not be able to use that deletion to create a fresh account.
-- Keep only a one-way email hash, block it at the Auth insert boundary, and queue one
-- moderation flag when the blocked address tries again.

create or replace function public.signup_email_hash(addr text)
returns text
language sql
immutable
set search_path = public
as $$
  select encode(sha256(convert_to(lower(trim(addr)), 'UTF8')), 'hex');
$$;
revoke all on function public.signup_email_hash(text) from public, anon, authenticated;

create table public.blocked_signup_emails (
  email_hash text primary key,
  user_id uuid references public.users(id) on delete set null,
  status public.user_status not null,
  created_at timestamptz not null default now()
);
alter table public.blocked_signup_emails enable row level security;

create policy blocked_signup_emails_select_admin
  on public.blocked_signup_emails
  for select
  to authenticated
  using ((select public.is_admin()));

create policy active_user_only
  on public.blocked_signup_emails
  as restrictive
  for all
  to authenticated
  using ((select public.is_active_user()))
  with check ((select public.is_active_user()));

revoke all on table public.blocked_signup_emails from public, anon, authenticated;
grant select on table public.blocked_signup_emails to authenticated;

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
    values (public.signup_email_hash(v_email), p_user, v_status)
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
     where email_hash = public.signup_email_hash(new.email)
  ) then
    raise exception 'This email can''t be used to create a noot account'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.block_banned_reregistration() from public, anon, authenticated;

drop trigger if exists block_banned_reregistration on auth.users;
create trigger block_banned_reregistration
  before insert on auth.users
  for each row execute function public.block_banned_reregistration();

create or replace function public.check_signup_email(p_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  client  text := coalesce(
    auth.uid()::text,
    nullif(trim(headers->>'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown');
  recent int;
  blocked public.blocked_signup_emails%rowtype;
begin
  -- check_signup_email and check_invite_code intentionally share one sign-up budget.
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
   where email_hash = public.signup_email_hash(p_email);
  if not found then
    return true;
  end if;

  -- Flag here rather than in the trigger: the trigger's raised exception would roll back
  -- any moderation row it tried to write.
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

-- 0046_admin_user_search.sql — find an account without loading every account (ERR-021).
--
-- Admin → User management read the whole users table in one request and showed it as one
-- long list. That stops working as the user base grows, and it had no way to find a person
-- or look at one kind of account. This is the server side of search + filters + paging.
--
-- It also gives a deleted account its own state. 0026 marks deletion with users.deleted_at
-- and leaves users.status alone, so a deleted account listed as "active". Here its status
-- reads 'deleted'. The name and email of a deleted account are NOT kept: deletion scrubs
-- them on purpose (functions/delete-account), and this does not change that.
--
-- ⚠️ SECURITY-REVIEW: SECURITY INVOKER — it reads users and user_roles under the caller's
-- own RLS, so it can never show more than the caller could already select. The admin check
-- is there so anyone else gets a clear refusal instead of a misleading partial list.
create or replace function admin_list_users(
  p_search text default '',
  p_role   text default null,   -- 'student' | 'tutor' | 'ambassador' | 'admin'
  p_status text default null,   -- 'active' | 'suspended' | 'banned' | 'deleted'
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id uuid, first_name text, last_name text, email text, status text,
  deleted_at timestamptz, created_at timestamptz, roles text[], total bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  -- The search is matched as plain text: %, _ and \ typed by the admin mean themselves.
  v_like text := '%' || replace(replace(replace(lower(trim(coalesce(p_search, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if not is_admin() then
    raise exception 'only an admin can list accounts' using errcode = 'insufficient_privilege';
  end if;
  if p_role is not null and p_role not in ('student', 'tutor', 'ambassador', 'admin') then
    raise exception 'unknown account type' using errcode = 'check_violation';
  end if;
  if p_status is not null and p_status not in ('active', 'suspended', 'banned', 'deleted') then
    raise exception 'unknown status' using errcode = 'check_violation';
  end if;

  return query
  with listed as (
    select u.id, u.first_name, u.last_name, u.email,
           case when u.deleted_at is not null then 'deleted' else u.status::text end as status,
           u.deleted_at, u.created_at,
           coalesce((select array_agg(r.role::text order by r.role) from user_roles r where r.user_id = u.id), '{}') as roles
      from users u
  )
  select l.id, l.first_name, l.last_name, l.email, l.status, l.deleted_at, l.created_at, l.roles,
         count(*) over () as total
    from listed l
   where ((p_status is null and l.status <> 'deleted') or l.status = p_status)
     -- Everyone holds the student role, so "student" means an account that is nothing else.
     and (p_role is null
          or (p_role = 'student' and l.roles <@ array['student'])
          or (p_role <> 'student' and p_role = any (l.roles)))
     and (v_like = '%%'
          -- A deleted account's name and email are placeholders; searching never matches them.
          or (l.deleted_at is null
              and (lower(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')) like v_like escape '\'
                   or lower(l.email) like v_like escape '\')))
   order by l.created_at desc, l.id
   limit v_limit offset v_offset;
end $$;

revoke execute on function admin_list_users(text, text, text, int, int) from public, anon;
grant execute on function admin_list_users(text, text, text, int, int) to authenticated;
