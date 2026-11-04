create function public.my_blocked_users()
returns table (id uuid, first_name text, last_initial text, avatar_url text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  return query
    select u.id, u.first_name, left(u.last_name, 1), u.avatar_url
    from public.user_blocks b
    join public.users u on u.id = b.blocked_id
    where b.blocker_id = (select auth.uid())
    order by b.created_at desc, u.id;
end;
$$;

revoke all on function public.my_blocked_users() from public, anon;
grant execute on function public.my_blocked_users() to authenticated;
