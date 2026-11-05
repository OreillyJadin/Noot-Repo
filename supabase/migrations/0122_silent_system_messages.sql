alter table public.messages
  add column is_system boolean not null default false;

create function public.guard_system_messages()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    if (tg_op = 'INSERT' and new.is_system)
      or (tg_op = 'UPDATE' and new.is_system is distinct from old.is_system) then
      raise exception 'System messages are server-managed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_system_messages() from public, anon, authenticated;
create trigger messages_guard_system
  before insert or update of is_system on public.messages
  for each row execute function public.guard_system_messages();

create or replace function public.notify_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_student uuid; v_tutor uuid; v_recipient uuid; v_sender text;
begin
  if new.is_system then return new; end if;
  select student_id, tutor_id into v_student, v_tutor from conversations where id = new.conversation_id;
  v_recipient := case when new.sender_id = v_student then v_tutor else v_student end;
  if v_recipient is null or v_recipient = new.sender_id then return new; end if;
  select coalesce(nullif(trim(first_name || ' ' || last_name), ''), 'Someone') into v_sender from users where id = new.sender_id;
  perform public.create_notification(
    v_recipient, 'message', v_sender || ' sent you a message', left(new.content, 140),
    jsonb_build_object('conversationId', new.conversation_id, 'senderId', new.sender_id)
  );
  return new;
end;
$$;
revoke execute on function public.notify_on_message() from public, anon, authenticated;

create or replace function public.publish_video_room(p_booking uuid, p_scheduled_at timestamptz, p_room text, p_url text)
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
    insert into public.messages(conversation_id, sender_id, content, is_system)
      values (v_conversation, b.tutor_id, v_body, true);
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
