-- 0041_password_set_at.sql — when did this account choose its password? (ERR-001)
--
-- Sign-up is passwordless (the emailed link proves the .edu address); the password is chosen
-- during onboarding. On every launch the app has to decide "is this account past that step?",
-- and it had no real answer: it guessed from first_name (filled at sign-up, so always set)
-- and from which links the phone remembered. An account that had its password kept landing
-- back on "Create your password" after the app was quit.
--
-- auth.users can't answer it either: a link-only sign-up is created with a random password
-- hash, so "has a hash" is true for everyone. What does separate them is the hash CHANGING —
-- that only happens when the user sets a password (onboarding, or a reset). So the server
-- stamps that moment here, and the app reads it through getMe().
alter table public.users add column if not exists password_set_at timestamptz;

comment on column public.users.password_set_at is
  'When this user last chose a password (stamped by on_auth_user_password_set). Null = signed up by link and has not created a password yet, so the app starts them at onboarding. Accounts that existed before 0041 were back-filled with created_at.';

-- Accounts that already exist are treated as past the step, which is how the app treated
-- them until now (anyone with a name went to their home). Not a record of anything else.
update public.users set password_set_at = created_at where password_set_at is null;

create or replace function stamp_password_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set password_set_at = now() where id = new.id;
  return new;
end $$;

-- A trigger function is never called directly.
revoke all on function stamp_password_set() from public, anon, authenticated;

drop trigger if exists on_auth_user_password_set on auth.users;
create trigger on_auth_user_password_set
  after update of encrypted_password on auth.users
  for each row
  when (new.encrypted_password is distinct from old.encrypted_password
        and coalesce(new.encrypted_password, '') <> '')
  execute function stamp_password_set();

-- The column sits on the user's own row, which users_update lets them write. That is
-- acceptable for what it decides — which screen that same user sees after signing in — and
-- nothing may treat it as proof of anything else. RLS still stops a user touching anyone
-- else's (scripts/verify_launch_route.mts).
