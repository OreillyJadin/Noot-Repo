-- 0051_enforce_user_status.sql — block existing tokens for inactive accounts.

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and status = 'active');
$$;
revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

create policy active_user_only on public.ambassador_approvals as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.ambassador_milestones as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.ambassador_profiles as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.analytics_events as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.availability_overrides as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.blocked_terms as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.bookings as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.campuses as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.content_reports as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.conversations as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.courses as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.credit_cashouts as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.credit_ledger as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.invite_codes as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.message_attachments as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.messages as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.notifications as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.push_tokens as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.referral_bonuses as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.referrals as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.reviews as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.saved_tutors as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.tutor_availability as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.tutor_courses as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.tutor_interviews as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.tutor_profiles as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.tutoring_locations as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.user_blocks as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.user_roles as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on public.users as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));
create policy active_user_only on storage.objects as restrictive for all to authenticated using ((select public.is_active_user())) with check ((select public.is_active_user()));

create or replace function public.cancel_tutor_interview(p_tutor uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if not is_admin() then
    raise exception 'only an admin can cancel an interview' using errcode = 'insufficient_privilege';
  end if;
  update tutor_interviews set cancelled_at = now()
   where tutor_id = p_tutor and cancelled_at is null
   returning scheduled_at into v_at;
  if v_at is null then return false; end if;
  -- No need to tell them about an interview that had already passed.
  if v_at > now() then
    perform create_notification(
      p_tutor, 'system', 'Your noot interview was cancelled',
      'The interview on ' || interview_time_label(v_at) || ' is off. We’ll be in touch with a new time.',
      jsonb_build_object('scheduledAt', v_at)
    );
  end if;
  return true;
end $$;
revoke execute on function public.cancel_tutor_interview(uuid) from public, anon;
grant execute on function public.cancel_tutor_interview(uuid) to authenticated;

create or replace function public.claim_invite(p_code text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  c text := upper(trim(coalesce(p_code, '')));
  inviter uuid;
  n int;
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  select user_id into inviter from invite_codes where code = c;
  if inviter is null then
    raise exception 'That invite code doesn''t exist.';
  end if;
  if inviter = uid then
    raise exception 'You can''t use your own invite code.';
  end if;
  if exists (select 1 from referrals where referred_user_id = uid) then
    raise exception 'You''ve already used an invite code.';
  end if;
  if exists (select 1 from bookings where student_id = uid or tutor_id = uid) then
    raise exception 'Invite codes can only be used before your first session.';
  end if;
  -- auth.users, not public.users: the owner can update their own public.users row, so its
  -- created_at can't be trusted. `is not true` so a missing row refuses instead of allowing.
  if ((select created_at from auth.users where id = inviter) < (select created_at from auth.users where id = uid)) is not true then
    raise exception 'You can only use the code of someone who joined before you.';
  end if;
  insert into redeemed_invite_emails (email_hash)
  select invite_email_hash(email) from auth.users where id = uid
  on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'You''ve already used an invite code.';
  end if;
  insert into referrals (ambassador_id, referred_user_id, referred_role, referral_code_used)
  values (inviter, uid, 'student', c);
  update ambassador_profiles
    set total_referrals = total_referrals + 1, updated_at = now()
    where user_id = inviter;
end $$;
revoke execute on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

create or replace function public.create_my_ambassador_profile()
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text;
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  c := my_invite_code();
  insert into ambassador_profiles (user_id, referral_code) values (uid, c)
  on conflict (user_id) do nothing;
  return (select referral_code from ambassador_profiles where user_id = uid);
end $$;
revoke execute on function public.create_my_ambassador_profile() from public, anon;
grant execute on function public.create_my_ambassador_profile() to authenticated;

create or replace function public.request_credit_cashout(p_cents int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if not is_approved_ambassador(uid) then
    raise exception 'Cash-out opens once our team approves you as an ambassador.';
  end if;
  if p_cents is null or p_cents < 1000 then
    raise exception 'You can cash out $10 or more.';
  end if;
  perform credit_lock(uid);
  if credit_balance_cents(uid) < p_cents then
    raise exception 'That''s more than your credit balance.';
  end if;
  if credit_cashable_cents(uid) < p_cents then
    raise exception 'Credit earned in the last 7 days can''t be cashed out yet.';
  end if;
  insert into credit_cashouts (user_id, amount_cents) values (uid, p_cents) returning id into cid;
  insert into credit_ledger (user_id, amount_cents, kind, cashout_id) values (uid, -p_cents, 'cashout', cid);
  return cid;
end $$;
revoke execute on function public.request_credit_cashout(int) from public, anon;
grant execute on function public.request_credit_cashout(int) to authenticated;

create or replace function public.schedule_tutor_interview(p_tutor uuid, p_at timestamptz, p_details text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_details text := left(trim(coalesce(p_details, '')), 500);
  v_id uuid;
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if not is_admin() then
    raise exception 'only an admin can schedule an interview' using errcode = 'insufficient_privilege';
  end if;
  if p_tutor is null or p_at is null then
    raise exception 'a tutor and a time are required' using errcode = 'check_violation';
  end if;
  -- Two admins scheduling the same tutor at once: one waits for the other, then replaces
  -- their time, rather than failing on the one-live-interview index.
  perform pg_advisory_xact_lock(hashtext('tutor_interview:' || p_tutor::text));
  -- Only someone who has actually applied (a submitted application) and still has an account.
  if not exists (
    select 1 from tutor_profiles tp join users u on u.id = tp.user_id
     where tp.user_id = p_tutor and tp.submitted_at is not null and u.deleted_at is null
  ) then
    raise exception 'this person has not submitted a tutor application' using errcode = 'check_violation';
  end if;
  if p_at <= now() then
    raise exception 'pick a time in the future' using errcode = 'check_violation';
  end if;
  if p_at > now() + interval '60 days' then
    raise exception 'pick a time within the next 60 days' using errcode = 'check_violation';
  end if;

  update tutor_interviews set cancelled_at = now() where tutor_id = p_tutor and cancelled_at is null;
  insert into tutor_interviews (tutor_id, scheduled_at, details, scheduled_by)
  values (p_tutor, p_at, v_details, auth.uid())
  returning id into v_id;

  perform create_notification(
    p_tutor, 'system', 'Your noot interview is scheduled',
    interview_time_label(p_at) || case when v_details <> '' then ' · ' || v_details else '' end,
    jsonb_build_object('interviewId', v_id, 'scheduledAt', p_at)
  );
  return v_id;
end $$;
revoke execute on function public.schedule_tutor_interview(uuid, timestamptz, text) from public, anon;
grant execute on function public.schedule_tutor_interview(uuid, timestamptz, text) to authenticated;

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
revoke execute on function public.set_tutor_courses(jsonb) from public, anon;
grant execute on function public.set_tutor_courses(jsonb) to authenticated;

create or replace function public.sign_tutor_agreement(signed_name text, version text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  stamped timestamptz := now();
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(signed_name), '') = '' or coalesce(trim(version), '') = '' then
    raise exception 'type your full name to sign' using errcode = 'check_violation';
  end if;
  insert into tutor_profiles (user_id) values (uid) on conflict (user_id) do nothing;
  update tutor_profiles
     set agreement_signed_at = stamped,
         agreement_signed_name = trim(signed_name),
         agreement_version = trim(version),
         updated_at = now()
   where user_id = uid;
  return stamped;
end $$;
revoke execute on function public.sign_tutor_agreement(text, text) from public, anon;
grant execute on function public.sign_tutor_agreement(text, text) to authenticated;

create or replace function public.submit_tutor_application()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  missing text[];
  status approval_status;
  stamped timestamptz := now();
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  select approval_status into status from tutor_profiles where user_id = uid;
  if status = 'approved' then
    raise exception 'already approved' using errcode = 'check_violation';
  end if;
  missing := tutor_application_missing(uid);
  if missing is null or cardinality(missing) > 0 then
    raise exception 'application incomplete: %', array_to_string(coalesce(missing, array['profile']), ', ')
      using errcode = 'check_violation';
  end if;
  -- A rejected applicant who fixes things and resubmits goes back into the queue.
  update tutor_profiles
     set submitted_at = stamped,
         approval_status = 'pending',
         reviewed_by = null,
         reviewed_at = null,
         updated_at = now()
   where user_id = uid;
  return stamped;
end $$;
revoke execute on function public.submit_tutor_application() from public, anon;
grant execute on function public.submit_tutor_application() to authenticated;

create or replace function public.my_invite_code()
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  existing text;
  candidate text;
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  select code into existing from invite_codes where user_id = uid;
  if existing is not null then
    return existing;
  end if;
  loop
    candidate := 'NOOT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from invite_codes where code = candidate)
          and not exists (select 1 from ambassador_profiles where referral_code = candidate);
  end loop;
  insert into invite_codes (user_id, code) values (uid, candidate) on conflict (user_id) do nothing;
  select code into existing from invite_codes where user_id = uid;
  return existing;
end $$;
revoke execute on function public.my_invite_code() from public, anon;
grant execute on function public.my_invite_code() to authenticated;

create or replace function public.my_credit_balance()
returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  return credit_balance_cents(auth.uid());
end $$;
revoke execute on function public.my_credit_balance() from public, anon;
grant execute on function public.my_credit_balance() to authenticated;

create or replace function public.my_cashable_credit()
returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  return case
    when is_approved_ambassador(auth.uid()) then credit_cashable_cents(auth.uid())
    else 0
  end;
end $$;
revoke execute on function public.my_cashable_credit() from public, anon;
grant execute on function public.my_cashable_credit() to authenticated;

create or replace function public.my_invites()
returns table (
  referral_id  uuid,
  display_name text,
  joined_at    timestamptz,
  completed    boolean,
  reversed     boolean, -- that session was refunded or disputed; the $5 was taken back
  reward_cents int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_user() then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  return query
  select r.id,
         trim(coalesce(u.first_name, '') || ' ' || coalesce(nullif(left(u.last_name, 1), '') || '.', '')),
         r.created_at,
         l.id is not null,
         b.credit_reversed_at is not null,
         coalesce(l.amount_cents, 0) + coalesce(v.amount_cents, 0) -- net of any reversal
    from referrals r
    left join users u on u.id = r.referred_user_id
    left join credit_ledger l on l.referral_id = r.id and l.kind = 'invite_reward'
    left join bookings b on b.id = l.booking_id
    left join credit_ledger v on v.referral_id = r.id and v.kind = 'reward_reversal'
   where r.ambassador_id = auth.uid()
   order by r.created_at desc;
end $$;
revoke execute on function public.my_invites() from public, anon;
grant execute on function public.my_invites() to authenticated;
