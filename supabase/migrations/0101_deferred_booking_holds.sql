alter table public.bookings
  add column stripe_setup_intent_id text unique,
  add column stripe_payment_method_id text,
  add column hold_due_at timestamptz,
  add column hold_placed_at timestamptz,
  add column hold_failed_at timestamptz,
  add column hold_failure_code text;

alter table public.bookings drop constraint bookings_cancel_reason_check;
alter table public.bookings add constraint bookings_cancel_reason_check
  check (cancel_reason in ('tutor_declined', 'tutor_no_response', 'payment_failed'));

update public.bookings set hold_placed_at = created_at
where stripe_payment_intent_id is not null;

create index bookings_deferred_hold_due_idx on public.bookings (hold_due_at)
where status in ('pending', 'confirmed') and stripe_setup_intent_id is not null
  and stripe_payment_intent_id is null;

create function public.guard_booking_hold()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stripe_setup_intent_id is not null and new.stripe_payment_intent_id is null
     and (tg_op = 'INSERT' or new.scheduled_at is distinct from old.scheduled_at) then
    new.hold_due_at := new.scheduled_at - interval '48 hours';
  end if;
  if tg_op = 'UPDATE' then
    if old.status in ('pending', 'confirmed') and new.status = 'cancelled'
       and old.stripe_setup_intent_id is not null and old.stripe_payment_intent_id is not null then
      new.hold_released_at := null;
    end if;
    if old.stripe_payment_intent_id is null and new.stripe_payment_intent_id is not null
       and old.stripe_setup_intent_id is not null
       and (new.status not in ('pending', 'confirmed') or new.scheduled_at <= now() + interval '12 hours') then
      raise exception 'This session can no longer accept a payment. Please book again.';
    end if;
    if new.scheduled_at is distinct from old.scheduled_at and new.stripe_payment_intent_id is not null
       and new.scheduled_at + make_interval(mins => new.duration_minutes) + interval '48 hours'
           > coalesce(new.hold_placed_at, new.created_at) + interval '4 days' then
      raise exception 'The saved payment cannot cover that date. Cancel and book a new session.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_booking_hold() from public, anon, authenticated;
create trigger bookings_guard_hold before insert or update on public.bookings
for each row execute function public.guard_booking_hold();

create or replace function public.return_booking_credit(p_booking uuid, p_percent int)
returns int language plpgsql security definer set search_path = public as $$
declare spent int; already int; back int; who uuid;
begin
  select -l.amount_cents, l.user_id into spent, who from credit_ledger l
  where l.kind = 'booking_spend' and (l.booking_id = p_booking
    or l.payment_intent_id in (select stripe_payment_intent_id from bookings where id = p_booking
      union all select stripe_setup_intent_id from bookings where id = p_booking))
  limit 1;
  if spent is null or who is null then return 0; end if;
  perform credit_lock(who);
  select coalesce(sum(amount_cents), 0) into already from credit_ledger
  where booking_id = p_booking and kind = 'booking_return';
  back := round(spent * greatest(0, least(100, p_percent)) / 100.0)::int - already;
  if back <= 0 then return 0; end if;
  insert into credit_ledger (user_id, amount_cents, kind, booking_id)
  values (who, back, 'booking_return', p_booking);
  return back;
end;
$$;

create function public.fail_booking_hold(p_booking uuid, p_scheduled_at timestamptz, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare b record;
begin
  update public.bookings set hold_failed_at = now(), hold_failure_code = left(p_code, 60)
  where id = p_booking and scheduled_at = p_scheduled_at and status in ('pending', 'confirmed')
    and stripe_payment_intent_id is null and hold_failed_at is null
  returning * into b;
  if b.id is not null then
    perform public.create_notification(b.student_id, 'booking', 'Update your payment method',
      format('We couldn''t confirm your card for %s on %s. Update your payment method to keep the session.',
        b.subject, to_char(b.scheduled_at at time zone 'America/Chicago', 'Mon DD, HH12:MI AM')),
      jsonb_build_object('bookingId', b.id));
  end if;
end;
$$;
revoke all on function public.fail_booking_hold(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.fail_booking_hold(uuid, timestamptz, text) to service_role;

create function public.expire_unfunded_bookings()
returns int language plpgsql security definer set search_path = '' as $$
declare b record; n int := 0;
begin
  for b in
    update public.bookings set status = 'cancelled', cancel_reason = 'payment_failed',
      cancelled_at = now(), cancelled_from_status = status,
      refund_percent = 100, refund_status = 'refunded', hold_released_at = now()
    where status in ('pending', 'confirmed') and stripe_setup_intent_id is not null
      and stripe_payment_intent_id is null and scheduled_at <= now() + interval '12 hours'
    returning *
  loop
    perform public.return_booking_credit(b.id, 100);
    perform public.create_notification(b.student_id, 'booking', 'Session cancelled',
      'Your ' || b.subject || ' session was cancelled because your payment method was not updated. You were not charged and your Noot credit was returned.',
      jsonb_build_object('bookingId', b.id));
    perform public.create_notification(b.tutor_id, 'booking', 'Session cancelled',
      'Your ' || b.subject || ' session was cancelled because the student could not confirm their payment method.',
      jsonb_build_object('bookingId', b.id));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.expire_unfunded_bookings() from public, anon, authenticated;
grant execute on function public.expire_unfunded_bookings() to service_role;

create function public.request_place_booking_holds()
returns void language plpgsql security definer set search_path = '' as $$
declare v_url text; v_key text;
begin
  perform public.expire_unfunded_bookings();
  select max(case when name = 'noot_project_url' then decrypted_secret end),
         max(case when name = 'noot_service_role_key' then decrypted_secret end)
  into v_url, v_key from vault.decrypted_secrets
  where name in ('noot_project_url', 'noot_service_role_key');
  if nullif(v_url, '') is not null and nullif(v_key, '') is not null then
    perform net.http_post(
      url := rtrim(v_url, '/') || '/functions/v1/place-booking-holds',
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key));
  end if;
end;
$$;
revoke all on function public.request_place_booking_holds() from public, anon, authenticated;
grant execute on function public.request_place_booking_holds() to service_role;
select cron.schedule('place-booking-holds', '*/5 * * * *', $$select public.request_place_booking_holds()$$);
