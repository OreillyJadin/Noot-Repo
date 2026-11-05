create table public.tutor_response_stats (
  tutor_id uuid primary key references public.users(id) on delete cascade,
  requests int not null,
  responded int not null,
  median_response_minutes int,
  updated_at timestamptz not null default now()
);

alter table public.tutor_response_stats enable row level security;
revoke all on public.tutor_response_stats from public, anon, authenticated;
grant all on public.tutor_response_stats to service_role;

create function public.refresh_tutor_response_stats(p_tutor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requests int;
  v_responded int;
  v_median_response_minutes int;
begin
  select
    count(*) filter (
      where b.accepted_at is not null or b.cancel_reason = 'tutor_declined'
    )::int,
    (
      count(*) filter (
        where b.accepted_at is not null or b.cancel_reason = 'tutor_declined'
      )
      + count(*) filter (where b.cancel_reason = 'tutor_no_response')
    )::int,
    round(
      percentile_cont(0.5) within group (
        order by extract(epoch from (coalesce(b.accepted_at, b.cancelled_at) - b.created_at)) / 60.0
      ) filter (
        where b.accepted_at is not null or b.cancel_reason = 'tutor_declined'
      )
    )::int
  into v_responded, v_requests, v_median_response_minutes
  from public.bookings b
  where b.tutor_id = p_tutor
    and b.created_at >= now() - interval '90 days'
    and b.accept_by is not null;

  insert into public.tutor_response_stats (tutor_id, requests, responded, median_response_minutes, updated_at)
  values (p_tutor, v_requests, v_responded, v_median_response_minutes, now())
  on conflict (tutor_id) do update
    set requests = excluded.requests,
        responded = excluded.responded,
        median_response_minutes = excluded.median_response_minutes,
        updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.refresh_tutor_response_stats(uuid) from public, anon, authenticated;

create function public.refresh_tutor_response_stats_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_tutor_response_stats(new.tutor_id);
  return new;
exception when others then
  raise warning 'Could not refresh tutor response stats for %: %', new.tutor_id, sqlerrm;
  return new;
end;
$$;
revoke all on function public.refresh_tutor_response_stats_on_booking() from public, anon, authenticated;

create trigger bookings_refresh_tutor_response_stats
  after insert or update of accepted_at, status, cancel_reason on public.bookings
  for each row execute function public.refresh_tutor_response_stats_on_booking();

do $$
declare
  v_tutor record;
begin
  for v_tutor in select distinct tutor_id from public.bookings loop
    perform public.refresh_tutor_response_stats(v_tutor.tutor_id);
  end loop;
end;
$$;

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
where (select public.is_active_user())
  and not public.is_blocked_between((select auth.uid()), u.id)
  and (
    (tp.approval_status = 'approved' and u.deleted_at is null)
    or u.id = (select auth.uid())
  );

alter view public.tutor_public_profiles owner to postgres;
comment on view public.tutor_public_profiles is
  'SEC-006: the only fields of an approved tutor that other signed-in users may read. Add a column here only if the app shows it to everyone.';
revoke all on public.tutor_public_profiles from public, anon;
grant select on public.tutor_public_profiles to authenticated, service_role;
