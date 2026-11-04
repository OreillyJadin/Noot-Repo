create or replace view public.tutor_public_profiles
  with (security_barrier = true, security_invoker = false)
as
select
  u.id,
  u.first_name,
  u.last_name,
  u.year,
  u.major,
  u.avatar_url,
  tp.bio,
  tp.subjects,
  tp.hourly_rate,
  tp.rating_avg,
  tp.total_sessions,
  tp.verified_grade,
  (tp.grades_verified_at is not null) as grades_verified,
  tp.approval_status
from public.users u
join public.tutor_profiles tp on tp.user_id = u.id
where (select public.is_active_user())
  and not public.is_blocked_between((select auth.uid()), u.id)
  and (
    (tp.approval_status = 'approved' and u.deleted_at is null)
    or u.id = (select auth.uid())
  );

alter view public.tutor_public_profiles owner to postgres;
revoke all on public.tutor_public_profiles from public, anon;
grant select on public.tutor_public_profiles to authenticated, service_role;
