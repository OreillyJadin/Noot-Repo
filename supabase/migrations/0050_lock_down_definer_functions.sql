-- 0050_lock_down_definer_functions.sql — only the right callers can run each function.
--
-- Postgres gives EXECUTE to PUBLIC on every new function, and PostgREST exposes every function
-- a role may execute at /rest/v1/rpc/<name>. Several functions never had that default revoked,
-- so the app's public key alone (signed out) could call them. Supabase's security advisor
-- flagged 16. This migration revokes the default and grants back only what each caller needs.
-- SECURITY DEFINER functions that call these run as the owner, and triggers / RLS policies
-- don't need the caller to hold EXECUTE on a trigger function, so revoking does not break them.

-- 1) Trigger and event-trigger functions: never meant to be called over the API.
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.enforce_active_role()      from public, anon, authenticated;
revoke execute on function public.notify_on_booking()        from public, anon, authenticated;
revoke execute on function public.notify_on_message()        from public, anon, authenticated;
revoke execute on function public.on_ambassador_approved()   from public, anon, authenticated;
revoke execute on function public.on_ambassador_role_added() from public, anon, authenticated;
-- rls_auto_enable exists in production but no migration creates it, so it is missing on a fresh
-- local or preview database; only revoke it where it exists.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
revoke execute on function public.set_updated_at()           from public, anon, authenticated;
alter function public.set_updated_at() set search_path = public;

-- 2) RLS helpers. Every policy that uses them is `to authenticated`, so signed-out callers
--    lose nothing; signed-in users keep EXECUTE because the policies run as them.
revoke execute on function public.is_admin()                               from public, anon;
revoke execute on function public.is_approved_tutor(uuid)                  from public, anon;
revoke execute on function public.is_blocked_between(uuid, uuid)           from public, anon;
revoke execute on function public.is_chat_attachment_participant(text)     from public, anon;
revoke execute on function public.is_conversation_participant(uuid)        from public, anon;
grant  execute on function public.is_admin()                               to authenticated;
grant  execute on function public.is_approved_tutor(uuid)                  to authenticated;
grant  execute on function public.is_blocked_between(uuid, uuid)           to authenticated;
grant  execute on function public.is_chat_attachment_participant(text)     to authenticated;
grant  execute on function public.is_conversation_participant(uuid)        to authenticated;

-- 3) Actions a signed-in user takes on their own account.
revoke execute on function public.create_my_ambassador_profile()                       from public, anon;
revoke execute on function public.sign_tutor_agreement(text, text)                     from public, anon;
revoke execute on function public.submit_tutor_application()                           from public, anon;
revoke execute on function public.send_message_with_attachments(uuid, text, jsonb)     from public, anon;
grant  execute on function public.create_my_ambassador_profile()                       to authenticated;
grant  execute on function public.sign_tutor_agreement(text, text)                     to authenticated;
grant  execute on function public.submit_tutor_application()                           to authenticated;
grant  execute on function public.send_message_with_attachments(uuid, text, jsonb)     to authenticated;
alter function public.send_message_with_attachments(uuid, text, jsonb) set search_path = public;

-- 4) check_invite_code stays callable signed out (the sign-up screen checks the code as it is
--    typed), but is now rate-limited per caller so codes can't be guessed by brute force.
--    Caller = the signed-in user, else the client IP (cf-connecting-ip is set by Supabase's
--    edge and can't be forged; x-forwarded-for's first entry is the fallback). Over the limit
--    it raises; the app treats any error as "couldn't check" and lets sign-up continue, and
--    claim_invite still validates the code after sign-in.
create table public.invite_code_checks (
  id         bigint generated always as identity primary key,
  client_key text not null,
  checked_at timestamptz not null default now()
);
create index invite_code_checks_client_idx on public.invite_code_checks (client_key, checked_at);
alter table public.invite_code_checks enable row level security;
-- No policies: only check_invite_code (running as the owner) reads or writes it.
revoke all on table public.invite_code_checks from public, anon, authenticated;

create or replace function public.check_invite_code(p_code text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  client  text := coalesce(
    auth.uid()::text,
    nullif(trim(headers->>'cf-connecting-ip'), ''),
    nullif(trim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)), ''),
    'unknown');
  recent  int;
begin
  delete from invite_code_checks where checked_at < now() - interval '1 hour';
  select count(*) into recent from invite_code_checks
    where client_key = client and checked_at > now() - interval '10 minutes';
  if recent >= 30 then
    raise exception 'Too many invite code checks. Try again in a few minutes.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into invite_code_checks (client_key) values (client);
  return exists (select 1 from invite_codes where code = upper(trim(coalesce(p_code, ''))));
end;
$$;
revoke execute on function public.check_invite_code(text) from public;
grant  execute on function public.check_invite_code(text) to anon, authenticated;
