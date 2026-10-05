-- 0045_push_delivery.sql — notifications reach the phone, not only the in-app feed (ERR-031).
--
-- 0014 writes a row to `notifications` for each event (a message, a booking, an interview)
-- and left delivery as "a separate layer that can read these rows". push_tokens (0001) has
-- been there to hold each device's Expo push token, but nothing wrote to it and nothing
-- sent. The app now asks for notification permission and registers its token; this is the
-- sending half: every new notification row is handed to Expo's push service for the
-- recipient's devices.
--
-- WHAT LEAVES THE DATABASE. The notification's title and body (for a message: the sender's
-- name and the first 140 characters) and its data, to Expo and on to Apple/Google. That is
-- what a push notification is; it is the same text the in-app feed shows.

-- ---------- a token is one device, and a device has one account ----------
-- Only what Expo issues is storable. NOT VALID: checked for every new or changed row, and
-- the migration does not depend on what an old row holds.
alter table push_tokens
  add constraint push_tokens_token_format
  check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_:-]{1,200}\]$') not valid;

-- The same phone signing in as someone else must stop getting the first account's
-- notifications. The app removes its token on sign-out, but a session that simply expired
-- never runs that, and RLS (own rows only) means the new account could not remove the old
-- row itself. So registering a token takes it from whoever had it.
create or replace function claim_push_token()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from push_tokens where token = new.token and user_id <> new.user_id;
  return new;
end $$;
revoke all on function claim_push_token() from public, anon, authenticated;

drop trigger if exists claim_push_token_before_insert on push_tokens;
create trigger claim_push_token_before_insert
  before insert on push_tokens
  for each row execute function claim_push_token();

-- ---------- send ----------
create extension if not exists pg_net with schema extensions;

-- pg_net queues the request and sends it after the transaction commits, so this never waits
-- on the network. It must also never be the reason a notification — or the message or
-- booking that caused it — fails to save: any error here is swallowed.
create or replace function push_on_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_messages jsonb;
begin
  -- A person's most recent devices. The cap keeps one request under Expo's limit of 100
  -- messages even if an account has piled up rows.
  select jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', new.title,
           'body', new.body,
           'sound', 'default',
           'data', new.data || jsonb_build_object('type', new.type)))
    into v_messages
    from (select token from push_tokens where user_id = new.user_id order by created_at desc limit 10) t;
  if v_messages is null then return new; end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end $$;
revoke all on function push_on_notification() from public, anon, authenticated;

drop trigger if exists push_on_notification_after_insert on notifications;
create trigger push_on_notification_after_insert
  after insert on notifications
  for each row execute function push_on_notification();
