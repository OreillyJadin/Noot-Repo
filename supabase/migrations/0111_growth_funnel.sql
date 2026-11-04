create or replace function public.guard_analytics_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.event not in ('onboarding_completed', 'search_performed', 'search_empty',
      'tutor_profile_viewed', 'booking_started', 'invite_shared', 'role_switch') then
    raise exception 'Unknown analytics event' using errcode = '23514';
  end if;
  if jsonb_typeof(new.props) <> 'object' or octet_length(new.props::text) > 2048 then
    raise exception 'Analytics props must be an object of at most 2048 bytes' using errcode = '23514';
  end if;
  if auth.role() = 'authenticated' then
    if new.user_id is distinct from auth.uid() or not public.is_active_user() then
      raise exception 'Active event owner required' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 111));
    new.created_at := clock_timestamp();
    if (select count(*) from public.analytics_events
        where user_id = new.user_id and created_at > new.created_at - interval '1 hour') >= 300 then
      raise exception 'Analytics rate limit reached' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_analytics_event() from public, anon, authenticated;
create trigger guard_analytics_event before insert on public.analytics_events
for each row execute function public.guard_analytics_event();

-- Historical completion times were not stored; updated_at is the best available backfill.
alter table public.bookings add column completed_at timestamptz;
alter table public.bookings disable trigger bookings_updated_at;
update public.bookings set completed_at = updated_at where status = 'completed';
alter table public.bookings enable trigger bookings_updated_at;
create or replace function public.stamp_booking_completion()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_booking_completion() from public, anon, authenticated;
create trigger stamp_booking_completion before insert or update on public.bookings
for each row execute function public.stamp_booking_completion();
create index bookings_growth_completed_idx on public.bookings (completed_at, student_id, tutor_id)
where status = 'completed';
create index analytics_events_created_idx on public.analytics_events (created_at);

create or replace function public.admin_growth_funnel(p_since timestamptz, p_until timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_since timestamptz := coalesce(p_since, '-infinity');
  v_until timestamptz := coalesce(p_until, 'infinity');
  result jsonb;
begin
  if not public.is_admin() or not public.is_active_user() then
    raise exception 'Active admin with verified MFA required' using errcode = '42501';
  end if;
  if v_since >= v_until then
    raise exception 'Invalid growth range' using errcode = '22023';
  end if;
  with events as (
    select * from public.analytics_events where created_at >= v_since and created_at < v_until
  ), requested as (
    select * from public.bookings where created_at >= v_since and created_at < v_until
  ), accepted as (
    select * from public.bookings
    where (accepted_at is not null or status in ('confirmed', 'completed', 'no_show') or cancelled_from_status = 'confirmed')
      and coalesce(accepted_at, created_at) >= v_since and coalesce(accepted_at, created_at) < v_until
  ), completed as (
    select * from public.bookings where status = 'completed'
  ), window_completed as (
    select * from completed where completed_at >= v_since and completed_at < v_until
  ), reviewed as (
    select distinct b.id, b.student_id from public.reviews r join public.bookings b on b.id = r.booking_id
    where r.created_at >= v_since and r.created_at < v_until
  ), repeat_all as (
    select distinct student_id from completed group by student_id, tutor_id having count(*) >= 2
  ), repeat_window as (
    select distinct student_id from window_completed group by student_id, tutor_id having count(*) >= 2
  ), empty_demand as (
    select coalesce(nullif(trim(props->>'courseCode'), ''), nullif(trim(props->>'query'), ''), '(browse / filters)') as term,
      count(*) as searches, count(distinct user_id) as users
    from events where event = 'search_empty' group by 1 order by searches desc, term limit 10
  )
  select jsonb_build_object(
    'signups', (select count(*) from public.users where created_at >= v_since and created_at < v_until),
    'onboarded', (select count(distinct user_id) from events where event = 'onboarding_completed'),
    'searchers', (select count(distinct user_id) from events where event = 'search_performed'),
    'searches', (select count(*) from events where event = 'search_performed'),
    'emptySearches', (select count(*) from events where event = 'search_empty'),
    'emptyDemand', (select coalesce(jsonb_agg(to_jsonb(d) order by searches desc, term), '[]') from empty_demand d),
    'profileViewers', (select count(distinct user_id) from events where event = 'tutor_profile_viewed'),
    'bookingStarters', (select count(distinct user_id) from events where event = 'booking_started'),
    'bookingsRequested', (select count(*) from requested),
    'requesters', (select count(distinct student_id) from requested),
    'accepted', (select count(*) from accepted),
    'acceptedStudents', (select count(distinct student_id) from accepted),
    'declinedExpired', (select count(*) from public.bookings where status = 'cancelled'
      and cancel_reason in ('tutor_declined', 'tutor_no_response')
      and coalesce(cancelled_at, updated_at) >= v_since and coalesce(cancelled_at, updated_at) < v_until),
    'cancelled', (select count(*) from public.bookings where status = 'cancelled'
      and coalesce(cancel_reason, '') not in ('tutor_declined', 'tutor_no_response')
      and coalesce(cancelled_at, updated_at) >= v_since and coalesce(cancelled_at, updated_at) < v_until),
    'completed', (select count(*) from window_completed),
    'completedStudents', (select count(distinct student_id) from window_completed),
    'reviewed', (select count(*) from reviewed),
    'reviewedStudents', (select count(distinct student_id) from reviewed),
    'invitesShared', (select count(*) from events where event = 'invite_shared'),
    'inviteSharers', (select count(distinct user_id) from events where event = 'invite_shared'),
    'rebook', jsonb_build_object(
      'students', (select count(*) from repeat_window),
      'completers', (select count(distinct student_id) from window_completed),
      'rate', coalesce((select count(*)::numeric from repeat_window) / nullif((select count(distinct student_id) from window_completed), 0), 0)),
    'rebookAllTime', jsonb_build_object(
      'students', (select count(*) from repeat_all),
      'completers', (select count(distinct student_id) from completed),
      'rate', coalesce((select count(*)::numeric from repeat_all) / nullif((select count(distinct student_id) from completed), 0), 0))
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_growth_funnel(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_growth_funnel(timestamptz, timestamptz) to authenticated;
