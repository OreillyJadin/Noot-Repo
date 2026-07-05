-- 0004_profile_extensions.sql — fields/tables the UI needs that §4 didn't model yet.
--
-- The clickable prototype (apps/mobile/lib/data.ts) carries per-person academic info
-- (year, major, gender), a per-course tutor breakdown (grade / rate / sessions), and a
-- student "saved tutors" list. None of that existed in 0001. This migration adds it so
-- the real screens can be fully backed by the DB instead of the in-memory mock.
--
-- Conventions mirror 0001/0002: person refs -> public.users(id) (= auth.uid()) so RLS
-- stays a join-free auth.uid() check; RLS enabled on every new table.

-- ---------- users: academic + demographic profile fields ----------
alter table users add column year    text;                       -- 'Freshman'..'Grad'
alter table users add column major   text;
alter table users add column gender  text check (gender in ('f', 'm'));
-- courses the STUDENT is taking (drives home/search categories). Tutor teaching-courses
-- live in tutor_courses below.
alter table users add column courses text[] not null default '{}';

-- ---------- tutor_profiles: denormalized headline stats ----------
alter table tutor_profiles add column total_sessions int not null default 0;   -- across all courses
alter table tutor_profiles add column verified_grade text;                     -- headline transcript grade badge

-- ---------- tutor_courses (per-course offering: grade + rate + sessions) ----------
-- Backs data.ts Tutor.courses = [courseCode, grade, rate, sessions]. subjects[] on
-- tutor_profiles stays the coarse searchable set; this is the rich per-course detail.
create table tutor_courses (
  id          uuid primary key default gen_random_uuid(),
  tutor_id    uuid not null references users(id) on delete cascade,
  course_code text not null,                       -- 'MGT 300'
  grade       text,                                -- verified transcript grade, 'A'
  hourly_rate numeric(10,2) not null default 0,    -- may differ per course
  sessions    int not null default 0,
  created_at  timestamptz not null default now(),
  unique (tutor_id, course_code)
);
create index tutor_courses_course_idx on tutor_courses (course_code);
create index tutor_courses_tutor_idx  on tutor_courses (tutor_id);

alter table tutor_courses enable row level security;
-- browsable by anyone authenticated (search); managed by the owning tutor.
create policy tutor_courses_select on tutor_courses for select to authenticated
  using (true);
create policy tutor_courses_write on tutor_courses for all to authenticated
  using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());

-- ---------- saved_tutors (student's bookmarked tutors) ----------
create table saved_tutors (
  student_id uuid not null references users(id) on delete cascade,
  tutor_id   uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, tutor_id)
);
create index saved_tutors_student_idx on saved_tutors (student_id);

alter table saved_tutors enable row level security;
-- a student sees and manages only their own saved list.
create policy saved_tutors_all on saved_tutors for all to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());
