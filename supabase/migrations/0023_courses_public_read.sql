-- 0023_courses_public_read.sql — let clients read the course catalog.
--
-- PROVENANCE: like 0020, this was applied straight to the remote project from the catalog
-- seeding session, arriving as `20260726183843_add_courses_public_read_policy` with no file
-- here. Body is that remote migration verbatim; the remote history row is relabeled to 0023.
--
-- 0020 left `courses` with RLS on and no policies, so the data API returned zero rows to
-- everyone but the service role. This opens reads to all callers — anon included, since the
-- policy has no `to` clause — which is the right call for a public university catalog: course
-- search has to work before a student signs up. There is deliberately still no insert/update/
-- delete policy, so the catalog stays read-only to clients and is maintained out of band.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'courses' and policyname = 'Courses are publicly readable'
  ) then
    create policy "Courses are publicly readable" on public.courses for select using (true);
  end if;
end $$;
