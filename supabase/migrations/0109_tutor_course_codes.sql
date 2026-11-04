-- Codes are not globally unique across catalog years/universities, so validate against
-- distinct catalog spellings rather than adding a single-column foreign key.
create index courses_normalized_code_idx on public.courses
  ((regexp_replace(upper(course_code), '[[:space:]]', '', 'g')));

create function public.canonical_course_code(p_code text)
returns text language sql stable set search_path = '' as $$
  select case
    when bool_or(c.course_code = p_code) then p_code
    when count(distinct c.course_code) = 1 then min(c.course_code)
    else null
  end
  from public.courses c
  where regexp_replace(upper(c.course_code), '[[:space:]]', '', 'g')
      = regexp_replace(upper(p_code), '[[:space:]]', '', 'g');
$$;
revoke all on function public.canonical_course_code(text) from public, anon;
grant execute on function public.canonical_course_code(text) to authenticated, service_role;

-- Preserve conflicting legacy settings before merging aliases into one offering.
create table public.tutor_course_code_archive (
  id uuid primary key,
  retained_id uuid not null,
  original_row jsonb not null,
  archived_at timestamptz not null default now()
);
alter table public.tutor_course_code_archive enable row level security;
revoke all on public.tutor_course_code_archive from public, anon, authenticated;
grant all on public.tutor_course_code_archive to service_role;

do $$
declare
  r record;
  kept_id uuid;
begin
  for r in
    select t.*, public.canonical_course_code(t.course_code) as canonical
    from public.tutor_courses t
    order by (t.course_code = public.canonical_course_code(t.course_code)) desc,
      t.created_at, t.id
  loop
    if r.canonical is null then
      raise notice 'Retaining unmatched or ambiguous tutor course % (row %)', r.course_code, r.id;
    elsif r.course_code <> r.canonical then
      select t.id into kept_id from public.tutor_courses t
        where t.tutor_id = r.tutor_id and t.course_code = r.canonical;
      if kept_id is not null then
        insert into public.tutor_course_code_archive (id, retained_id, original_row)
          values (r.id, kept_id, to_jsonb(r) - 'canonical');
        update public.tutor_courses set sessions = sessions + r.sessions where id = kept_id;
        delete from public.tutor_courses where id = r.id;
        raise notice 'Archived duplicate tutor course row % into %, canonical %', r.id, kept_id, r.canonical;
      else
        update public.tutor_courses set course_code = r.canonical where id = r.id;
      end if;
    end if;
  end loop;
end;
$$;

create function public.validate_tutor_course_code()
returns trigger language plpgsql set search_path = '' as $$
declare
  canonical text;
begin
  canonical := public.canonical_course_code(new.course_code);
  if canonical is not null then
    new.course_code := canonical;
  elsif not exists (
    select 1 from public.tutor_courses t
    where t.tutor_id = new.tutor_id and t.course_code = new.course_code
  ) then
    raise exception 'Choose a course from the catalog.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_tutor_course_code() from public, anon, authenticated;
create trigger a_validate_tutor_course_code
  before insert or update of course_code, tutor_id on public.tutor_courses
  for each row execute function public.validate_tutor_course_code();

-- Normalize before duplicate/grade-lock checks and upsert conflict selection. Existing
-- unmatched rows remain editable, but the trigger refuses new unmatched offerings.
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
           'course_code', coalesce(public.canonical_course_code(c.course_code), c.course_code),
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
              where coalesce(trim(n.course_code), '') = '' or n.hourly_rate is null) then
    raise exception 'every course needs a code and a rate' using errcode = 'check_violation';
  end if;
  if exists (select 1 from jsonb_to_recordset(wanted) as n(course_code text, grade text, hourly_rate numeric, currently_taking boolean)
              where n.hourly_rate < 20 or n.hourly_rate > 120) then
    raise exception 'rates are $20 to $120 an hour' using errcode = 'check_violation';
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
