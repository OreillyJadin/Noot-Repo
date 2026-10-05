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
   where (p_status is null or l.status = p_status)
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
