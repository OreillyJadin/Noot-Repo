create table public.course_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  course_code text not null,
  status text not null default 'open' check (status in ('open', 'fulfilled', 'expired')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  fulfilled_at timestamptz
);

create unique index course_requests_open_student_course_uidx
  on public.course_requests (student_id, course_code)
  where status = 'open';
create index course_requests_open_course_created_idx
  on public.course_requests (course_code, created_at)
  where status = 'open';
create index course_requests_student_id_idx
  on public.course_requests (student_id);

alter table public.course_requests enable row level security;
create policy course_requests_select_own on public.course_requests for select to authenticated
  using (student_id = (select auth.uid()));
create policy active_user_only on public.course_requests as restrictive for all to authenticated
  using ((select public.is_active_user())) with check ((select public.is_active_user()));
revoke all on public.course_requests from public, anon, authenticated;
grant select on public.course_requests to authenticated;
grant all on public.course_requests to service_role;

create or replace function public.course_is_covered(p_course_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tutor_courses tc
    join public.tutor_profiles tp on tp.user_id = tc.tutor_id
    join public.users u on u.id = tc.tutor_id
    where tc.course_code = p_course_code
      and tp.approval_status = 'approved'
      and u.deleted_at is null
      and u.status = 'active'
  );
$$;
revoke all on function public.course_is_covered(text) from public, anon, authenticated;

