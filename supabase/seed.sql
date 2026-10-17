-- Dev seed data for noot. Applied by `supabase db reset` AFTER migrations.
--
-- The campus allowlist (crimson.ua.edu, ua.edu) is seeded in the migration itself
-- (0003) so the .edu gate works in every environment — it is NOT repeated here.
--
-- Demo tutors/bookings are intentionally NOT auto-seeded: every person row hangs off
-- an auth.users row (users.id references auth.users.id), so realistic seed data means
-- creating auth users first. The cleanest local path is to sign up through the app
-- against the local stack (magic links appear in Inbucket at http://localhost:54324),
-- then let the app write profiles/availability.
--
-- To seed demo accounts non-interactively instead, create the auth users via the
-- Admin API (service_role key) — e.g. POST {url}/auth/v1/admin/users — then INSERT the
-- matching tutor_profiles / tutor_availability rows here, mirroring the demo content in
-- design_handoff_noot_app/app/booking-data.jsx. Left as a TODO to keep this idempotent.

-- (add extra campuses for local testing here if needed)
-- insert into campuses (domain, name) values ('example.edu', 'Example University')
--   on conflict (domain) do nothing;

-- Prod's tutoring location list is maintained out of band; mirror it for local/CI.
insert into public.tutoring_locations (university_id, category, name) values
  ('ua', 'building', 'Adams Hall'),
  ('ua', 'building', 'Alabama Innovation and Mentoring of Entrepreneurs Center (AIME)'),
  ('ua', 'building', 'Alston Hall'),
  ('ua', 'building', 'Autherine Lucy Hall'),
  ('ua', 'building', 'B. B. Comer Hall'),
  ('ua', 'building', 'Bidgood Hall'),
  ('ua', 'building', 'Bryant Hall Academic Center'),
  ('ua', 'building', 'Bryant-Jordan Hall'),
  ('ua', 'building', 'Bureau of Mines - Building 1'),
  ('ua', 'building', 'Capstone College of Nursing'),
  ('ua', 'building', 'Carmichael Hall'),
  ('ua', 'building', 'Clark Hall'),
  ('ua', 'building', 'College of Continuing Studies'),
  ('ua', 'building', 'Digital Media Center'),
  ('ua', 'building', 'Doster Hall'),
  ('ua', 'building', 'Drummond Lyon Hall'),
  ('ua', 'building', 'English Building'),
  ('ua', 'building', 'Farrah Hall'),
  ('ua', 'building', 'Frank Moody Music Building'),
  ('ua', 'building', 'Gallalee Hall'),
  ('ua', 'building', 'Garland Hall'),
  ('ua', 'building', 'Gordon Palmer Hall'),
  ('ua', 'building', 'H.M. Comer Hall'),
  ('ua', 'building', 'Hardaway Hall'),
  ('ua', 'building', 'Hewson Hall'),
  ('ua', 'building', 'Honors Hall'),
  ('ua', 'building', 'Honors Hall Annex'),
  ('ua', 'building', 'Houser Hall'),
  ('ua', 'building', 'Law School'),
  ('ua', 'building', 'Little Hall'),
  ('ua', 'building', 'Lloyd Hall'),
  ('ua', 'building', 'Math and Science Education Building'),
  ('ua', 'building', 'Mathematics Technology Learning Center'),
  ('ua', 'building', 'McMillan Building'),
  ('ua', 'building', 'North Engineering Research Center (NERC)'),
  ('ua', 'building', 'North Lawn Hall'),
  ('ua', 'building', 'Oliver-Barnard Hall'),
  ('ua', 'building', 'Paty Hall'),
  ('ua', 'building', 'Presidents Hall'),
  ('ua', 'building', 'Reese Phifer Hall'),
  ('ua', 'building', 'Riverside Commons'),
  ('ua', 'building', 'Rowand-Johnson Hall'),
  ('ua', 'building', 'Russell Hall'),
  ('ua', 'building', 'School of Medicine Tuscaloosa'),
  ('ua', 'building', 'Science and Engineering Complex'),
  ('ua', 'building', 'Shelby Hall'),
  ('ua', 'building', 'Smith Hall'),
  ('ua', 'building', 'South Engineering Research Center (SERC)'),
  ('ua', 'building', 'Speech and Hearing Building'),
  ('ua', 'building', 'Stran-Hardin Arena'),
  ('ua', 'building', 'Student Engineering Projects Building'),
  ('ua', 'building', 'Ten Hoor Hall'),
  ('ua', 'building', 'The Tom Bevill Building'),
  ('ua', 'building', 'University Hall'),
  ('ua', 'building', 'Wade Hall'),
  ('ua', 'building', 'Woods Hall'),
  ('ua', 'library', 'Angelo Bruno Business Library'),
  ('ua', 'library', 'Gorgas Library'),
  ('ua', 'library', 'McLure Library'),
  ('ua', 'library', 'Rodgers Library for Science and Engineering')
on conflict (university_id, name) do nothing;
