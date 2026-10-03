-- 0043_lock_down_create_notification.sql — only the server may create notifications.
--
-- create_notification (0014) is the SECURITY DEFINER helper the notification triggers use to
-- write into a table that has no insert policy. It was never revoked from PUBLIC, and
-- PostgREST exposes every function a role may execute — so anyone holding the app's public
-- key, signed in or not, could call it and put a notification with any title, body and data
-- in front of any user. Notifications now carry meeting links (0042), which makes a forged
-- one a ready-made phishing message.
--
-- Nothing legitimate calls it from a client: the app never does, and the triggers and the
-- interview functions that use it run as its owner, which a revoke from these roles does
-- not affect.
revoke execute on function public.create_notification(uuid, notification_type, text, text, jsonb)
  from public, anon, authenticated;
-- Server code (Edge Functions, with the service key) may still use it.
grant execute on function public.create_notification(uuid, notification_type, text, text, jsonb) to service_role;
