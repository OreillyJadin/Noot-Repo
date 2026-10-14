alter table public.tutor_courses
  add column currently_taking boolean not null default false,
  add constraint tutor_courses_currently_taking_grade_check
    check (not currently_taking or grade is null);

create or replace function public.protect_verified_tutor_courses()
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
    if tutor_grades_verified(NEW.tutor_id)
       and not (NEW.currently_taking and NEW.grade is null) then
      raise exception 'Your grades are verified, so your course list is locked. Contact noot support to add a course.'
        using errcode = 'insufficient_privilege';
    end if;
    return NEW;
  end if;

  if (tutor_grades_verified(OLD.tutor_id) or tutor_grades_verified(NEW.tutor_id))
     and (NEW.tutor_id        is distinct from OLD.tutor_id
          or NEW.course_code  is distinct from OLD.course_code
          or NEW.grade        is distinct from OLD.grade
          or NEW.currently_taking is distinct from OLD.currently_taking) then
    raise exception 'Your grades are verified, so they are locked. Contact noot support to change a grade.'
      using errcode = 'insufficient_privilege';
  end if;
  return NEW;
end $$;

drop trigger if exists protect_verified_tutor_courses_trg on public.tutor_courses;
create trigger protect_verified_tutor_courses_trg
  before insert or update or delete on public.tutor_courses
  for each row
  execute function public.protect_verified_tutor_courses();

create or replace function public.set_tutor_courses(p_courses jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wanted jsonb;
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_courses is null or jsonb_typeof(p_courses) <> 'array' then
    raise exception 'courses must be a list' using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'course_code', trim(c.course_code),
           'grade', nullif(trim(c.grade), ''),
           'hourly_rate', c.hourly_rate,
           'currently_taking', coalesce(c.currently_taking, false))), '[]'::jsonb)
    into wanted
    from jsonb_to_recordset(p_courses) as c(
      course_code text,
      grade text,
      hourly_rate numeric,
      currently_taking boolean
    );

  if exists (select 1 from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric, currently_taking boolean)
              where coalesce(n.course_code, '') = '' or n.hourly_rate is null) then
    raise exception 'every course needs a code and a rate' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric, currently_taking boolean)
              where n.hourly_rate < 0 or n.hourly_rate > 120) then
    raise exception 'rates are up to $120 an hour' using errcode = 'check_violation';
  end if;
  if (select count(*) <> count(distinct n.course_code)
        from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric, currently_taking boolean)) then
    raise exception 'a course is listed twice' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric, currently_taking boolean)
              where n.currently_taking and n.grade is not null) then
    raise exception 'A course you''re taking now can''t have a grade yet'
      using errcode = 'check_violation';
  end if;

  if tutor_grades_verified(uid) then
    if exists (
      select 1
        from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric, currently_taking boolean)
        left join public.tutor_courses t on t.tutor_id = uid and t.course_code = n.course_code
       where (t.id is null and not n.currently_taking)
          or (t.id is not null and (
                nullif(trim(t.grade), '') is distinct from n.grade
                or t.currently_taking is distinct from n.currently_taking
              ))
    ) then
      raise exception 'Your grades are verified, so they''re locked. You can still add a course you''re taking now. Contact noot support to change a grade.'
        using errcode = 'insufficient_privilege';
    end if;
    if jsonb_array_length(wanted) = 0 then
      raise exception 'Keep at least one course. Contact noot support to change your courses.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  delete from public.tutor_courses t
   where t.tutor_id = uid
     and not exists (
       select 1 from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric, currently_taking boolean)
        where n.course_code = t.course_code);

  insert into public.tutor_courses (tutor_id, course_code, grade, hourly_rate, currently_taking)
    select uid, n.course_code, n.grade, n.hourly_rate, n.currently_taking
      from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric, currently_taking boolean)
  on conflict (tutor_id, course_code)
    do update set grade = excluded.grade,
                  hourly_rate = excluded.hourly_rate,
                  currently_taking = excluded.currently_taking;
end $$;

revoke execute on function public.set_tutor_courses(jsonb) from public, anon;
grant execute on function public.set_tutor_courses(jsonb) to authenticated;
