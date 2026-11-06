alter table public.bookings
  add column extends_booking_id uuid references public.bookings(id) on delete restrict;

create index bookings_extends_booking_id_idx
  on public.bookings (extends_booking_id)
  where extends_booking_id is not null;

create unique index bookings_one_live_extension_per_parent_idx
  on public.bookings (extends_booking_id)
  where extends_booking_id is not null and status in ('pending', 'confirmed', 'completed');

create or replace function public.guard_booking_extension_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.bookings%rowtype;
begin
  if tg_op = 'UPDATE' and new.extends_booking_id is distinct from old.extends_booking_id then
    raise exception 'An extension cannot be detached from its parent' using errcode = '23514';
  end if;
  if new.extends_booking_id is null then return new; end if;

  select * into v_parent
  from public.bookings
  where id = new.extends_booking_id
  for update;
  if not found or v_parent.extends_booking_id is not null then
    raise exception 'Invalid extension parent' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if v_parent.status <> 'confirmed'
       or v_parent.dispute_status = 'flagged'
       or v_parent.no_show_claimed_at is not null
       or v_parent.completion_claimed_at is not null
       or new.status <> 'pending'
       or new.duration_minutes not in (30, 60)
       or new.scheduled_at is distinct from v_parent.scheduled_end
       or new.student_id is distinct from v_parent.student_id
       or new.tutor_id is distinct from v_parent.tutor_id
       or new.subject is distinct from v_parent.subject
       or new.session_type is distinct from v_parent.session_type
       or new.location is distinct from v_parent.location
       or new.meeting_link is distinct from v_parent.meeting_link
       or new.daily_room_name is distinct from v_parent.daily_room_name
       or new.video_link_sent_at is distinct from v_parent.video_link_sent_at
       or new.daily_room_deleted_at is distinct from v_parent.daily_room_deleted_at then
      raise exception 'Invalid extension booking' using errcode = '23514';
    end if;
  elsif new.status = 'confirmed'
      and (v_parent.status <> 'confirmed'
        or v_parent.dispute_status = 'flagged'
        or v_parent.no_show_claimed_at is not null
        or v_parent.completion_claimed_at is not null) then
    raise exception 'The parent session is not available for extension acceptance' using errcode = '23514';
  elsif new.status = 'completed' and v_parent.status <> 'completed' then
    raise exception 'The parent session must settle before its extension' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_booking_extension_parent() from public, anon, authenticated;
create trigger guard_booking_extension_parent
  before insert or update of extends_booking_id, status on public.bookings
  for each row execute function public.guard_booking_extension_parent();

drop trigger if exists trg_notify_on_booking on public.bookings;
create trigger trg_notify_on_booking
  after insert on public.bookings
  for each row
  when (new.extends_booking_id is null)
  execute function public.notify_on_booking();

drop trigger if exists trg_notify_on_session_completed on public.bookings;
create trigger trg_notify_on_session_completed
  after update of status on public.bookings
  for each row
  when (new.extends_booking_id is null and new.status = 'completed' and old.status is distinct from new.status)
  execute function public.notify_on_session_completed();

drop trigger if exists fulfill_course_request_after_booking on public.bookings;
create trigger fulfill_course_request_after_booking
  after insert or update of status on public.bookings
  for each row
  when (new.extends_booking_id is null)
  execute function public.fulfill_course_request_after_booking();

create or replace function public.refresh_tutor_response_stats(p_tutor uuid)
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
    and b.extends_booking_id is null
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

drop trigger if exists bookings_refresh_tutor_response_stats on public.bookings;
create trigger bookings_refresh_tutor_response_stats
  after insert or update of accepted_at, status, cancel_reason on public.bookings
  for each row
  when (new.extends_booking_id is null)
  execute function public.refresh_tutor_response_stats_on_booking();

