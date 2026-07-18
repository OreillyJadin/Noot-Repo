-- 0014_notifications.sql — in-app notification center.
-- A per-user feed of notifications, created by SECURITY DEFINER triggers on real events
-- (a new message → the other participant; a new booking → the tutor). Recipients read and
-- mark their own read via RLS; rows are only ever inserted by the triggers below (no user
-- insert policy). Push delivery (Expo Push) is a separate layer that can read these rows.

create type notification_type as enum ('message', 'booking', 'system');

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,   -- recipient
  type       notification_type not null,
  title      text not null,
  body       text not null default '',
  data       jsonb not null default '{}'::jsonb,                     -- e.g. {conversationId} / {bookingId}
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on notifications (user_id, created_at desc);

alter table notifications enable row level security;

-- Recipients read their own feed.
create policy notifications_select_own on notifications for select to authenticated
  using (user_id = auth.uid());
-- Recipients mark their own read.
create policy notifications_update_own on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Recipients may clear their own.
create policy notifications_delete_own on notifications for delete to authenticated
  using (user_id = auth.uid());
-- (No insert policy — rows come only from the SECURITY DEFINER triggers below.)

grant select, update, delete on notifications to authenticated;

-- Insert helper — runs as owner so it bypasses RLS from inside triggers.
create or replace function public.create_notification(
  p_user uuid, p_type notification_type, p_title text, p_body text, p_data jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into notifications (user_id, type, title, body, data)
  values (p_user, p_type, p_title, coalesce(p_body, ''), coalesce(p_data, '{}'::jsonb));
end;
$$;

-- New message → notify the participant who didn't send it.
create or replace function public.notify_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_student uuid; v_tutor uuid; v_recipient uuid; v_sender text;
begin
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
create trigger trg_notify_on_message after insert on messages
  for each row execute function public.notify_on_message();

-- New booking → notify the tutor.
create or replace function public.notify_on_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_student text;
begin
  select coalesce(nullif(trim(first_name || ' ' || last_name), ''), 'A student') into v_student from users where id = new.student_id;
  perform public.create_notification(
    new.tutor_id, 'booking', 'New session booked', v_student || ' booked ' || new.subject || ' with you',
    jsonb_build_object('bookingId', new.id)
  );
  return new;
end;
$$;
create trigger trg_notify_on_booking after insert on bookings
  for each row execute function public.notify_on_booking();
