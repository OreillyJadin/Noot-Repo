-- 0007_active_role_guard.sql
-- Role-switching foundation (Phase 0): guard the client-writable users.active_role.
--
-- users.active_role is updatable by the owner (users_update RLS in 0002 = id = auth.uid()),
-- which is what lets the profile role switcher persist the current mode. active_role is
-- cosmetic — it only selects which home/tabs render; permissions come from user_roles +
-- is_admin(), NOT from active_role — but we still enforce that a user can only make active a
-- role they actually HOLD, so the UI state can't drift to a role they don't have.
--
-- Note: we intentionally do NOT hard-block active_role = 'admin' here. is_admin() reads
-- user_roles (never active_role), so an admin mode grants no power; and only accounts that
-- hold the 'admin' role (seeded via service role) could set it anyway. The app's role
-- switcher never offers admin — admin is a separate gated entry point.

create or replace function enforce_active_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.active_role is distinct from OLD.active_role then
    if not exists (
      select 1 from user_roles where user_id = NEW.id and role = NEW.active_role
    ) then
      raise exception 'active_role % is not a role held by user %', NEW.active_role, NEW.id
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists enforce_active_role_trg on users;
create trigger enforce_active_role_trg
  before update on users
  for each row
  execute function enforce_active_role();