create or replace function public.expire_booking_requests(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_expired int := 0;
  v_url text;
  v_key text;
begin
  if p_now is null then
    raise exception 'p_now is required' using errcode = '22004';
  end if;

  perform pg_advisory_xact_lock(hashtext('expire_booking_requests'));

  for v_booking in
    select b.id, b.student_id, b.tutor_id, b.subject
    from public.bookings b
    where b.status = 'pending'
      and b.accept_by > p_now
      and b.accept_by <= p_now + interval '1 hour'
      and b.accept_by - b.created_at >= interval '2 hours'
      and b.accept_reminder_sent_at is null
    order by b.accept_by
    for update skip locked
  loop
    update public.bookings
    set accept_reminder_sent_at = p_now
    where id = v_booking.id and status = 'pending' and accept_reminder_sent_at is null;

    if found then
      begin
        perform public.create_notification(
          v_booking.tutor_id, 'booking', 'Request expiring soon',
          format(
            'Accept or decline %s''s %s request within the hour or it will be cancelled.',
            coalesce(
              (select nullif(trim(first_name), '') from public.users where id = v_booking.student_id),
              'Your student'
            ),
            v_booking.subject
          ),
          jsonb_build_object('bookingId', v_booking.id)
        );
      exception when others then
        raise warning 'Could not create an acceptance reminder for booking %: %', v_booking.id, sqlerrm;
      end;
    end if;
  end loop;

  for v_booking in
    update public.bookings b
    set status = 'cancelled',
        cancelled_at = p_now,
        refund_percent = 100,
        refund_status = 'refunded',
        stripe_charge_id = null,
        stripe_transfer_id = null,
        cancel_reason = 'tutor_no_response'
    where b.status = 'pending'
      and b.accept_by <= p_now
      and not (
        b.extends_booking_id is not null
        and exists (
          select 1 from public.bookings parent
          where parent.id = b.extends_booking_id and parent.dispute_status = 'flagged'
        )
      )
    returning b.id, b.student_id, b.tutor_id, b.subject
  loop
    v_expired := v_expired + 1;
    begin
      perform public.return_booking_credit(v_booking.id, 100);
    exception when others then
      raise warning 'Could not return booking credit for expired request %: %', v_booking.id, sqlerrm;
    end;
    begin
      perform public.create_notification(
        v_booking.student_id, 'booking', 'Session request expired',
        format(
          '%s didn''t respond in time, so you won''t be charged.',
          coalesce(
            (select nullif(trim(first_name), '') from public.users where id = v_booking.tutor_id),
            'Your tutor'
          )
        ),
        jsonb_build_object('bookingId', v_booking.id)
      );
    exception when others then
      raise warning 'Could not notify student for expired request %: %', v_booking.id, sqlerrm;
    end;
  end loop;

  begin
    if exists (
      select 1 from public.bookings b
      where b.status = 'cancelled'
        and b.stripe_payment_intent_id is not null
        and b.hold_released_at is null
        and (
          b.extends_booking_id is not null
          or b.cancel_reason in ('tutor_declined', 'tutor_no_response')
          or (
            b.cancel_reason is null and b.accept_by is not null
            and b.accepted_at is null and b.refund_percent = 100
          )
        )
    ) then
      select
        max(case when name = 'noot_project_url' then decrypted_secret end),
        max(case when name = 'noot_service_role_key' then decrypted_secret end)
      into v_url, v_key
      from vault.decrypted_secrets
      where name in ('noot_project_url', 'noot_service_role_key');
      if nullif(v_url, '') is not null and nullif(v_key, '') is not null then
        perform net.http_post(
          url := rtrim(v_url, '/') || '/functions/v1/release-booking-holds',
          body := '{}'::jsonb,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
          )
        );
      end if;
    end if;
  exception when others then
    raise warning 'Could not request release of booking holds: %', sqlerrm;
  end;

  return v_expired;
end
$$;
revoke all on function public.expire_booking_requests(timestamptz) from public, anon, authenticated;
grant execute on function public.expire_booking_requests(timestamptz) to service_role;
