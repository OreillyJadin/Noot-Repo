create or replace function public.users_validate_names()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.first_name is distinct from old.first_name then
    if btrim(new.first_name) = '' then
      raise exception 'First name cannot be blank' using errcode = '22023';
    end if;
    if char_length(new.first_name) > 50 then
      raise exception 'Names can be at most 50 characters' using errcode = '22023';
    end if;
  end if;

  if new.last_name is distinct from old.last_name then
    if btrim(new.last_name) = '' then
      raise exception 'Last name cannot be blank' using errcode = '22023';
    end if;
    if char_length(new.last_name) > 50 then
      raise exception 'Names can be at most 50 characters' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.users_validate_names() from public, anon, authenticated;

drop trigger if exists users_validate_names on public.users;
create trigger users_validate_names
  before update of first_name, last_name on public.users
  for each row execute function public.users_validate_names();
