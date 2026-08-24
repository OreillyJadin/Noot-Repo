-- 0027_tutoring_locations.sql — campus locations for in-person sessions.
--
-- PROVENANCE: created directly against the remote project on 2026-08-24 (arrived as
-- `20260824011646_create_tutoring_locations`), so it had no file here and failed
-- `pnpm check:preview`. Body is that remote migration, made idempotent; the remote history
-- row is relabeled to 0027 so local and remote agree. Third time this has happened — see the
-- note in HANDOFF §4 about writing schema changes as files instead.
--
-- WHY IT EXISTS: the in-person location is currently free text (t5.tsx, "e.g. Gorgas Library,
-- Fl 2"), which has the same problem course codes had — "Gorgas", "gorgas library" and a typo
-- are three different places and none of them group. This is the list to pick from.
--
-- Read-only to clients and readable by anon, matching `courses` (0023): a student browsing
-- before signup can see where sessions happen. Maintained out of band, like the catalog.

create table if not exists public.tutoring_locations (
  id            uuid primary key default gen_random_uuid(),
  university_id text not null default 'ua',
  name          text not null,
  category      text not null check (category in ('library', 'building')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (university_id, name)
);

comment on table public.tutoring_locations is 'Campus locations where in-person tutoring sessions may take place.';

alter table public.tutoring_locations enable row level security;

drop policy if exists "tutoring_locations_read" on public.tutoring_locations;
create policy "tutoring_locations_read" on public.tutoring_locations
  for select to anon, authenticated using (is_active);

create index if not exists tutoring_locations_university_idx
  on public.tutoring_locations (university_id, category, name);
