-- 0054_session_reminders.sql — configurable reminders for upcoming sessions (ERR-037).
--
-- Reminders are per participant, so students and tutors can choose independently. The
-- scheduled job records each due reminder before creating a notification; the notification
-- pipeline then handles in-app delivery and push (0014, 0045).

create extension if not exists pg_cron with schema pg_catalog;

create table public.reminder_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  minutes_before int[] not null default '{60}',
  morning_of boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint reminder_preferences_minutes_allowed
    check (minutes_before <@ array[5, 10, 15, 30, 60, 120, 1440]),
  constraint reminder_preferences_minutes_count
    check (cardinality(minutes_before) <= 4)
);

alter table public.reminder_preferences enable row level security;
create policy reminder_preferences_select_own on public.reminder_preferences
  for select to authenticated using (user_id = auth.uid());
create policy reminder_preferences_insert_own on public.reminder_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy reminder_preferences_update_own on public.reminder_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy active_user_only on public.reminder_preferences as restrictive for all to authenticated
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
revoke all on table public.reminder_preferences from public, anon, authenticated;
grant select, insert, update on table public.reminder_preferences to authenticated;

create table public.session_reminders_sent (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  scheduled_at timestamptz not null,
  kind text not null check (kind in ('before', 'morning')),
  minutes_before int not null,
  sent_at timestamptz not null default now(),
  primary key (booking_id, user_id, scheduled_at, kind, minutes_before)
);

alter table public.session_reminders_sent enable row level security;
revoke all on table public.session_reminders_sent from public, anon, authenticated;

create index bookings_confirmed_scheduled_at_idx
  on public.bookings (scheduled_at) where status = 'confirmed';

create or replace function public.morning_reminder_at(p_scheduled timestamptz)
returns timestamptz language sql stable set search_path = public as $$
  select ((p_scheduled at time zone 'America/Chicago')::date + time '07:00')
    at time zone 'America/Chicago';
$$;
revoke all on function public.morning_reminder_at(timestamptz) from public, anon, authenticated;
grant execute on function public.morning_reminder_at(timestamptz) to service_role;

create or replace function public.send_session_reminders(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_party record;
  v_due int[];
  v_offset int;
  v_remaining int;
  v_label_minutes int;
  v_hours int;
  v_label text;
  v_morning_at timestamptz;
  v_sent int := 0;
begin
  if p_now is null then
    raise exception 'p_now is required' using errcode = '22004';
  end if;
  perform pg_advisory_xact_lock(hashtext('send_session_reminders'));

  for v_booking in
    select b.id, b.student_id, b.tutor_id, b.subject, b.scheduled_at
    from public.bookings b
    where b.status = 'confirmed'
      and b.scheduled_at > p_now
      and b.scheduled_at <= p_now + interval '1441 minutes'
    order by b.scheduled_at
  loop
    for v_party in
      select party.user_id,
             coalesce(nullif(btrim(other_user.first_name), ''), party.fallback_name) as other_name,
             coalesce(pref.minutes_before, array[60]::int[]) as minutes_before,
             coalesce(pref.morning_of, true) as morning_of
      from (values
        (v_booking.student_id, v_booking.tutor_id, 'your tutor'::text),
        (v_booking.tutor_id, v_booking.student_id, 'your student'::text)
      ) as party(user_id, other_id, fallback_name)
      left join public.users other_user on other_user.id = party.other_id
      left join public.reminder_preferences pref on pref.user_id = party.user_id
    loop
      select array_agg(due.offset_minutes order by due.offset_minutes)
        into v_due
      from (
        select distinct unnest(v_party.minutes_before) as offset_minutes
      ) due
      where p_now >= v_booking.scheduled_at - due.offset_minutes * interval '1 minute'
        and not exists (
          select 1
          from public.session_reminders_sent sent
          where sent.booking_id = v_booking.id
            and sent.user_id = v_party.user_id
            and sent.scheduled_at = v_booking.scheduled_at
            and sent.kind = 'before'
            and sent.minutes_before = due.offset_minutes
        );

      if coalesce(cardinality(v_due), 0) > 0 then
        insert into public.session_reminders_sent
          (booking_id, user_id, scheduled_at, kind, minutes_before, sent_at)
        select v_booking.id, v_party.user_id, v_booking.scheduled_at, 'before', offsets.minutes_before, p_now
        from unnest(v_due) as offsets(minutes_before)
        on conflict do nothing;

        v_offset := v_due[1];
        v_remaining := greatest(0, round(extract(epoch from (v_booking.scheduled_at - p_now)) / 60)::int);
        v_label_minutes := case when v_remaining >= v_offset - 2 then v_offset else v_remaining end;
        if v_label_minutes >= 1440 then
          v_label := '1 day';
        elsif v_label_minutes >= 60 then
          v_hours := round(v_label_minutes / 60.0)::int;
          v_label := case when v_hours = 1 then '1 hour' else v_hours || ' hours' end;
        else
          v_label := v_label_minutes || case when v_label_minutes = 1 then ' minute' else ' minutes' end;
        end if;

        begin
          perform public.create_notification(
            v_party.user_id,
            'booking',
            'Upcoming session',
            format('Your %s session with %s starts in %s.', v_booking.subject, v_party.other_name, v_label),
            jsonb_build_object('bookingId', v_booking.id)
          );
          v_sent := v_sent + 1;
        exception when others then
          raise warning 'Could not create a session reminder for booking % and user %: %',
            v_booking.id, v_party.user_id, sqlerrm;
        end;
      end if;

      v_morning_at := public.morning_reminder_at(v_booking.scheduled_at);
      if v_party.morning_of
        and p_now >= v_morning_at
        and p_now < v_morning_at + interval '15 minutes'
        and v_booking.scheduled_at > v_morning_at + interval '1 hour'
        and not exists (
          select 1
          from public.session_reminders_sent sent
          where sent.booking_id = v_booking.id
            and sent.user_id = v_party.user_id
            and sent.scheduled_at = v_booking.scheduled_at
            and sent.kind = 'morning'
            and sent.minutes_before = 0
        )
      then
        insert into public.session_reminders_sent
          (booking_id, user_id, scheduled_at, kind, minutes_before, sent_at)
        values (v_booking.id, v_party.user_id, v_booking.scheduled_at, 'morning', 0, p_now)
        on conflict do nothing;
        if found then
          begin
            perform public.create_notification(
              v_party.user_id,
              'booking',
              'Session today',
              format('You have a %s session with %s today.', v_booking.subject, v_party.other_name),
              jsonb_build_object('bookingId', v_booking.id)
            );
            v_sent := v_sent + 1;
          exception when others then
            raise warning 'Could not create a morning session reminder for booking % and user %: %',
              v_booking.id, v_party.user_id, sqlerrm;
          end;
        end if;
      end if;
    end loop;
  end loop;

  delete from public.session_reminders_sent
  where scheduled_at < p_now - interval '2 days';
  return v_sent;
end
$$;
revoke all on function public.send_session_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.send_session_reminders(timestamptz) to service_role;

select cron.schedule('send-session-reminders', '* * * * *', $$select public.send_session_reminders()$$);
