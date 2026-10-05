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
--
-- THE DOMAIN IS WHATEVER FOLLOWS THE LAST '@'. 0003 used split_part(email, '@', 2), the text
-- between the first and second '@', which reads 'x@crimson.ua.edu@gmail.com' as a campus
-- address. The Auth server refuses such an address as malformed before it reaches the
-- database, so this was not reachable, but the gate should not depend on that. Both the new
-- trigger and 0003's sign-up trigger (redefined below) now use campus_email_domain().
--
-- NOT COVERED, ON PURPOSE. Setting email to NULL is not a move to another address and is left
-- alone. The Auth server's SOFT delete rewrites email to a hash with no '@', which this gate
-- refuses; account deletion here is a hard delete (functions/delete-account), so nothing uses it.

-- The mail domain of an address, lowercased; NULL when there is none.
create or replace function campus_email_domain(addr text)
returns text language sql immutable set search_path = public as $$
  select nullif(lower(substring(addr from '@([^@]*)$')), '')
$$;

-- Sign-up gate from 0003, unchanged apart from how the domain is read.
create or replace function enforce_campus_email()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  dom text := public.campus_email_domain(new.email);
begin
  if new.email is null or dom is null then
    raise exception 'A campus email is required' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.campuses where domain = dom and is_active) then
    raise exception 'Email domain "%" is not an approved campus', dom using errcode = 'check_violation';
  end if;
  return new;
end $$;

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
    dom := public.campus_email_domain(addr);
    if dom is null or not exists (select 1 from public.campuses where domain = dom and is_active) then
      raise exception 'Email domain "%" is not an approved campus', coalesce(dom, '') using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;

-- A trigger function is never called directly.
revoke all on function enforce_campus_email_on_change() from public, anon, authenticated;
revoke all on function enforce_campus_email() from public, anon, authenticated;

drop trigger if exists enforce_campus_email_before_update on auth.users;
create trigger enforce_campus_email_before_update
  before update on auth.users
  for each row
  when (new.email is distinct from old.email or new.email_change is distinct from old.email_change)
  execute function enforce_campus_email_on_change();
