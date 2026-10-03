-- 0043_lock_down_create_notification.sql — only the server may create notifications.
--
-- create_notification (0014) is the SECURITY DEFINER helper the notification triggers use to
-- write into a table that has no insert policy. It was never revoked from PUBLIC, and
-- PostgREST exposes every function a role may execute — so anyone holding the app's public
-- key, signed in or not, could call it and put a notification with any title, body and data
-- in front of any user: a ready-made phishing message inside the app.
--
-- Nothing legitimate calls it from a client. The app never does, and every function that
-- uses it (the message and booking triggers, and the interview functions in 0042) is itself
-- SECURITY DEFINER and runs as the owner, which a revoke from these roles does not affect.
revoke execute on function public.create_notification(uuid, public.notification_type, text, text, jsonb)
  from public, anon, authenticated;
-- Kept for server code holding the service key (nothing uses it that way today).
grant execute on function public.create_notification(uuid, public.notification_type, text, text, jsonb) to service_role;
