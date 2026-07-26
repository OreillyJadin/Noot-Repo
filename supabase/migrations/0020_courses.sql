-- 0020_courses.sql — UA course catalog.
--
-- PROVENANCE: this table was created directly against the remote project while seeding the
-- catalog, so it arrived as an out-of-band migration (`20260726174549_create_courses_table`)
-- with no file in this repo — which is exactly the drift `pnpm check:preview` catches. The
-- body below is that remote migration verbatim; the remote history row has been relabeled to
-- version 0020 so local and remote agree and Supabase Preview stops failing.
--
-- Everything is `if not exists`, so applying it to the remote (already has the table), a
-- preview branch, or a fresh `supabase db reset` all land in the same place.
--
-- NOTE ON ACCESS: RLS is on for this table but it currently has NO policies, which means no
-- rows are readable through the data API by anon or authenticated — only the service role
-- sees them. That's the safe default while the catalog is being seeded, but course search
-- will read nothing until a select policy is added in a later migration.

create table if not exists public.courses (
  course_id      text primary key,
  university_id  text not null default 'ua',
  catalog_year   text not null,
  college_name   text not null,
  division_code  text,
  subject_code   text not null,
  subject_name   text not null,
  course_number  text not null,
  course_code    text not null,
  course_title   text not null,
  credit_hours   text,
  is_active      boolean not null default true,
  source_file    text,
  source_pages   text,
  unique (university_id, catalog_year, course_code)
);

create index if not exists courses_subject_idx on public.courses(subject_code);
create index if not exists courses_college_idx on public.courses(college_name);
create index if not exists courses_title_idx   on public.courses(course_title);

-- Match the remote, where RLS is enabled. No policies = deny-all to anon/authenticated.
alter table public.courses enable row level security;
