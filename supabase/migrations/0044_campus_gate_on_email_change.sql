-- 0044_campus_gate_on_email_change.sql — the campus gate also covers CHANGING an email (ERR-022).
--
-- THE PROBLEM THIS SOLVES. 0003 gates sign-up with a BEFORE INSERT trigger on auth.users, so
-- an account can only be CREATED with an approved campus address. Nothing gated an UPDATE:
-- a signed-in student could call auth.updateUser({ email: 'me@gmail.com' }), click the
-- confirmation link, and from then on sign in with a non-campus address (reproduced locally,
-- scripts/verify_campus_gate.mts). The app has no "change email" screen, but the Auth API is
-- public, so the app not offering it is not a control.
--
-- Two columns are checked:
--   • email_change — the address a change was REQUESTED for. Rejecting here fails the request
--     itself, before any confirmation email goes out.
--   • email — the address the account ends up with, whatever path set it.
-- The WHEN clause keeps the trigger off every other update of the row (sign-in timestamps,
-- password changes, bans), so an account whose campus is later deactivated can still sign in.

create or replace function enforce_campus_email_on_change()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  addr text;
  dom  text;
begin
  foreach addr in array array[
    case when new.email is distinct from old.email then new.email end,
    case when new.email_change is distinct from old.email_change then nullif(new.email_change, '') end
  ] loop
    continue when addr is null;
    dom := lower(split_part(addr, '@', 2));
    if dom = '' or not exists (select 1 from public.campuses where domain = dom and is_active) then
      raise exception 'Email domain "%" is not an approved campus', dom using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;

-- A trigger function is never called directly.
revoke all on function enforce_campus_email_on_change() from public, anon, authenticated;

drop trigger if exists enforce_campus_email_before_update on auth.users;
create trigger enforce_campus_email_before_update
  before update on auth.users
  for each row
  when (new.email is distinct from old.email or new.email_change is distinct from old.email_change)
  execute function enforce_campus_email_on_change();
