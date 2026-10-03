-- 0040_noot_credits.sql — Noot credits: invite a friend, earn credit, spend it on sessions.
-- ⚠️ SECURITY-REVIEW: money. Every balance change is a row in credit_ledger, written only by
-- the SECURITY DEFINER functions below (service role or the caller acting on themselves).
-- Clients can read their own rows and nothing else; there are no client write policies.
--
-- The rules (decided with Jadin 2026-10-02):
--   • Anyone can invite — every user gets an invite code, not only ambassadors.
--   • The INVITER earns a $5 credit once the person they invited completes a session
--     (as a student or as a tutor). Nothing is earned for a signup on its own.
--   • Credit comes off the next booking automatically. The tutor's payout is unchanged —
--     noot absorbs the difference (create-payment-intent / confirm-booking).
--   • Cancelled booking → the credit comes back in the same proportion as the cash refund.
--   • No reward for a session between the inviter and the person they invited.
--   • Ambassadors whom the TEAM has approved (ambassador_approvals) also earn milestone
--     bonuses (ambassador_milestones — placeholder amounts) and can cash credit out, except
--     credit earned in the last 7 days. Joining as an ambassador alone unlocks neither.

-- ---------------------------------------------------------------------------------------
-- 1) Invite codes, one per user. ambassador_profiles.referral_code stays as a mirror for
--    ambassadors, but this is now the source of truth.
-- ---------------------------------------------------------------------------------------
create table invite_codes (
  user_id    uuid primary key references users(id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now()
);
alter table invite_codes enable row level security;
create policy invite_codes_select on invite_codes for select to authenticated
  using (user_id = auth.uid() or is_admin());
-- No insert/update/delete policies: codes are generated server-side by my_invite_code().

-- Codes ambassadors have already shared keep working.
insert into invite_codes (user_id, code)
select user_id, referral_code from ambassador_profiles
on conflict do nothing;

-- The caller's code, generated on first use. Never client-chosen.
create or replace function my_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  existing text;
  candidate text;
begin
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
revoke execute on function my_invite_code() from public, anon;
grant execute on function my_invite_code() to authenticated;

-- Becoming an ambassador reuses your invite code, so you never have two.
create or replace function create_my_ambassador_profile()
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  c := my_invite_code();
  insert into ambassador_profiles (user_id, referral_code) values (uid, c)
  on conflict (user_id) do nothing;
  return (select referral_code from ambassador_profiles where user_id = uid);
end $$;

-- ---------------------------------------------------------------------------------------
-- 2) Referrals: `ambassador_id` is now the INVITER, who may be any user. The column keeps
--    its name so existing functions and seeds keep working.
-- ---------------------------------------------------------------------------------------
comment on column referrals.ambassador_id is 'The inviter. Any user since 0040, not only ambassadors.';

-- Invites are no longer read from the sign-up metadata: whoever requests a link for an
-- address sets that metadata, so a code there can't be trusted to be the address owner's.
-- (See claim_invite below.) Otherwise unchanged from 0008.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
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

  return new;
end $$;

-- One invite per EMAIL, not per account: a new account for the same person (after
-- delete-account, which keeps a scrubbed users row but frees the address) must not be able
-- to redeem again. Server-only.
create table redeemed_invite_emails (
  email_hash text primary key,
  created_at timestamptz not null default now()
);
alter table redeemed_invite_emails enable row level security;
-- No policies: only the SECURITY DEFINER functions here read or write it.

-- Normalized first: lower-case, and "+tag" sub-addresses (a+1@x reaches a@x) count as one.
create or replace function invite_email_hash(p_email text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(
    regexp_replace(lower(trim(coalesce(p_email, ''))), '\+[^@]*@', '@'), 'UTF8')), 'hex');
$$;

