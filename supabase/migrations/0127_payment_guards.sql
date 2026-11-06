revoke insert (stripe_customer_id), update (stripe_customer_id)
  on public.users from public, anon, authenticated;

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
  tp.approval_status,
  case when s.requests >= 3 then round(100.0 * s.responded / s.requests)::int end as response_rate,
  case when s.requests >= 3 then s.median_response_minutes end as response_median_minutes
from public.users u
join public.tutor_profiles tp on tp.user_id = u.id
left join public.tutor_response_stats s on s.tutor_id = u.id
where ((select public.is_active_user()) or u.id = (select auth.uid()))
  and not public.is_blocked_between((select auth.uid()), u.id)
  and (
    (tp.approval_status = 'approved' and u.deleted_at is null and u.status = 'active')
    or u.id = (select auth.uid())
  );

alter view public.tutor_public_profiles owner to postgres;
comment on view public.tutor_public_profiles is
  'SEC-006: the only fields of an approved tutor that other signed-in users may read. Add a column here only if the app shows it to everyone.';
revoke all on public.tutor_public_profiles from public, anon;
grant select on public.tutor_public_profiles to authenticated, service_role;
