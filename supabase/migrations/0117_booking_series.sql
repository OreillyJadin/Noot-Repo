create table public.booking_series (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  tutor_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  first_scheduled_at timestamptz not null,
  duration_minutes int not null,
  session_type text not null,
  location text,
  price numeric(10,2) not null,
  student_fee numeric(10,2) not null,
  platform_fee numeric(10,2) not null,
  tutor_payout_amount numeric(10,2) not null,
  weeks int not null check (weeks between 2 and 12),
  next_index int not null default 1,
  stripe_setup_intent_id text not null,
  stripe_payment_method_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'stopped', 'completed', 'ended', 'cancelled')),
  end_reason text,
  stopped_by uuid references public.users(id) on delete set null,
  stopped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (next_index between 1 and 12)
);

create index booking_series_student_idx on public.booking_series (student_id);
create index booking_series_tutor_idx on public.booking_series (tutor_id);
create index booking_series_stopped_by_idx on public.booking_series (stopped_by);

alter table public.booking_series enable row level security;
create policy booking_series_select on public.booking_series
  for select to authenticated
  using ((select public.is_active_user()) and (student_id = auth.uid() or tutor_id = auth.uid()));

revoke all on public.booking_series from public, anon, authenticated;
grant select (
  id, student_id, tutor_id, subject, first_scheduled_at, duration_minutes,
  session_type, location, price, student_fee, platform_fee, tutor_payout_amount,
  weeks, next_index, status, end_reason, stopped_by, stopped_at, created_at, updated_at
) on public.booking_series to authenticated;
grant all on public.booking_series to service_role;

create trigger booking_series_updated_at before update on public.booking_series
for each row execute function public.set_updated_at();

alter table public.bookings
  add column series_id uuid references public.booking_series(id) on delete set null,
  add column series_index int check (series_index is null or series_index >= 0);

create index bookings_series_id_idx on public.bookings (series_id);
create unique index bookings_series_id_series_index_key
  on public.bookings (series_id, series_index)
  where series_id is not null;

alter table public.bookings
  drop constraint bookings_stripe_setup_intent_id_key;

create unique index bookings_stripe_setup_intent_id_first_key
  on public.bookings (stripe_setup_intent_id)
  where coalesce(series_index, 0) = 0;

create or replace function public.return_booking_credit(p_booking uuid, p_percent int)
returns int language plpgsql security definer set search_path = public as $$
declare spent int; already int; back int; who uuid;
begin
  if exists (
    select 1 from public.bookings b where b.id = p_booking and b.series_index > 0
  ) then
    select -l.amount_cents, l.user_id into spent, who from public.credit_ledger l
    where l.kind = 'booking_spend' and l.booking_id = p_booking
    limit 1;
  else
    select -l.amount_cents, l.user_id into spent, who from public.credit_ledger l
    where l.kind = 'booking_spend' and (l.booking_id = p_booking
      or l.payment_intent_id in (select b.stripe_payment_intent_id from public.bookings b where b.id = p_booking
        union all select b.stripe_setup_intent_id from public.bookings b where b.id = p_booking))
    limit 1;
  end if;
  if spent is null or who is null then return 0; end if;
  perform public.credit_lock(who);
  select coalesce(sum(l.amount_cents), 0) into already from public.credit_ledger l
  where l.booking_id = p_booking and l.kind = 'booking_return';
  back := round(spent * greatest(0, least(100, p_percent)) / 100.0)::int - already;
  if back <= 0 then return 0; end if;
  insert into public.credit_ledger (user_id, amount_cents, kind, booking_id)
  values (who, back, 'booking_return', p_booking);
  return back;
end;
$$;
revoke all on function public.return_booking_credit(uuid, int) from public, anon, authenticated;
grant execute on function public.return_booking_credit(uuid, int) to service_role;

create function public.sync_booking_series_first_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.series_id is null or new.series_index is distinct from 0
     or old.status is not distinct from new.status then
    return new;
  end if;
  if new.status = 'confirmed' and new.accepted_at is not null then
    update public.booking_series
    set status = 'active', updated_at = now()
    where id = new.series_id and status = 'pending';
  elsif new.status = 'cancelled' then
    update public.booking_series
    set status = 'cancelled', updated_at = now()
    where id = new.series_id and status = 'pending';
  end if;
  return new;
end;
$$;
revoke all on function public.sync_booking_series_first_booking() from public, anon, authenticated;

create trigger bookings_sync_series_first_booking
after update of status on public.bookings
for each row execute function public.sync_booking_series_first_booking();

create function public.stop_booking_series(p_series uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid;
  v_tutor uuid;
  v_status text;
  v_other uuid;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'An active account is required' using errcode = '42501';
  end if;

  select s.student_id, s.tutor_id, s.status
  into v_student, v_tutor, v_status
  from public.booking_series s
  where s.id = p_series
  for update;

  if not found then
    raise exception 'Booking series not found' using errcode = 'P0002';
  end if;
  if auth.uid() <> v_student and auth.uid() <> v_tutor then
    raise exception 'Only a series participant can stop it' using errcode = '42501';
  end if;
  if v_status not in ('pending', 'active') then
    return;
  end if;

  v_other := case when auth.uid() = v_student then v_tutor else v_student end;
  update public.booking_series
  set status = 'stopped', stopped_by = auth.uid(), stopped_at = now(), updated_at = now()
  where id = p_series and status in ('pending', 'active');

  if found then
    perform public.create_notification(
      v_other,
      'booking',
      'Weekly sessions stopped',
      'The weekly sessions have been stopped. Sessions already booked stay on your calendar; cancel them separately if needed.',
      jsonb_build_object('seriesId', p_series)
    );
  end if;
end;
$$;
revoke all on function public.stop_booking_series(uuid) from public, anon, authenticated;
grant execute on function public.stop_booking_series(uuid) to authenticated;

create function public.request_create_series_bookings()
returns void language plpgsql security definer set search_path = '' as $$
declare v_url text; v_key text;
begin
  select max(case when name = 'noot_project_url' then decrypted_secret end),
         max(case when name = 'noot_service_role_key' then decrypted_secret end)
  into v_url, v_key from vault.decrypted_secrets
  where name in ('noot_project_url', 'noot_service_role_key');
  if nullif(v_url, '') is not null and nullif(v_key, '') is not null then
    perform net.http_post(
      url := rtrim(v_url, '/') || '/functions/v1/create-series-bookings',
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key));
  end if;
exception when others then
  raise warning 'Could not request creation of booking series occurrences: %', sqlerrm;
end;
$$;
revoke all on function public.request_create_series_bookings() from public, anon, authenticated;
grant execute on function public.request_create_series_bookings() to service_role;

create function public.booking_series_occurrence_time(p_first timestamptz, p_index int)
returns timestamptz language sql stable set search_path = '' as $$
  select ((p_first at time zone 'America/Chicago') + make_interval(weeks => p_index))
    at time zone 'America/Chicago'
$$;
revoke all on function public.booking_series_occurrence_time(timestamptz, int) from public, anon, authenticated;
grant execute on function public.booking_series_occurrence_time(timestamptz, int) to service_role;

do $schedule$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'create-series-bookings',
      '20 * * * *',
      $$select public.request_create_series_bookings()$$
    );
  end if;
exception when undefined_function or invalid_schema_name then
  raise notice 'pg_cron is unavailable; booking series were not scheduled';
end
$schedule$;
