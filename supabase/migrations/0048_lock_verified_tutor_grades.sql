-- 0048_lock_verified_tutor_grades.sql — what an admin verified stays what the student sees (ERR-012).
--
-- The Verified badge says "A noot team member checked this tutor's transcript and confirmed
-- the grades they list for their courses", and it carries the lower platform fee. Until now
-- nothing held the tutor to what was checked: tutor_courses is writable by its owner (0004)
-- and so is tutor_profiles.transcript_url, so a verified tutor could add a course with any
-- grade, raise every grade, or swap the transcript, and stay Verified at 17.5%.
--
-- From here, once grades_verified_at is set, the tutor themself can only:
--   • change a course's hourly rate, and
--   • remove a course (through set_tutor_courses below).
-- Adding a course, changing a grade and replacing the transcript are refused. The service
-- role (Edge Functions, Studio) is unaffected, so the noot team can still make the change.
--
-- An unverified tutor is not affected by any of this.

-- ---------- is this tutor verified? ----------
-- SECURITY DEFINER so the trigger and the Storage policies below can ask without depending
-- on tutor_profiles RLS. Verification is already public (it is the badge on every card).
create or replace function tutor_grades_verified(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tutor_profiles tp where tp.user_id = uid and tp.grades_verified_at is not null
  );
$$;

revoke all on function tutor_grades_verified(uuid) from public, anon;
grant execute on function tutor_grades_verified(uuid) to authenticated;

-- ---------- guard: a verified tutor's course rows ----------
-- Same role test as protect_tutor_approval (0038): direct client writes run as
-- `authenticated`; the service role and SECURITY DEFINER functions run as other roles.
--
-- A direct DELETE is refused too, not only INSERT. App builds before this migration save
-- the course list by deleting every row and inserting it again; with only the insert
-- refused, a verified tutor editing a rate on an old build would be left with no courses.
-- Refusing the delete makes that save fail cleanly with nothing lost. Removing a course goes
-- through set_tutor_courses.
create or replace function protect_verified_tutor_courses()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    if tutor_grades_verified(OLD.tutor_id) then
      raise exception 'Your grades are verified, so your course list is locked. Update the app to remove a course.'
        using errcode = 'insufficient_privilege';
    end if;
    return OLD;
  end if;

  if TG_OP = 'INSERT' then
    if tutor_grades_verified(NEW.tutor_id) then
      raise exception 'Your grades are verified, so your course list is locked. Contact noot support to add a course.'
        using errcode = 'insufficient_privilege';
    end if;
    return NEW;
  end if;

  if (tutor_grades_verified(OLD.tutor_id) or tutor_grades_verified(NEW.tutor_id))
     and (NEW.tutor_id       is distinct from OLD.tutor_id
          or NEW.course_code is distinct from OLD.course_code
          or NEW.grade       is distinct from OLD.grade) then
    raise exception 'Your grades are verified, so they are locked. Contact noot support to change a grade.'
      using errcode = 'insufficient_privilege';
  end if;
  return NEW;
end $$;

drop trigger if exists protect_verified_tutor_courses_trg on tutor_courses;
create trigger protect_verified_tutor_courses_trg
  before insert or update or delete on tutor_courses
  for each row
  execute function protect_verified_tutor_courses();

-- ---------- save the tutor's course list ----------
-- Replaces the app's delete-everything-then-insert save, which was two requests and could
-- leave a tutor with no courses if the second failed. One transaction: rows left out are
-- removed, the rest are added or updated in place (so a course keeps its session count).
--
-- For a verified tutor every course in the list must already be theirs with the same
-- grade, which leaves rate changes and removals.
--
-- p_courses: [{ "course_code": "MGT 300", "grade": "A", "hourly_rate": 25 }, …]
create or replace function set_tutor_courses(p_courses jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wanted jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_courses is null or jsonb_typeof(p_courses) <> 'array' then
    raise exception 'courses must be a list' using errcode = 'check_violation';
  end if;

  -- The list as it will be stored: codes trimmed, a blank grade is no grade.
  select coalesce(jsonb_agg(jsonb_build_object(
           'course_code', trim(c.course_code),
           'grade',       nullif(trim(c.grade), ''),
           'hourly_rate', c.hourly_rate)), '[]'::jsonb)
    into wanted
    from jsonb_to_recordset(p_courses) as c(course_code text, grade text, hourly_rate numeric);

  if exists (select 1 from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric)
              where coalesce(n.course_code, '') = '' or n.hourly_rate is null) then
    raise exception 'every course needs a code and a rate' using errcode = 'check_violation';
  end if;
  -- 0 is a course whose rate isn't set yet (onboarding step 3); 120 is MAX_HOURLY_RATE in
  -- @noot/core. NaN is a valid numeric and compares above every number, so it is caught here.
  if exists (select 1 from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric)
              where n.hourly_rate < 0 or n.hourly_rate > 120) then
    raise exception 'rates are up to $120 an hour' using errcode = 'check_violation';
  end if;
  if (select count(*) <> count(distinct n.course_code)
        from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric)) then
    raise exception 'a course is listed twice' using errcode = 'check_violation';
  end if;

  if tutor_grades_verified(uid) then
    -- The stored grade is compared the way the incoming one was cleaned up, so a row saved
    -- as '' or with stray spaces before this migration doesn't lock its owner out of saving.
    if exists (
      select 1
        from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric)
        left join tutor_courses t on t.tutor_id = uid and t.course_code = n.course_code
       where t.id is null or nullif(trim(t.grade), '') is distinct from n.grade
    ) then
      raise exception 'Your grades are verified, so your courses and grades are locked. Contact noot support to add a course or change a grade.'
        using errcode = 'insufficient_privilege';
    end if;
    -- A verified tutor with no course rows is shown from tutor_profiles.subjects instead
    -- (toTutor in the app), which nobody verified. Keep at least one verified course.
    if jsonb_array_length(wanted) = 0 then
      raise exception 'Keep at least one course. Contact noot support to change your courses.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  delete from tutor_courses t
   where t.tutor_id = uid
     and not exists (
       select 1 from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric)
        where n.course_code = t.course_code);

  insert into tutor_courses (tutor_id, course_code, grade, hourly_rate)
    select uid, n.course_code, n.grade, n.hourly_rate
      from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric)
  on conflict (tutor_id, course_code)
    do update set grade = excluded.grade, hourly_rate = excluded.hourly_rate;
