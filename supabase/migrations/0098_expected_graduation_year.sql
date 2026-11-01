alter table public.users
  add column expected_graduation_year smallint
    check (expected_graduation_year between 1900 and 2200);

comment on column public.users.expected_graduation_year is
  'Private projected graduation year. Post Grad is academic year, not account status; tutor eligibility is unchanged.';

create or replace function public.respond_to_graduation(p_graduated boolean, p_expected_year integer default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active account required' using errcode = '42501';
  end if;
  if p_graduated is null then
    raise exception 'Graduation answer required' using errcode = '22023';
  end if;
  if not p_graduated and (
    p_expected_year is null
    or p_expected_year < extract(year from now() at time zone 'America/Chicago')
    or p_expected_year > 2200
  ) then
    raise exception 'Enter this year or a later expected graduation year' using errcode = '22023';
  end if;
  update public.users
  set year = case when p_graduated then 'Post Grad' else year end,
      expected_graduation_year = case when p_graduated then null else p_expected_year end
  where id = auth.uid();
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.respond_to_graduation(boolean, integer) from public, anon;
grant execute on function public.respond_to_graduation(boolean, integer) to authenticated;
