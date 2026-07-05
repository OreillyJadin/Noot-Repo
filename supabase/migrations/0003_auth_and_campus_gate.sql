-- 0003_auth_and_campus_gate.sql — .edu domain gating + new-user provisioning
-- (ARCHITECTURE.md §6).
--
-- Supabase Auth has no built-in domain restriction. We enforce it with a Postgres
-- trigger on auth.users (works locally AND in prod from a plain migration — no
-- dashboard Auth Hook config needed), backed by a `campuses` allowlist table so
-- adding a school is a data change, not a deploy.

-- ---------- campuses allowlist ----------
create table campuses (
  domain     text primary key,            -- e.g. 'crimson.ua.edu'
  name       text not null,               -- 'University of Alabama'
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table campuses enable row level security;
-- readable pre-auth so the signup screen can show/validate campuses.
create policy campuses_read on campuses for select to anon, authenticated
  using (is_active);

-- Launch campus (ARCHITECTURE.md: University of Alabama, Fall 2026). Seeded in the
-- migration (not seed.sql) so the gate is populated in EVERY environment incl. prod.
insert into campuses (domain, name) values
  ('crimson.ua.edu', 'University of Alabama'),
  ('ua.edu',         'University of Alabama')
on conflict (domain) do nothing;

-- ---------- gate: reject non-campus emails at signup ----------
create or replace function enforce_campus_email()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  dom text := lower(split_part(new.email, '@', 2));
begin
  if new.email is null or dom = '' then
    raise exception 'A campus email is required' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.campuses where domain = dom and is_active) then
    raise exception 'Email domain "%" is not an approved campus', dom using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger enforce_campus_email_before_insert
  before insert on auth.users
  for each row execute function enforce_campus_email();

-- ---------- provision: mirror auth.users -> public.users + default student role ----------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.users (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict do nothing;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
