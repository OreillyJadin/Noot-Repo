-- Role membership is private under RLS; return only bookable public-profile ids.
create function public.rebookable_tutor_ids(p_tutor_ids uuid[])
returns table(tutor_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id
  from public.tutor_public_profiles p
  join public.users u on u.id = p.id
  where auth.uid() is not null
    and public.is_active_user()
    and p.id = any(p_tutor_ids)
    and p.id <> auth.uid()
    and p.approval_status = 'approved'
    and u.status = 'active' and u.deleted_at is null
    and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'tutor')
    and not public.is_blocked_between(auth.uid(), p.id);
$$;
revoke all on function public.rebookable_tutor_ids(uuid[]) from public, anon;
grant execute on function public.rebookable_tutor_ids(uuid[]) to authenticated;
