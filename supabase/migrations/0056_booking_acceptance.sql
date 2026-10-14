-- Tutor acceptance for new booking requests (ERR-039).
alter table public.bookings
  add column accept_by timestamptz,
  add column accepted_at timestamptz,
  add column cancel_reason text
    check (cancel_reason in ('tutor_declined', 'tutor_no_response')),
  add column decline_note text
    check (decline_note is null or char_length(decline_note) <= 300),
  add column accept_reminder_sent_at timestamptz,
  add column hold_released_at timestamptz;

update public.bookings
set accept_by = least(created_at + interval '12 hours', scheduled_at)
where status = 'pending';

create index bookings_pending_accept_by_idx
  on public.bookings (accept_by)
  where status = 'pending';

drop trigger if exists bookings_decline_note_filter on public.bookings;
create trigger bookings_decline_note_filter
  before insert or update of decline_note on public.bookings
  for each row execute function public.reject_blocked_content('decline_note');

create or replace function public.notify_on_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_student text;
begin
  select coalesce(nullif(trim(first_name), ''), 'A student')
    into v_student
  from public.users
  where id = new.student_id;

  perform public.create_notification(
    new.tutor_id,
    'booking',
    'New session request',
    format('%s wants to book %s. Accept or decline in Noot.', v_student, new.subject),
    jsonb_build_object('bookingId', new.id)
  );
  return new;
end;
$$;
revoke all on function public.notify_on_booking() from public, anon, authenticated;

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
    where id = v_booking.id
      and status = 'pending'
      and accept_reminder_sent_at is null;

    if found then
      begin
        perform public.create_notification(
          v_booking.tutor_id,
          'booking',
          'Request expiring soon',
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
        raise warning 'Could not create an acceptance reminder for booking %: %',
          v_booking.id, sqlerrm;
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
    returning b.id, b.student_id, b.tutor_id, b.subject
  loop
    v_expired := v_expired + 1;

    begin
      perform public.return_booking_credit(v_booking.id, 100);
    exception when others then
      raise warning 'Could not return booking credit for expired request %: %',
        v_booking.id, sqlerrm;
    end;

    begin
      perform public.create_notification(
        v_booking.student_id,
        'booking',
        'Session request expired',
        format(
          '%s didn''t respond in time, so your card hold has been released.',
          coalesce(
            (select nullif(trim(first_name), '') from public.users where id = v_booking.tutor_id),
            'Your tutor'
          )
        ),
        jsonb_build_object('bookingId', v_booking.id)
      );
    exception when others then
      raise warning 'Could not notify student for expired request %: %',
        v_booking.id, sqlerrm;
    end;
  end loop;

  begin
    if exists (
      select 1
      from public.bookings b
      where b.status = 'cancelled'
        and (
          b.cancel_reason in ('tutor_declined', 'tutor_no_response')
          or (
            b.cancel_reason is null
            and b.accept_by is not null
            and b.accepted_at is null
            and b.refund_percent = 100
          )
        )
        and b.stripe_payment_intent_id is not null
        and b.hold_released_at is null
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

select cron.schedule('expire-booking-requests', '* * * * *', $$select public.expire_booking_requests()$$);