-- A friend's code is typed on the sign-up screen; the app keeps it and claims it as the new
-- account right after it first signs in (i.e. by whoever controls the inbox). Rules:
--   • once per person (no referral yet; one invite per email, ever) and before any booking;
--   • never your own code;
--   • only the code of an account created BEFORE yours — so invites point back in time and
--     a loop (A→B→A, A→B→C→A, …) can't form, whenever the claim is made.
create or replace function claim_invite(p_code text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  c text := upper(trim(coalesce(p_code, '')));
  inviter uuid;
  n int;
begin
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
revoke execute on function claim_invite(text) from public, anon;
grant execute on function claim_invite(text) to authenticated;

-- Lets the sign-up screen say "code applied" / "not found" before the account exists, so
-- anon may call it. Reveals only whether a code exists — never whose it is.
create or replace function check_invite_code(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from invite_codes where code = upper(trim(coalesce(p_code, ''))));
$$;
revoke execute on function check_invite_code(text) from public;
grant execute on function check_invite_code(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- 3) Ambassador milestones. PLACEHOLDER amounts — the team will set the real ones. Edit
--    rows in Studio; no app update needed.
-- ---------------------------------------------------------------------------------------
create table ambassador_milestones (
  threshold   int primary key check (threshold > 0),
  bonus_cents int not null check (bonus_cents > 0)
);
alter table ambassador_milestones enable row level security;
create policy ambassador_milestones_select on ambassador_milestones for select to authenticated
  using (true);
insert into ambassador_milestones (threshold, bonus_cents) values
  (5, 2500), (10, 5000), (25, 15000), (50, 35000), (100, 80000);

-- Team approval for an ambassador's cash-out and milestone bonuses. Its own table because
-- the owner can update their ambassador_profiles row. Written by the team (Studio for now).
create table ambassador_approvals (
  user_id     uuid primary key references users(id) on delete cascade,
  approved_at timestamptz not null default now(),
  approved_by uuid references users(id) on delete set null
);
alter table ambassador_approvals enable row level security;
create policy ambassador_approvals_select on ambassador_approvals for select to authenticated
  using (user_id = auth.uid() or is_admin());

create or replace function is_approved_ambassador(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = p_user and role = 'ambassador')
     and exists (select 1 from ambassador_approvals where user_id = p_user);
$$;
revoke execute on function is_approved_ambassador(uuid) from public, anon, authenticated;
grant execute on function is_approved_ambassador(uuid) to service_role;

-- Becoming an ambassador after approval also pays the goals already reached.
create or replace function on_ambassador_role_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'ambassador' then
    perform award_milestones(new.user_id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------
-- 4) Cash-out requests (ambassadors only). Paid by the team by hand for now; marking one
--    'rejected' does NOT return the credit automatically — add an 'adjustment' row.
-- ---------------------------------------------------------------------------------------
create type cashout_status as enum ('pending', 'paid', 'rejected');
create table credit_cashouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references users(id) on delete set null,  -- kept for the audit trail
  amount_cents int not null check (amount_cents >= 1000),
  status       cashout_status not null default 'pending',
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index credit_cashouts_user_idx on credit_cashouts (user_id);
alter table credit_cashouts enable row level security;
create policy credit_cashouts_select on credit_cashouts for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- ---------------------------------------------------------------------------------------
-- 5) The ledger. Append-only: the balance is the sum of a user's rows.
-- ---------------------------------------------------------------------------------------
create type credit_kind as enum (
  'invite_reward',   -- +500 when someone you invited completes a session
  'milestone_bonus', -- + ambassador_milestones.bonus_cents
  'booking_spend',   -- − credit taken off a booking
  'booking_return',  -- + credit given back when that booking is cancelled
  'cashout',         -- − an ambassador's cash-out request
  'reward_reversal', -- − an invite_reward taken back (its session was refunded or disputed)
  'adjustment'       -- ± by the team (e.g. a rejected cash-out)
);
create table credit_ledger (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete set null,  -- kept for the audit trail
  amount_cents      int not null check (amount_cents <> 0),
  kind              credit_kind not null,
  referral_id       uuid references referrals(id) on delete set null,
  booking_id        uuid references bookings(id) on delete set null,
  payment_intent_id text,
  milestone         int,
  cashout_id        uuid references credit_cashouts(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index credit_ledger_user_idx on credit_ledger (user_id);
-- Idempotency: each event can credit or debit at most once.
create unique index credit_ledger_one_reward  on credit_ledger (referral_id)         where kind = 'invite_reward';
create unique index credit_ledger_one_bonus   on credit_ledger (user_id, milestone)  where kind = 'milestone_bonus';
create unique index credit_ledger_one_spend   on credit_ledger (payment_intent_id)   where kind = 'booking_spend';
create unique index credit_ledger_one_cashout on credit_ledger (cashout_id)          where kind = 'cashout';
create unique index credit_ledger_one_reversal on credit_ledger (referral_id)        where kind = 'reward_reversal';
-- confirm-booking gives an unused spend back as an adjustment keyed by its PaymentIntent.
create unique index credit_ledger_one_refund  on credit_ledger (payment_intent_id)   where kind = 'adjustment' and payment_intent_id is not null;
alter table credit_ledger enable row level security;
create policy credit_ledger_select on credit_ledger for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- One booking per PaymentIntent. confirm-booking checked this with a read, so two confirms at
-- once (double tap, retry) could both insert. Production had no duplicates (checked 2026-10-03).
create unique index bookings_one_per_payment_intent on bookings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Set by reverse_invite_rewards when the session is fully refunded or disputed: it earns no
-- invite reward and doesn't count toward goals. Also what makes the reversal once-only.
alter table bookings add column credit_reversed_at timestamptz;

alter table bookings add column credit_applied numeric(10,2) not null default 0
  check (credit_applied >= 0 and credit_applied <= price);

-- Internal: a user's balance. Callers that then debit must hold credit_lock(uid) first.
create or replace function credit_balance_cents(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount_cents), 0)::int from credit_ledger where user_id = p_user;
$$;
revoke execute on function credit_balance_cents(uuid) from public, anon, authenticated;
grant execute on function credit_balance_cents(uuid) to service_role;

create or replace function credit_lock(p_user uuid)
returns void language sql security definer set search_path = public as $$
  select pg_advisory_xact_lock(hashtext('noot_credit:' || p_user::text));
$$;
revoke execute on function credit_lock(uuid) from public, anon, authenticated;
grant execute on function credit_lock(uuid) to service_role;

create or replace function my_credit_balance()
returns int language sql stable security definer set search_path = public as $$
  select credit_balance_cents(auth.uid());
$$;
revoke execute on function my_credit_balance() from public, anon;
grant execute on function my_credit_balance() to authenticated;

-- ---------------------------------------------------------------------------------------
-- 6) Earning. Called by award-referral-bonus (service role) after complete-session.
--    Rewards whoever invited the student and whoever invited the tutor of a completed
--    booking, once per invited person ever, then any ambassador milestone it unlocks.
-- ---------------------------------------------------------------------------------------
-- Milestone bonuses an approved ambassador has reached, paid once each. Counts every reward
-- they've earned (not ones whose session was later refunded or disputed), so approval pays
-- out goals reached before it (see the trigger below).
create or replace function award_milestones(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  done int;
begin
  if not is_approved_ambassador(p_user) then
    return;
  end if;
  select count(*) into done
    from credit_ledger l left join bookings b on b.id = l.booking_id
   where l.user_id = p_user and l.kind = 'invite_reward' and b.credit_reversed_at is null;
  insert into credit_ledger (user_id, amount_cents, kind, milestone)
  select p_user, m.bonus_cents, 'milestone_bonus', m.threshold
    from ambassador_milestones m where m.threshold <= done
  on conflict (user_id, milestone) where kind = 'milestone_bonus' do nothing;
end $$;
revoke execute on function award_milestones(uuid) from public, anon, authenticated;
grant execute on function award_milestones(uuid) to service_role;

create or replace function on_ambassador_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform award_milestones(new.user_id);
  return new;
end $$;
create trigger ambassador_approvals_award after insert on ambassador_approvals
  for each row execute function on_ambassador_approved();
create trigger user_roles_ambassador_award after insert on user_roles
  for each row execute function on_ambassador_role_added();

create or replace function award_invite_rewards(p_booking uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  b record;
  r record;
  awarded int := 0;
  n int;
begin
  -- FOR UPDATE: a concurrent reverse_invite_rewards (which updates this row) can't slip in
  -- between this check and the reward insert.
  select id, student_id, tutor_id, status, credit_reversed_at into b from bookings where id = p_booking for update;
  -- Refunded in full or disputed (e.g. before a complete-session retry got here): no reward.
  if b.id is null or b.status <> 'completed' or b.credit_reversed_at is not null then
    return 0;
  end if;
  for r in
    select id, ambassador_id from referrals
     where referred_user_id in (b.student_id, b.tutor_id)
       -- a session with the person who invited you earns them nothing (no self-dealing)
       and ambassador_id not in (b.student_id, b.tutor_id)
       -- referrals already handled under the old cash bonus (paid or converted above)
       and not exists (select 1 from referral_bonuses rb where rb.referral_id = referrals.id)
  loop
    insert into credit_ledger (user_id, amount_cents, kind, referral_id, booking_id)
    values (r.ambassador_id, 500, 'invite_reward', r.id, b.id)
    on conflict (referral_id) where kind = 'invite_reward' do nothing;
    get diagnostics n = row_count;
    awarded := awarded + n;
    if n > 0 then
      perform award_milestones(r.ambassador_id);
    end if;
  end loop;
  return awarded;
end $$;
revoke execute on function award_invite_rewards(uuid) from public, anon, authenticated;
grant execute on function award_invite_rewards(uuid) to service_role;

-- ---------------------------------------------------------------------------------------
-- 7) Spending and returning (service role, from the booking Edge Functions).
-- ---------------------------------------------------------------------------------------
create or replace function spend_credit(p_user uuid, p_cents int, p_payment_intent text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_cents is null or p_cents <= 0 then
    raise exception 'credit to spend must be positive';
  end if;
  perform credit_lock(p_user);
  -- Checked before the balance: a second confirm of the same checkout must read as "already
  -- spent" (unique_violation → confirm-booking leaves the hold alone), not as "not enough
  -- credit" — which would make it release the hold the first confirm's booking is using.
  if exists (select 1 from credit_ledger where payment_intent_id = p_payment_intent and kind = 'booking_spend') then
    raise exception 'credit already spent for this payment' using errcode = 'unique_violation';
  end if;
  if credit_balance_cents(p_user) < p_cents then
    raise exception 'insufficient_credit';
  end if;
  insert into credit_ledger (user_id, amount_cents, kind, payment_intent_id)
  values (p_user, -p_cents, 'booking_spend', p_payment_intent);
end $$;
revoke execute on function spend_credit(uuid, int, text) from public, anon, authenticated;
grant execute on function spend_credit(uuid, int, text) to service_role;

-- Brings the credit given back for a booking up to p_percent of what it used. Cumulative, so
-- a 50% in-app cancel followed by a full refund in Stripe ends at 100%, and repeating a call
-- changes nothing. Serialised per user by credit_lock.
create or replace function return_booking_credit(p_booking uuid, p_percent int)
returns int language plpgsql security definer set search_path = public as $$
declare
  spent int;
  already int;
  back int;
  who uuid;
begin
  -- By booking, or by its PaymentIntent in case linking the spend to the booking failed.
  select -l.amount_cents, l.user_id into spent, who from credit_ledger l
   where l.kind = 'booking_spend'
     and (l.booking_id = p_booking
          or l.payment_intent_id = (select stripe_payment_intent_id from bookings where id = p_booking))
   limit 1;
  if spent is null or who is null then
    return 0;
  end if;
  perform credit_lock(who);
  select coalesce(sum(amount_cents), 0) into already from credit_ledger
   where booking_id = p_booking and kind = 'booking_return';
  back := round(spent * greatest(0, least(100, p_percent)) / 100.0)::int - already;
  if back <= 0 then
    return 0;
  end if;
  insert into credit_ledger (user_id, amount_cents, kind, booking_id)
  values (who, back, 'booking_return', p_booking);
  return back;
end $$;
revoke execute on function return_booking_credit(uuid, int) from public, anon, authenticated;
grant execute on function return_booking_credit(uuid, int) to service_role;

-- A session refunded in full or disputed in Stripe (payments-webhook). The $5 it earned an
-- inviter (on either side) is taken back — only out of credit they still hold, never below
-- $0 — and the session stops counting toward goals. Once per booking (credit_reversed_at).
-- Milestone bonuses already paid are not taken back. The student's own credit is returned
-- separately (return_booking_credit), in proportion to the refund or when a dispute is lost.
create or replace function reverse_invite_rewards(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  take int;
  n int;
begin
  update bookings set credit_reversed_at = now() where id = p_booking and credit_reversed_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    return; -- unknown booking, or already reversed
  end if;
  for r in
    select user_id, referral_id, amount_cents from credit_ledger
     where booking_id = p_booking and kind = 'invite_reward' and user_id is not null
  loop
    perform credit_lock(r.user_id);
    take := least(r.amount_cents, greatest(0, credit_balance_cents(r.user_id)));
    if take > 0 then
      insert into credit_ledger (user_id, amount_cents, kind, referral_id, booking_id)
      values (r.user_id, -take, 'reward_reversal', r.referral_id, p_booking)
      on conflict (referral_id) where kind = 'reward_reversal' do nothing;
    end if;
  end loop;
end $$;
revoke execute on function reverse_invite_rewards(uuid) from public, anon, authenticated;
grant execute on function reverse_invite_rewards(uuid) to service_role;

-- ---------------------------------------------------------------------------------------
-- 8) Ambassador cash-out. Approved ambassadors only, $10 minimum, and not credit earned in
--    the last 7 days (time for a refund or dispute on the session that earned it).
-- ---------------------------------------------------------------------------------------
create or replace function credit_cashable_cents(p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, credit_balance_cents(p_user) - coalesce((
    select sum(amount_cents) from credit_ledger
     where user_id = p_user and kind in ('invite_reward', 'milestone_bonus')
       and created_at > now() - interval '7 days'), 0))::int;
$$;
revoke execute on function credit_cashable_cents(uuid) from public, anon, authenticated;
grant execute on function credit_cashable_cents(uuid) to service_role;

create or replace function my_cashable_credit()
returns int language sql stable security definer set search_path = public as $$
  select case when is_approved_ambassador(auth.uid()) then credit_cashable_cents(auth.uid()) else 0 end;
$$;
revoke execute on function my_cashable_credit() from public, anon;
grant execute on function my_cashable_credit() to authenticated;

create or replace function request_credit_cashout(p_cents int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
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
revoke execute on function request_credit_cashout(int) from public, anon;
grant execute on function request_credit_cashout(int) to authenticated;

-- ---------------------------------------------------------------------------------------
-- 9) "People you invited". Names are first name + last initial, and only for the caller's
--    own invites (users_select RLS won't let the inviter read these rows directly).
-- ---------------------------------------------------------------------------------------
create or replace function my_invites()
returns table (
  referral_id  uuid,
  display_name text,
  joined_at    timestamptz,
  completed    boolean,
  reversed     boolean,  -- that session was refunded or disputed; the $5 was taken back
  reward_cents int
) language sql stable security definer set search_path = public as $$
  select r.id,
         trim(coalesce(u.first_name, '') || ' ' || coalesce(nullif(left(u.last_name, 1), '') || '.', '')),
         r.created_at,
         l.id is not null,
         b.credit_reversed_at is not null,
         coalesce(l.amount_cents, 0) + coalesce(v.amount_cents, 0)  -- net of any reversal
    from referrals r
    left join users u on u.id = r.referred_user_id
    left join credit_ledger l on l.referral_id = r.id and l.kind = 'invite_reward'
    left join bookings b on b.id = l.booking_id
    left join credit_ledger v on v.referral_id = r.id and v.kind = 'reward_reversal'
   where r.ambassador_id = auth.uid()
   order by r.created_at desc;
$$;
revoke execute on function my_invites() from public, anon;
grant execute on function my_invites() to authenticated;

-- ---------------------------------------------------------------------------------------
-- 10) Bonuses owed under the old cash scheme become credit (none exist at the time of
--     writing; this keeps it correct if any do). referral_bonuses is legacy from here on.
-- ---------------------------------------------------------------------------------------
insert into credit_ledger (user_id, amount_cents, kind, referral_id, booking_id)
select ambassador_id, round(bonus_amount * 100)::int, 'invite_reward', referral_id, triggering_booking_id
  from referral_bonuses
 where status = 'pending'
on conflict (referral_id) where kind = 'invite_reward' do nothing;
-- People referred before 0040 count as having used their one invite.
insert into redeemed_invite_emails (email_hash)
select distinct invite_email_hash(u.email)
  from referrals r join users u on u.id = r.referred_user_id
on conflict do nothing;

comment on table referral_bonuses is 'Legacy (cash bonuses before 0040). New rewards go to credit_ledger.';
