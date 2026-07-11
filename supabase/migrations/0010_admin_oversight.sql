-- 0010_admin_oversight.sql — Admin (Phase 2 pt.2): booking disputes + user-status guard.

-- 1) Booking dispute state (admin-managed). bookings has no client write policy (0002 only
--    grants select), so these fields can only be written by the service role — no trigger needed.
alter table bookings add column if not exists dispute_status text not null default 'none'
  check (dispute_status in ('none', 'flagged', 'resolved'));
alter table bookings add column if not exists dispute_reason text;
alter table bookings add column if not exists dispute_resolution text;

-- 2) Guard users.status. users_update RLS (0002) lets a user update their OWN row, which
--    includes `status` — a user shouldn't be able to change their own account standing.
--    Only the service role (admin-set-user-status Edge Function) may change it. (Real
--    login/session enforcement of a ban is done via the GoTrue admin API in that function;
--    this just keeps the DB flag authoritative.)
create or replace function protect_user_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.status is distinct from OLD.status
     and coalesce((auth.jwt() ->> 'role'), '') <> 'service_role' then
    raise exception 'account status can only be changed by an administrator'
      using errcode = 'insufficient_privilege';
  end if;
  return NEW;
end $$;

drop trigger if exists protect_user_status_trg on users;
create trigger protect_user_status_trg
  before update on users
  for each row
  execute function protect_user_status();
