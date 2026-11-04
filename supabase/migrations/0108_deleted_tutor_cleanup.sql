do $$
declare
  v_tutor_id uuid;
begin
  for v_tutor_id in
    select u.id from public.users u
    where u.deleted_at is not null
      or (
        exists (select 1 from public.tutor_profiles p
          where p.user_id = u.id and p.approval_status = 'approved')
        and not exists (select 1 from public.user_roles r
          where r.user_id = u.id and r.role = 'tutor')
      )
  loop
    update public.tutor_profiles
      set approval_status = 'pending', submitted_at = null
      where user_id = v_tutor_id;
    delete from public.tutor_courses c where c.tutor_id = v_tutor_id;
    delete from public.tutor_availability a where a.tutor_id = v_tutor_id;
    delete from public.availability_overrides a where a.tutor_id = v_tutor_id;
  end loop;
end;
$$;
