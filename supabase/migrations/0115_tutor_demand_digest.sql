create or replace function public.tutor_earned_cents(b public.bookings)
returns bigint
language sql
immutable
set search_path = public
as $$
  with amounts as (
    select
      greatest(
        0::numeric,
        round((b).price * 100)
          + round(coalesce((b).student_fee, 0) * 100)
          - round(coalesce((b).credit_applied, 0) * 100)
      ) as charged,
      round(coalesce((b).tutor_payout_amount, 0) * 100) as payout,
      (b).status as status,
      ((b).status in ('cancelled', 'no_show') or (b).refund_status = 'refunded') as refund_applies,
      (b).refunded_cents as refunded_cents,
      coalesce((b).refund_percent, 0) as refund_percent
  )
  select case
    when amounts.status not in ('completed', 'cancelled', 'no_show') then 0
    when amounts.refund_applies and amounts.refunded_cents is not null and amounts.charged > 0 then
      round(
        amounts.payout
          * (amounts.charged - least(amounts.charged, greatest(0::numeric, amounts.refunded_cents)))
          / amounts.charged
      )::bigint
    else
      round(
        amounts.payout
          * (
            100
              - case
                  when amounts.refund_applies then least(100::numeric, greatest(0::numeric, amounts.refund_percent))
                  else 0::numeric
                end
          )
          / 100
      )::bigint
  end
  from amounts;
$$;
revoke all on function public.tutor_earned_cents(public.bookings) from public, anon, authenticated;

create or replace function public.tutor_demand_for(p_tutor uuid, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with daily_profile_views as (
    select distinct
      ae.user_id,
      (ae.created_at at time zone 'America/Chicago')::date as viewed_on
    from public.analytics_events ae
    join public.users viewer on viewer.id = ae.user_id
    where ae.event = 'tutor_profile_viewed'
      and ae.props ->> 'tutorId' = p_tutor::text
      and ae.user_id <> p_tutor
      and ae.created_at >= p_since
      and viewer.status = 'active'
      and viewer.deleted_at is null
  ), views as (
    select count(*)::integer as profile_views, count(distinct user_id)::integer as unique_viewers
    from daily_profile_views
  ), course_counts as (
    select cr.course_code, count(*)::integer as requests
    from public.course_requests cr
    join public.users requester on requester.id = cr.student_id
    where cr.status = 'open'
      and cr.created_at > now() - interval '30 days'
      and requester.deleted_at is null
      and cr.student_id <> p_tutor
      and exists (
        select 1
        from public.tutor_courses tc
        where tc.tutor_id = p_tutor
          and tc.course_code = cr.course_code
      )
    group by cr.course_code
  ), request_totals as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object('courseCode', course_code, 'requests', requests)
          order by requests desc, course_code
        ),
        '[]'::jsonb
      ) as open_requests,
      coalesce(sum(requests), 0)::integer as open_request_total
    from course_counts
  ), earnings as (
    select coalesce(sum(public.tutor_earned_cents(b)), 0)::bigint as earned_cents
    from public.bookings b
    where b.tutor_id = p_tutor
      and b.scheduled_at >= p_since
      and b.status in ('completed', 'cancelled', 'no_show')
  ), sessions as (
    select count(*)::integer as sessions_completed
    from public.bookings b
    where b.tutor_id = p_tutor
      and b.status = 'completed'
      and b.completed_at >= p_since
  )
  select jsonb_build_object(
    'profileViews', views.profile_views,
    'uniqueViewers', views.unique_viewers,
    'openRequests', request_totals.open_requests,
    'openRequestTotal', request_totals.open_request_total,
    'earnedCents', earnings.earned_cents,
    'sessionsCompleted', sessions.sessions_completed
  )
  from views
  cross join request_totals
  cross join earnings
  cross join sessions;
$$;
revoke all on function public.tutor_demand_for(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.my_tutor_demand()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tutor_profiles where user_id = v_uid) then
    raise exception 'tutor profile required' using errcode = '42501';
  end if;
  return public.tutor_demand_for(v_uid, now() - interval '7 days');
end;
$$;
revoke all on function public.my_tutor_demand() from public, anon;
grant execute on function public.my_tutor_demand() to authenticated;

create table public.tutor_digests_sent (
  tutor_id uuid not null references public.users(id) on delete cascade,
  week_start date not null,
  sent_at timestamptz not null default now(),
  primary key (tutor_id, week_start)
);

