-- 0025_course_subjects.sql — a distinct-subject view for the Major picker.
--
-- WHY A VIEW: deriving the subject list client-side means selecting subject_name from all
-- ~3.9k course rows and de-duplicating in JS, and PostgREST caps a response at 1000 rows. On
-- production that silently returned 31 of 132 subjects — everything alphabetically after
-- "Consumer Sciences" just vanished, with no error. A local dataset small enough to fit under
-- the cap can't reproduce it, so this is exactly the kind of bug that only shows up in prod.
--
-- 132 rows instead of 3927, no cap risk, and the DISTINCT runs in the database where it belongs.
--
-- security_invoker: the view must NOT bypass RLS. With it on, the caller's own permissions
-- against `courses` apply — which is the public-read policy from 0023, so anon can read the
-- subject list the same way it can read the catalog (course search runs before signup).

create or replace view public.course_subjects
with (security_invoker = on) as
  select distinct subject_code, subject_name, college_name
  from public.courses
  where is_active;

grant select on public.course_subjects to anon, authenticated;