end $$;

revoke all on function set_tutor_courses(jsonb) from public, anon;
grant execute on function set_tutor_courses(jsonb) to authenticated;

-- ---------- guard: a verified tutor's transcript ----------
-- protect_tutor_approval as in 0038, plus one rule: the transcript on file (and the
-- "signed up unverified" choice) cannot be changed by the tutor once it has been verified.
-- Nor can `subjects`, the coarse course list on the profile: search matches on it, and the
-- app falls back to it for a tutor with no course rows. The app never writes it for a tutor.
create or replace function protect_tutor_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    -- A client-created row always starts as a fresh draft, whatever it asked for.
    NEW.approval_status           := 'pending';
    NEW.reviewed_by               := null;
    NEW.reviewed_at               := null;
    NEW.submitted_at              := null;
    NEW.grades_verified_at        := null;
    NEW.grades_verified_by        := null;
    NEW.agreement_signed_at       := null;
    NEW.agreement_signed_name     := null;
    NEW.agreement_version         := null;
    NEW.stripe_connect_account_id := null;
    NEW.stripe_charges_enabled    := false;
    NEW.stripe_payouts_enabled    := false;
    NEW.stripe_onboarded_at       := null;
    NEW.rating_avg                := null;
    NEW.total_sessions            := 0;
    NEW.verified_grade            := null;
    return NEW;
  end if;

  if NEW.approval_status           is distinct from OLD.approval_status
     or NEW.reviewed_by               is distinct from OLD.reviewed_by
     or NEW.reviewed_at               is distinct from OLD.reviewed_at
     or NEW.submitted_at              is distinct from OLD.submitted_at
     or NEW.grades_verified_at        is distinct from OLD.grades_verified_at
     or NEW.grades_verified_by        is distinct from OLD.grades_verified_by
     or NEW.agreement_signed_at       is distinct from OLD.agreement_signed_at
     or NEW.agreement_signed_name     is distinct from OLD.agreement_signed_name
     or NEW.agreement_version         is distinct from OLD.agreement_version
     or NEW.stripe_connect_account_id is distinct from OLD.stripe_connect_account_id
     or NEW.stripe_charges_enabled    is distinct from OLD.stripe_charges_enabled
     or NEW.stripe_payouts_enabled    is distinct from OLD.stripe_payouts_enabled
     or NEW.stripe_onboarded_at       is distinct from OLD.stripe_onboarded_at
     or NEW.rating_avg                is distinct from OLD.rating_avg
     or NEW.total_sessions            is distinct from OLD.total_sessions
     or NEW.verified_grade            is distinct from OLD.verified_grade then
    raise exception 'these tutor profile fields can only be set by the server'
      using errcode = 'insufficient_privilege';
  end if;

  if OLD.grades_verified_at is not null
     and (NEW.transcript_url        is distinct from OLD.transcript_url
          or NEW.transcript_skipped is distinct from OLD.transcript_skipped) then
    raise exception 'Your grades are verified, so your transcript is locked. Contact noot support to replace it.'
      using errcode = 'insufficient_privilege';
  end if;
  if OLD.grades_verified_at is not null and NEW.subjects is distinct from OLD.subjects then
    raise exception 'Your grades are verified, so your course list is locked. Contact noot support to add a course.'
      using errcode = 'insufficient_privilege';
  end if;
  return NEW;
end $$;

-- ---------- Storage: the verified transcript file itself ----------
-- The row guard stops the path changing; these stop the file at that path being
-- overwritten or deleted. Same policies as 0011/0017 with the verified test added. Reads
-- (owner or admin) are unchanged.
drop policy if exists "transcripts_owner_insert" on storage.objects;
create policy "transcripts_owner_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'transcripts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.tutor_grades_verified(auth.uid())
  );

drop policy if exists "transcripts_owner_update" on storage.objects;
create policy "transcripts_owner_update" on storage.objects for update to authenticated
  using (
    bucket_id = 'transcripts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.tutor_grades_verified(auth.uid())
  );

drop policy if exists "transcripts_owner_delete" on storage.objects;
create policy "transcripts_owner_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'transcripts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not public.tutor_grades_verified(auth.uid())
  );
