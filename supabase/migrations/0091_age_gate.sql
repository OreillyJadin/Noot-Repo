alter table public.users add column date_of_birth date;
comment on column public.users.date_of_birth is
  'Self-reported date of birth used for age eligibility. Null means not confirmed; never backfilled.';

create or replace function public.is_adult(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select u.date_of_birth <= current_date - interval '18 years'
    from public.users u
    where u.id = p_uid and u.date_of_birth is not null
  ), false);
$$;

revoke all on function public.is_adult(uuid) from public, anon, authenticated;
grant execute on function public.is_adult(uuid) to service_role;

create or replace function public.protect_date_of_birth()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('noot.dob_write', true), '') <> 'on'
     and (
       (tg_op = 'INSERT' and new.date_of_birth is not null)
       or (tg_op = 'UPDATE' and new.date_of_birth is distinct from old.date_of_birth)
     ) then
    raise exception 'Date of birth can only be set once through confirm_date_of_birth.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_date_of_birth() from public, anon, authenticated;
drop trigger if exists protect_date_of_birth_trg on public.users;
create trigger protect_date_of_birth_trg
  before insert or update on public.users
  for each row
  execute function public.protect_date_of_birth();

create or replace function public.confirm_date_of_birth(p_dob date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current date;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_dob is null or p_dob > current_date or p_dob < date '1900-01-01' then
    raise exception 'Invalid date of birth' using errcode = '22023';
  end if;

  select date_of_birth into v_current
  from public.users
  where id = v_uid;

  if not found then
    raise exception 'User profile not found' using errcode = 'P0002';
  end if;
  if v_current is not null then
    if v_current <> p_dob then
      raise exception 'Date of birth can''t be changed. Contact support@trynoot.com.'
        using errcode = 'insufficient_privilege';
    end if;
    return public.is_adult(v_uid);
  end if;

  perform set_config('noot.dob_write', 'on', true);
  update public.users set date_of_birth = p_dob where id = v_uid;
  return public.is_adult(v_uid);
end;
$$;

revoke all on function public.confirm_date_of_birth(date) from public, anon, authenticated;
grant execute on function public.confirm_date_of_birth(date) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_dob_text text := new.raw_user_meta_data ->> 'date_of_birth';
  v_dob date;
begin
  if v_dob_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    begin
      v_dob := v_dob_text::date;
    exception when others then
      v_dob := null;
    end;
  end if;

  if v_dob is not null then
    if v_dob < date '1900-01-01' or v_dob > current_date then
      v_dob := null;
    elsif v_dob > current_date - interval '18 years' then
      raise exception 'You must be 18 or older to use noot.';
    end if;
  end if;

  insert into public.users (id, email, first_name, last_name, date_of_birth)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    v_dob
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict do nothing;

  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
