-- 0047_terms_before_messages.sql — no chat message from an account that has not accepted the
-- Terms of Use (Guideline 1.2: agreement to the terms comes before posting any content).
--
-- Acceptance is recorded on the "create your password" screen in onboarding (0030). The app
-- was the only thing enforcing it, and it could be skipped: an account that abandoned
-- onboarding could use Forgot password — a reset has no Terms checkbox — and land in the app
-- with terms_accepted_at still null. The app now holds such an account at an accept-Terms
-- screen; this is the server half, for anyone talking to the API directly.
--
-- WHO IT APPLIES TO. Accounts created on or after 2026-10-05. Older accounts may have a null
-- terms_accepted_at for honest reasons (they predate 0030, or were made by a script), and a
-- build of the app from before this change has no screen where they could accept — enforcing
-- it on them would simply switch their chat off. They are asked by the app on their next
-- sign-in instead. The account's age is read from auth.users, which its owner cannot write;
-- public.users.created_at sits on a row they can.
--
-- WHAT IT COVERS. A message written by the signed-in user themselves. Messages the server
-- writes on someone's behalf (the note a student sends with a booking, through the
-- confirm-booking function) are not blocked here: by then a payment has been taken, and
-- refusing the write would fail the booking.
create or replace function require_terms_for_message()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Only a user's own direct write. The service role (Edge Functions) has no auth.uid().
  if auth.uid() is null or new.sender_id is distinct from auth.uid() then
    return new;
  end if;
  if exists (
    select 1
      from public.users u
      join auth.users a on a.id = u.id
     where u.id = new.sender_id
       and u.terms_accepted_at is null
       and a.created_at >= timestamptz '2026-10-05 00:00:00+00'
  ) then
    raise exception 'Accept the Terms of Use to send messages.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- A trigger function is never called directly.
revoke all on function require_terms_for_message() from public, anon, authenticated;

drop trigger if exists require_terms_before_insert on messages;
create trigger require_terms_before_insert
  before insert on messages
  for each row execute function require_terms_for_message();