create or replace function public.request_course_tutor(p_course_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_request public.course_requests%rowtype;
  v_created_count bigint;
begin
  if v_uid is null or not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;

  v_code := public.canonical_course_code(p_course_code);
  if v_code is null then
    raise exception 'Choose a course from the catalog.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 114));

  update public.course_requests
     set status = 'expired'
   where student_id = v_uid
     and course_code = v_code
     and status = 'open'
     and created_at <= now() - interval '30 days';

  select * into v_request
    from public.course_requests
   where student_id = v_uid
     and course_code = v_code
     and status = 'open'
     and created_at > now() - interval '30 days'
   limit 1;
  if found then
    return jsonb_build_object(
      'id', v_request.id,
      'courseCode', v_request.course_code,
      'status', v_request.status,
      'createdAt', v_request.created_at,
      'created', false
    );
  end if;

  select count(*) into v_created_count
    from public.course_requests
   where student_id = v_uid
     and created_at > now() - interval '24 hours';
  if v_created_count >= 5 then
    raise exception 'You can request up to 5 courses a day.' using errcode = 'P0001';
  end if;

  insert into public.course_requests (student_id, course_code)
  values (v_uid, v_code)
  returning * into v_request;

  return jsonb_build_object(
    'id', v_request.id,
    'courseCode', v_request.course_code,
    'status', v_request.status,
    'createdAt', v_request.created_at,
    'created', true
  );
end;
$$;
revoke all on function public.request_course_tutor(text) from public, anon;
grant execute on function public.request_course_tutor(text) to authenticated;

create or replace function public.fulfill_course_request_after_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.course_requests
     set status = 'fulfilled',
         fulfilled_at = now()
   where student_id = new.student_id
     and course_code = new.subject
     and status = 'open';
  return new;
exception when others then
  raise warning 'Could not fulfill course request for booking %: %', new.id, sqlerrm;
  return new;
end;
$$;
revoke all on function public.fulfill_course_request_after_booking() from public, anon, authenticated;
create trigger fulfill_course_request_after_booking
  after insert on public.bookings
  for each row execute function public.fulfill_course_request_after_booking();

create or replace function public.notify_course_requesters(p_tutor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_updated_id uuid;
begin
  if not exists (
    select 1
      from public.tutor_profiles tp
      join public.users u on u.id = tp.user_id
     where tp.user_id = p_tutor
       and tp.approval_status = 'approved'
       and u.status = 'active'
       and u.deleted_at is null
  ) then
    return;
  end if;

  for v_request in
    select cr.id, cr.student_id, cr.course_code
      from public.course_requests cr
      join public.users requester on requester.id = cr.student_id
      join public.tutor_courses tc on tc.course_code = cr.course_code and tc.tutor_id = p_tutor
     where cr.status = 'open'
       and cr.created_at > now() - interval '30 days'
       and cr.notified_at is null
       and requester.deleted_at is null
       and public.course_is_covered(cr.course_code)
  loop
    update public.course_requests
       set notified_at = now()
     where id = v_request.id
       and notified_at is null
    returning id into v_updated_id;

    if v_updated_id is not null then
      perform public.create_notification(
        v_request.student_id,
        'system',
        'A tutor for ' || v_request.course_code || ' is on Noot',
        'Tap to see who teaches it and book a session.',
        jsonb_build_object('event', 'course_request_covered', 'courseCode', v_request.course_code)
      );
    end if;
    v_updated_id := null;
  end loop;
end;
$$;
revoke all on function public.notify_course_requesters(uuid) from public, anon, authenticated;

create or replace function public.notify_course_requesters_after_course_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_course_requesters(new.tutor_id);
  return new;
exception when others then
  raise warning 'Could not notify course requesters after tutor course change: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.notify_course_requesters_after_course_change() from public, anon, authenticated;
create trigger notify_course_requesters_after_course_change
  after insert or update of course_code, tutor_id on public.tutor_courses
  for each row execute function public.notify_course_requesters_after_course_change();

create or replace function public.notify_course_requesters_after_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_course_requesters(new.user_id);
  return new;
exception when others then
  raise warning 'Could not notify course requesters after tutor approval: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.notify_course_requesters_after_approval() from public, anon, authenticated;
create trigger notify_course_requesters_after_approval
  after update of approval_status on public.tutor_profiles
  for each row
  when (new.approval_status = 'approved' and old.approval_status is distinct from new.approval_status)
  execute function public.notify_course_requesters_after_approval();

create or replace function public.search_courses(p_query text, p_limit int default 25)
returns table (
  course_code text,
  course_title text,
  subject_code text,
  subject_name text,
  credit_hours text,
  college_name text,
  has_tutor boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := trim(coalesce(p_query, ''));
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 50));
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;

  v_query := replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');

  return query
  with catalog as (
    select distinct on (c.course_code)
      c.course_code, c.course_title, c.subject_code, c.subject_name, c.credit_hours, c.college_name
    from public.courses c
    where c.is_active
    order by c.course_code, c.catalog_year desc, c.course_id
  ), matched as (
    select c.*,
      public.course_is_covered(c.course_code) as has_tutor,
      case
        when v_query <> '' and c.course_code ilike v_query || '%' escape '\' then 0
        else 1
      end as code_prefix_rank
    from catalog c
    where v_query = ''
       or c.course_code ilike v_query || '%' escape '\'
       or c.course_code ilike '%' || v_query || '%' escape '\'
       or c.course_title ilike '%' || v_query || '%' escape '\'
       or c.subject_name ilike '%' || v_query || '%' escape '\'
  )
  select m.course_code, m.course_title, m.subject_code, m.subject_name,
         m.credit_hours, m.college_name, m.has_tutor
    from matched m
   order by m.code_prefix_rank, m.has_tutor desc, m.course_code
   limit v_limit;
end;
$$;
revoke all on function public.search_courses(text, int) from public, anon;
grant execute on function public.search_courses(text, int) to authenticated;

create or replace function public.admin_course_requests()
returns table (
  course_code text,
  course_title text,
  requests bigint,
  latest_at timestamptz,
  covered boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() or not public.is_active_user() then
    raise exception 'Active admin with verified MFA required' using errcode = '42501';
  end if;

  return query
  with catalog as (
    select distinct on (c.course_code) c.course_code, c.course_title
      from public.courses c
     where c.is_active
     order by c.course_code, c.catalog_year desc, c.course_id
  )
  select cr.course_code,
         coalesce(c.course_title, cr.course_code),
         count(*)::bigint,
         max(cr.created_at),
         public.course_is_covered(cr.course_code)
    from public.course_requests cr
    join public.users requester on requester.id = cr.student_id
    left join catalog c on c.course_code = cr.course_code
   where cr.status = 'open'
     and cr.created_at > now() - interval '30 days'
     and requester.deleted_at is null
   group by cr.course_code, c.course_title
   order by count(*) desc, cr.course_code
   limit 50;
end;
$$;
revoke all on function public.admin_course_requests() from public, anon;
grant execute on function public.admin_course_requests() to authenticated;
