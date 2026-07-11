-- 0008_ambassador.sql — Ambassador program foundation (Phase 1).
-- ⚠️ SECURITY-REVIEW: touches the SECURITY DEFINER auth trigger (handle_new_user) and
-- adds anti-fraud constraints. Referral bonuses are still created server-side only
-- (award-referral-bonus / seed) — never by the client.

-- 1) Anti-fraud: an ambassador can't refer themselves. (referred_user_id is already
--    unique, so a user can be referred at most once — that blocks duplicate referrals.)
alter table referrals
  add constraint referrals_no_self_referral check (ambassador_id <> referred_user_id);

-- 2) Referral attribution at signup. Extends handle_new_user to read an optional
--    referral_code from the new user's metadata and, if it matches an ambassador's code,
--    record the referral. A bad/absent code is silently ignored — it must never break
--    signup. Runs as the existing SECURITY DEFINER trigger (bypasses RLS to insert).
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  ref_code text := nullif(trim(new.raw_user_meta_data ->> 'referral_code'), '');
  amb_id uuid;
begin
  insert into public.users (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict do nothing;

  -- Attribute the referral if a valid, non-self code was supplied.
  if ref_code is not null then
    select user_id into amb_id from public.ambassador_profiles where referral_code = ref_code;
    if amb_id is not null and amb_id <> new.id then
      insert into public.referrals (ambassador_id, referred_user_id, referred_role, referral_code_used)
      values (amb_id, new.id, 'student', ref_code)
      on conflict (referred_user_id) do nothing;
      update public.ambassador_profiles
        set total_referrals = total_referrals + 1, updated_at = now()
        where user_id = amb_id;
    end if;
  end if;

  return new;
end $$;

-- 3) Server-side ambassador-profile creation with a unique, non-guessable code.
--    The client never chooses the code. Idempotent: returns the existing code if the
--    caller already has a profile. SECURITY DEFINER so it can generate + insert; it only
--    ever acts on auth.uid(), so a caller can only create their OWN profile.
create or replace function create_my_ambassador_profile()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing text;
  code text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  select referral_code into existing from ambassador_profiles where user_id = uid;
  if existing is not null then
    return existing;
  end if;
  loop
    code := 'NOOT-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from ambassador_profiles where referral_code = code);
  end loop;
  insert into ambassador_profiles (user_id, referral_code) values (uid, code);
  return code;
end $$;

grant execute on function create_my_ambassador_profile() to authenticated;
