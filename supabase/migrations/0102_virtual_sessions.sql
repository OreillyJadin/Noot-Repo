alter table public.bookings
  add column daily_room_name text unique,
  add column video_link_sent_at timestamptz,
  add column daily_room_deleted_at timestamptz;

create function public.guard_video_booking_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    if (tg_op = 'INSERT' and (new.daily_room_name is not null or new.video_link_sent_at is not null
        or new.daily_room_deleted_at is not null or new.meeting_link is not null))
      or (tg_op = 'UPDATE' and (new.daily_room_name is distinct from old.daily_room_name
        or new.video_link_sent_at is distinct from old.video_link_sent_at
        or new.daily_room_deleted_at is distinct from old.daily_room_deleted_at
        or new.meeting_link is distinct from old.meeting_link)) then
      raise exception 'Video room fields are server-managed' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.scheduled_at is distinct from old.scheduled_at then
    new.video_link_sent_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_video_booking_fields() from public, anon, authenticated;
create trigger bookings_guard_video_fields before insert or update on public.bookings
  for each row execute function public.guard_video_booking_fields();

create function public.publish_video_room(p_booking uuid, p_scheduled_at timestamptz, p_room text, p_url text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings;
  v_conversation uuid;
  v_body text;
begin
  update public.bookings set meeting_link = p_url, video_link_sent_at = now()
  where id = p_booking and scheduled_at = p_scheduled_at and daily_room_name = p_room
    and video_link_sent_at is null and daily_room_deleted_at is null
    and session_type = 'video' and status = 'confirmed'
    and (stripe_payment_intent_id is not null or (price = 0 and student_fee = 0))
    and scheduled_at <= now() + interval '1 hour'
    and scheduled_at + duration_minutes * interval '1 minute' > now()
  returning * into b;
  if not found then return false; end if;

  v_body := format('Your video session for %s starts at %s Chicago time. Meeting code: %s. Tap "Join video session" on the session to join.',
    b.subject, to_char(b.scheduled_at at time zone 'America/Chicago', 'FMHH12:MI AM'), upper(p_room));
  if not exists (select 1 from public.user_blocks
    where (blocker_id = b.student_id and blocked_id = b.tutor_id)
       or (blocker_id = b.tutor_id and blocked_id = b.student_id)) then
    insert into public.conversations(student_id, tutor_id) values (b.student_id, b.tutor_id)
    on conflict (student_id, tutor_id) do update set student_id = excluded.student_id
    returning id into v_conversation;
    insert into public.messages(conversation_id, sender_id, content) values (v_conversation, b.tutor_id, v_body);
  end if;
  perform public.create_notification(b.student_id, 'booking', 'Video session ready',
    'Your private Noot video session is ready. Join from your session page.', jsonb_build_object('bookingId', b.id));
  perform public.create_notification(b.tutor_id, 'booking', 'Video session ready',
    'Your private Noot video session is ready. Join from your session page.', jsonb_build_object('bookingId', b.id));
  return true;
end;
$$;
revoke all on function public.publish_video_room(uuid, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.publish_video_room(uuid, timestamptz, text, text) to service_role;

create function public.request_video_rooms()
returns void language plpgsql security definer set search_path = '' as $$
declare v_url text; v_key text;
begin
  select max(case when name = 'noot_project_url' then decrypted_secret end),
         max(case when name = 'noot_service_role_key' then decrypted_secret end)
  into v_url, v_key from vault.decrypted_secrets
  where name in ('noot_project_url', 'noot_service_role_key');
  if nullif(v_url, '') is not null and nullif(v_key, '') is not null then
    perform net.http_post(url := rtrim(v_url, '/') || '/functions/v1/video-rooms',
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key));
  end if;
exception when others then
  raise warning 'Could not request video room maintenance: %', sqlerrm;
end;
$$;
revoke all on function public.request_video_rooms() from public, anon, authenticated;
grant execute on function public.request_video_rooms() to service_role;
select cron.schedule('video-rooms', '* * * * *', $$select public.request_video_rooms()$$);
