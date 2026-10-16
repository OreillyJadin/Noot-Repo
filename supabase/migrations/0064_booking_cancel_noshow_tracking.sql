alter table public.bookings
  add column cancelled_by_role text check (cancelled_by_role in ('student', 'tutor')),
  add column cancelled_from_status text check (cancelled_from_status in ('pending', 'confirmed')),
  add column no_show_party text check (no_show_party in ('student', 'tutor'));

update public.bookings
   set no_show_party = case when refund_percent = 100 then 'tutor' else 'student' end
 where status = 'no_show';

update public.bookings
   set cancelled_by_role = 'tutor',
       cancelled_from_status = 'pending'
 where cancel_reason = 'tutor_declined';

update public.bookings
   set cancelled_from_status = 'pending'
 where cancel_reason = 'tutor_no_response';

create index bookings_tutor_confirmed_cancels_idx
  on public.bookings (tutor_id, cancelled_at)
  where cancelled_by_role = 'tutor' and cancelled_from_status = 'confirmed';

drop function if exists public.admin_list_users(text, text, text, int, int);

create function public.admin_list_users(
  p_search text default '',
  p_role   text default null,
  p_status text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id uuid, first_name text, last_name text, email text, status text,
  deleted_at timestamptz, created_at timestamptz, roles text[], total bigint,
  tutor_cancels_30d bigint, no_shows bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_like text := '%' || replace(replace(replace(lower(trim(coalesce(p_search, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if not is_admin() then
    raise exception 'only an admin can list accounts' using errcode = 'insufficient_privilege';
  end if;
  if p_role is not null and p_role not in ('student', 'tutor', 'ambassador', 'admin') then
    raise exception 'unknown account type' using errcode = 'check_violation';
  end if;
  if p_status is not null and p_status not in ('active', 'suspended', 'banned', 'deleted') then
    raise exception 'unknown status' using errcode = 'check_violation';
  end if;

  return query
  with listed as (
    select u.id, u.first_name, u.last_name, u.email,
           case when u.deleted_at is not null then 'deleted' else u.status::text end as status,
           u.deleted_at, u.created_at,
           coalesce((select array_agg(r.role::text order by r.role) from user_roles r where r.user_id = u.id), '{}') as roles
      from users u
  )
  select l.id, l.first_name, l.last_name, l.email, l.status, l.deleted_at, l.created_at, l.roles,
         count(*) over () as total,
         (select count(*)
            from bookings b
           where b.tutor_id = l.id
             and b.cancelled_by_role = 'tutor'
             and b.cancelled_from_status = 'confirmed'
             and b.cancelled_at >= now() - interval '30 days') as tutor_cancels_30d,
         (select count(*)
            from bookings b
           where (b.student_id = l.id and b.no_show_party = 'student')
              or (b.tutor_id = l.id and b.no_show_party = 'tutor')) as no_shows
    from listed l
   where ((p_status is null and l.status <> 'deleted') or l.status = p_status)
     and (p_role is null
          or (p_role = 'student' and l.roles <@ array['student'])
          or (p_role <> 'student' and p_role = any (l.roles)))
     and (v_like = '%%'
          or (l.deleted_at is null
              and (lower(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')) like v_like escape '\'
                   or lower(l.email) like v_like escape '\')))
   order by l.created_at desc, l.id
   limit v_limit offset v_offset;
end $$;

revoke execute on function public.admin_list_users(text, text, text, int, int) from public, anon;
grant execute on function public.admin_list_users(text, text, text, int, int) to authenticated;

create function public.admin_user_history(p_user uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user jsonb;
  v_counts jsonb;
  v_bookings jsonb;
  v_reports jsonb;
  v_admin_actions jsonb;
begin
  if not is_admin() then
    raise exception 'only an admin can view user history' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
           'id', u.id,
           'first_name', u.first_name,
           'last_name', u.last_name,
           'email', u.email,
           'status', case when u.deleted_at is not null then 'deleted' else u.status::text end,
           'created_at', u.created_at,
           'roles', coalesce(
             (select jsonb_agg(r.role::text order by r.role) from user_roles r where r.user_id = u.id),
             '[]'::jsonb
           )
         )
    into v_user
    from users u
   where u.id = p_user;

  select jsonb_build_object(
           'sessions_as_student', (select count(*) from bookings b where b.student_id = p_user),
           'sessions_as_tutor', (select count(*) from bookings b where b.tutor_id = p_user),
           'completed_as_student', (select count(*) from bookings b where b.student_id = p_user and b.status = 'completed'),
           'completed_as_tutor', (select count(*) from bookings b where b.tutor_id = p_user and b.status = 'completed'),
           'student_cancels_full', (
             select count(*) from bookings b
              where b.student_id = p_user
                and b.cancelled_by_role = 'student'
                and b.cancelled_from_status = 'confirmed'
                and b.refund_percent = 100
           ),
           'student_cancels_partial', (
             select count(*) from bookings b
              where b.student_id = p_user
                and b.cancelled_by_role = 'student'
                and b.cancelled_from_status = 'confirmed'
                and b.refund_percent < 100
           ),
           'student_request_cancels', (
             select count(*) from bookings b
              where b.student_id = p_user
                and b.cancelled_by_role = 'student'
                and b.cancelled_from_status = 'pending'
           ),
           'tutor_cancels', (
             select count(*) from bookings b
              where b.tutor_id = p_user
                and b.cancelled_by_role = 'tutor'
                and b.cancelled_from_status = 'confirmed'
           ),
           'tutor_cancels_30d', (
             select count(*) from bookings b
              where b.tutor_id = p_user
                and b.cancelled_by_role = 'tutor'
                and b.cancelled_from_status = 'confirmed'
                and b.cancelled_at >= now() - interval '30 days'
           ),
           'tutor_declines', (
             select count(*) from bookings b
              where b.tutor_id = p_user and b.cancel_reason = 'tutor_declined'
           ),
           'requests_expired', (
             select count(*) from bookings b
              where b.tutor_id = p_user and b.cancel_reason = 'tutor_no_response'
           ),
           'no_shows_as_student', (
             select count(*) from bookings b
              where b.student_id = p_user and b.no_show_party = 'student'
           ),
           'no_shows_as_tutor', (
             select count(*) from bookings b
              where b.tutor_id = p_user and b.no_show_party = 'tutor'
           ),
           'reports_received', (
             select count(*) from content_reports r
              where r.target_user_id = p_user
                 or exists (
                      select 1 from messages m
                       where m.id = r.target_message_id and m.sender_id = p_user
                    )
                 or exists (
                      select 1 from reviews rv
                       where rv.id = r.target_review_id and rv.reviewer_id = p_user
                    )
           ),
           'reports_filed', (select count(*) from content_reports r where r.reporter_id = p_user)
         )
    into v_counts;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', b.id,
               'scheduled_at', b.scheduled_at,
               'subject', b.subject,
               'status', b.status,
               'role', case when b.student_id = p_user then 'student' else 'tutor' end,
               'counterpart_name', coalesce(nullif(trim(concat_ws(' ', counterpart.first_name, counterpart.last_name)), ''), 'Deleted account'),
               'price', b.price,
               'refund_percent', b.refund_percent,
               'cancelled_by_role', b.cancelled_by_role,
               'cancelled_from_status', b.cancelled_from_status,
               'cancel_reason', b.cancel_reason,
               'no_show_party', b.no_show_party
             )
             order by b.scheduled_at desc
           ),
           '[]'::jsonb
         )
    into v_bookings
    from (
      select b.*
        from bookings b
       where b.student_id = p_user or b.tutor_id = p_user
       order by b.scheduled_at desc
       limit 50
    ) b
    left join users counterpart
      on counterpart.id = case when b.student_id = p_user then b.tutor_id else b.student_id end;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', r.id,
               'target_kind', r.target_kind,
               'reason', r.reason,
               'detail', r.detail,
               'status', r.status,
               'created_at', r.created_at
             )
             order by r.created_at desc
           ),
           '[]'::jsonb
         )
    into v_reports
    from (
      select r.*
        from content_reports r
       where r.target_user_id = p_user
          or exists (
               select 1 from messages m
                where m.id = r.target_message_id and m.sender_id = p_user
             )
          or exists (
               select 1 from reviews rv
                where rv.id = r.target_review_id and rv.reviewer_id = p_user
             )
       order by r.created_at desc
       limit 50
    ) r;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'action', a.action,
               'actor_name', coalesce(nullif(trim(concat_ws(' ', actor.first_name, actor.last_name)), ''), 'Deleted account'),
               'details', a.details,
               'created_at', a.created_at
             )
             order by a.created_at desc
           ),
           '[]'::jsonb
         )
    into v_admin_actions
    from (
      select a.*
        from admin_actions a
       where a.target_id = p_user::text
       order by a.created_at desc
       limit 50
    ) a
    left join users actor on actor.id = a.actor_id;

  return jsonb_build_object(
    'user', v_user,
    'counts', v_counts,
    'bookings', v_bookings,
    'reports', v_reports,
    'admin_actions', v_admin_actions
  );
end;
$$;

revoke execute on function public.admin_user_history(uuid) from public, anon;
grant execute on function public.admin_user_history(uuid) to authenticated;
