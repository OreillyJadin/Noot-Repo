alter table public.users
  add column last_active_at timestamptz;

update public.users u
   set last_active_at = a.last_sign_in_at
  from auth.users a
 where a.id = u.id;

create index users_last_active_at_idx on public.users (last_active_at);

revoke insert (last_active_at), update (last_active_at)
  on table public.users from public, anon, authenticated;

create function public.touch_last_active()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'an authenticated user is required'
      using errcode = 'insufficient_privilege';
  end if;

  update public.users
     set last_active_at = now()
   where id = auth.uid()
     and (last_active_at is null or last_active_at < now() - interval '15 minutes');
end;
$$;

revoke all on function public.touch_last_active() from public, anon;
grant execute on function public.touch_last_active() to authenticated;

drop function if exists public.admin_list_users(text, text, text, int, int);

create function public.admin_list_users(
  p_search text default '',
  p_role   text default null,
  p_status text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id uuid, first_name text, last_name text, email text, status text,
  deleted_at timestamptz, created_at timestamptz, roles text[], total bigint,
  tutor_cancels_30d bigint, no_shows bigint, last_active_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
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
  if p_status is not null and p_status not in ('active', 'suspended', 'banned', 'deleted', 'inactive') then
    raise exception 'unknown status' using errcode = 'check_violation';
  end if;

  return query
  with listed as (
    select u.id, u.first_name, u.last_name, u.email,
           case when u.deleted_at is not null then 'deleted' else u.status::text end as status,
           u.deleted_at, u.created_at, u.last_active_at,
           coalesce((select array_agg(r.role::text order by r.role) from user_roles r where r.user_id = u.id), '{}') as roles
      from users u
  )
  select l.id, l.first_name, l.last_name, l.email, l.status, l.deleted_at, l.created_at, l.roles,
         count(*) over () as total,
         (select count(*)
            from bookings b
           where b.tutor_id = l.id
             and b.cancelled_by_role = 'tutor'
             and b.cancelled_from_status = 'confirmed'
             and b.cancelled_at >= now() - interval '30 days') as tutor_cancels_30d,
         (select count(*)
            from bookings b
           where (b.student_id = l.id and b.no_show_party = 'student')
              or (b.tutor_id = l.id and b.no_show_party = 'tutor')) as no_shows,
         l.last_active_at
    from listed l
   where ((p_status is null and l.status <> 'deleted') or l.status = p_status
          or (p_status = 'inactive'
              and l.deleted_at is null
              and l.status = 'active'
              and coalesce(l.last_active_at, l.created_at) < now() - interval '30 days'))
     and (p_role is null
          or (p_role = 'student' and l.roles <@ array['student'])
          or (p_role <> 'student' and p_role = any (l.roles)))
     and (v_like = '%%'
          or (l.deleted_at is null
              and (lower(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')) like v_like escape '\'
                   or lower(l.email) like v_like escape '\')))
   order by l.created_at desc, l.id
   limit v_limit offset v_offset;
end $$;

revoke execute on function public.admin_list_users(text, text, text, int, int) from public, anon;
grant execute on function public.admin_list_users(text, text, text, int, int) to authenticated;