alter table public.tutor_digests_sent enable row level security;
revoke all on table public.tutor_digests_sent from public, anon, authenticated;
grant all on table public.tutor_digests_sent to service_role;

create or replace function public.send_tutor_weekly_digest(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tutor record;
  v_demand jsonb;
  v_week_start date;
  v_profile_views integer;
  v_unique_viewers integer;
  v_open_request_total integer;
  v_earned_cents bigint;
  v_sessions_completed integer;
  v_course_lines text;
  v_section text;
  v_body text;
  v_sent integer := 0;
begin
  if p_now is null then
    raise exception 'p_now is required' using errcode = '22004';
  end if;

  v_week_start := date_trunc('week', p_now at time zone 'America/Chicago')::date;

  for v_tutor in
    select tp.user_id
    from public.tutor_profiles tp
    join public.users u on u.id = tp.user_id
    where tp.approval_status = 'approved'
      and u.status = 'active'
      and u.deleted_at is null
  loop
    begin
      v_demand := public.tutor_demand_for(v_tutor.user_id, p_now - interval '7 days');
      v_profile_views := coalesce((v_demand ->> 'profileViews')::integer, 0);
      v_unique_viewers := coalesce((v_demand ->> 'uniqueViewers')::integer, 0);
      v_open_request_total := coalesce((v_demand ->> 'openRequestTotal')::integer, 0);
      v_earned_cents := coalesce((v_demand ->> 'earnedCents')::bigint, 0);
      v_sessions_completed := coalesce((v_demand ->> 'sessionsCompleted')::integer, 0);

      if v_profile_views = 0
        and v_open_request_total = 0
        and v_earned_cents = 0
        and v_sessions_completed = 0
      then
        continue;
      end if;

      insert into public.tutor_digests_sent (tutor_id, week_start, sent_at)
      values (v_tutor.user_id, v_week_start, p_now)
      on conflict do nothing;
      if not found then
        continue;
      end if;

      v_body := '';
      if v_profile_views > 0 then
        v_section := format(
          'Your profile was viewed %s %s by %s %s.',
          v_profile_views,
          case when v_profile_views = 1 then 'time' else 'times' end,
          v_unique_viewers,
          case when v_unique_viewers = 1 then 'student' else 'students' end
        );
        v_body := concat_ws(E'\n', nullif(v_body, ''), v_section);
      end if;

      if v_open_request_total > 0 then
        select string_agg(
          format(
            '%s: %s request%s',
            item.value ->> 'courseCode',
            (item.value ->> 'requests')::integer,
            case when (item.value ->> 'requests')::integer = 1 then '' else 's' end
          ),
          E'\n' order by (item.value ->> 'requests')::integer desc, item.value ->> 'courseCode'
        )
        into v_course_lines
        from jsonb_array_elements(v_demand -> 'openRequests') as item(value);

        v_section := concat('Open course requests:', E'\n', v_course_lines);
        v_body := concat_ws(E'\n', nullif(v_body, ''), v_section);
      end if;

      if v_earned_cents > 0 then
        v_section := format('You earned $%s this week.', to_char(v_earned_cents / 100.0, 'FM999999990.00'));
        v_body := concat_ws(E'\n', nullif(v_body, ''), v_section);
      end if;

      if v_sessions_completed > 0 then
        v_section := format(
          'You completed %s session%s.',
          v_sessions_completed,
          case when v_sessions_completed = 1 then '' else 's' end
        );
        v_body := concat_ws(E'\n', nullif(v_body, ''), v_section);
      end if;

      perform public.create_notification(
        v_tutor.user_id,
        'system',
        'Your week on Noot',
        v_body,
        jsonb_build_object('event', 'tutor_weekly_digest', 'weekStart', v_week_start)
      );
      v_sent := v_sent + 1;
    exception when others then
      raise warning 'Could not send tutor weekly digest for %: %', v_tutor.user_id, sqlerrm;
    end;
  end loop;

  return v_sent;
end;
$$;
revoke all on function public.send_tutor_weekly_digest(timestamptz) from public, anon, authenticated;
grant execute on function public.send_tutor_weekly_digest(timestamptz) to service_role;

do $schedule$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'tutor-weekly-digest',
      '0 14 * * 1',
      $$select public.send_tutor_weekly_digest()$$
    );
  end if;
exception when undefined_function or invalid_schema_name then
  raise notice 'pg_cron is unavailable; tutor weekly digest was not scheduled';
end
$schedule$;
