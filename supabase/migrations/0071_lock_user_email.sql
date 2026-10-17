-- Authenticated users may edit their profile, but the canonical email is server-managed.
create or replace function public.prevent_authenticated_user_email_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.email is distinct from old.email
     and (select auth.role()) = 'authenticated' then
    raise exception using
      errcode = '42501',
      message = 'email can only be changed by the server';
  end if;
  return new;
end $$;

revoke all on function public.prevent_authenticated_user_email_change() from public, anon, authenticated;

drop trigger if exists users_email_lock on public.users;
create trigger users_email_lock
  before update of email on public.users
  for each row
  execute function public.prevent_authenticated_user_email_change();
