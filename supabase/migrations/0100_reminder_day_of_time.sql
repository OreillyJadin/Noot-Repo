alter table public.reminder_preferences
  add column day_of_time time not null default '07:00'
    check (day_of_time >= time '06:00' and day_of_time <= time '12:00'
      and extract(minute from day_of_time) in (0, 30)
      and extract(second from day_of_time) = 0);

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
             coalesce(pref.morning_of, true) as morning_of,
             coalesce(pref.day_of_time, time '07:00') as day_of_time
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

      v_morning_at := ((v_booking.scheduled_at at time zone 'America/Chicago')::date + v_party.day_of_time)
        at time zone 'America/Chicago';
      if v_party.morning_of
        and p_now >= v_morning_at
        and p_now < v_morning_at + interval '15 minutes'
        and v_booking.scheduled_at >= v_morning_at + interval '1 hour'
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

