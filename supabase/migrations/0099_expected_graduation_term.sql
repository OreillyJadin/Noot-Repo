alter table public.users
  add column expected_graduation_term text
    check (expected_graduation_term in ('Fall', 'Spring', 'Summer'));

comment on column public.users.expected_graduation_term is
  'Private optional expected graduation term, alongside expected_graduation_year.';

create function public.clear_post_grad_term()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.year = 'Post Grad' then
    new.expected_graduation_term := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_post_grad_term() from public, anon, authenticated;

create trigger users_clear_post_grad_term
  before insert or update on public.users
  for each row execute function public.clear_post_grad_term();
