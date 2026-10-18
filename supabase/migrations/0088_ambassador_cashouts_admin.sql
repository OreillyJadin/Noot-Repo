-- 0088: ambassador program administration + cash-outs paid by Stripe transfer.
--
-- Before this, approving an ambassador, paying a cash-out and rejecting one were SQL in
-- Studio (HANDOFF_2026-10-03 "Team runbook"), and a cash-out collected no payout details.
--
--  • ambassador_profiles gains Stripe Connect readiness columns, so an ambassador who is
--    not a tutor can hold the same recipient account tutors get (connect-onboarding-link
--    writes it there when the person has no tutor_profiles row; a tutor's account is reused).
--  • credit_cashouts gains the payment trail: the transfer id, who paid/rejected and when,
--    a claim timestamp (paying_at) the pay function uses so two admins can't pay twice,
--    the count of definite Stripe failures (pay_attempts, part of the idempotency key),
--    and the last Stripe error (so the admin sees why it is still pending).
--  • request_credit_cashout now also requires a payout-ready account.
--  • Admin RPCs (is_admin() guard, one admin_actions row in the same transaction):
--    admin_approve_ambassador, admin_reject_cashout (returns the credit as an 'adjustment',
--    exactly like the runbook SQL), plus read-only admin_ambassador_queue,
--    admin_list_cashouts, admin_ambassador_history and admin_ambassador_counts.
--  Paying is the admin-pay-cashout Edge Function (service role, Stripe transfer).

-- ---------- payout account for ambassadors ----------
alter table public.ambassador_profiles
  add column if not exists stripe_transfers_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled   boolean not null default false,
  add column if not exists stripe_onboarded_at      timestamptz;

-- ---------- cash-out payment trail ----------
alter table public.credit_cashouts
  add column if not exists stripe_transfer_id text,
  add column if not exists paid_by            uuid references public.users(id) on delete set null,
  add column if not exists paying_at          timestamptz,
  add column if not exists pay_attempts       int not null default 0,
  add column if not exists last_error         text,
  add column if not exists rejected_at        timestamptz,
  add column if not exists rejected_by        uuid references public.users(id) on delete set null;
create unique index if not exists credit_cashouts_transfer_idx on public.credit_cashouts (stripe_transfer_id)
  where stripe_transfer_id is not null;
create index if not exists credit_cashouts_status_idx on public.credit_cashouts (status, created_at);
-- A rejected cash-out's credit comes back exactly once.
create unique index if not exists credit_ledger_one_cashout_return on public.credit_ledger (cashout_id)
  where kind = 'adjustment';

-- The owner's select policy stays (0040: own rows or admin). Nobody writes these rows from
-- the client: no insert/update/delete policies, so only definer RPCs and the service role do.

-- ---------- payout readiness ----------
-- A tutor's Connect account (tutor_profiles) or an ambassador-only account (ambassador_profiles)
-- that can receive transfers. Mirrors the cached flags connect-status refreshes.
create or replace function public.payout_account_ready(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- Only about yourself, unless you're an admin: no probing other people's payout setup.
  select (p_user = auth.uid() or public.is_admin())
     and (exists (
            select 1 from public.tutor_profiles
            where user_id = p_user and stripe_connect_account_id is not null and stripe_charges_enabled
          )
       or exists (
            select 1 from public.ambassador_profiles
            where user_id = p_user and stripe_connect_account_id is not null and stripe_transfers_enabled
          ));
$$;
revoke execute on function public.payout_account_ready(uuid) from public, anon;
grant execute on function public.payout_account_ready(uuid) to authenticated, service_role;

-- Same as 0040, plus the payout-account requirement.
create or replace function public.request_credit_cashout(p_cents int)
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
  if not payout_account_ready(uid) then
    raise exception 'Set up your payout account first so we have somewhere to send the money.';
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

-- ---------- admin: approve an ambassador ----------
-- Returns true when this call approved them, false when they already were.
create or replace function public.admin_approve_ambassador(p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_inserted boolean;
begin
  if not is_admin() then
    raise exception 'admins only' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from user_roles r join users u on u.id = r.user_id
    where r.user_id = p_user and r.role = 'ambassador' and u.deleted_at is null
  ) then
    raise exception 'this person is not an ambassador' using errcode = 'check_violation';
  end if;

  insert into ambassador_approvals (user_id, approved_by) values (p_user, auth.uid())
  on conflict (user_id) do nothing;
  v_inserted := found;
  if not v_inserted then
    return false;
  end if;

  insert into public.admin_actions (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'ambassador.approve', 'user', p_user::text, '{}'::jsonb);

  perform create_notification(
    p_user, 'system', 'You’re an approved noot ambassador',
    'Goal bonuses and cash-out are open for you now.',
    jsonb_build_object('screen', 'invite')
  );
  return true;
end $$;
revoke execute on function public.admin_approve_ambassador(uuid) from public, anon;
grant execute on function public.admin_approve_ambassador(uuid) to authenticated;

-- ---------- admin: reject a cash-out (credit comes back) ----------
create or replace function public.admin_reject_cashout(p_cashout uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v credit_cashouts%rowtype;
begin
  if not is_admin() then
    raise exception 'admins only' using errcode = 'insufficient_privilege';
  end if;
  select user_id into v_user from credit_cashouts where id = p_cashout;
  if not found then
    raise exception 'cash-out not found' using errcode = 'no_data_found';
  end if;
  if v_user is not null then
    perform credit_lock(v_user);
  end if;
  select * into v from credit_cashouts where id = p_cashout for update;
  if v.status <> 'pending' then
    raise exception 'this cash-out is already %', v.status using errcode = 'check_violation';
  end if;
  if v.paying_at is not null and v.paying_at > now() - interval '10 minutes' then
    raise exception 'this cash-out is being paid right now' using errcode = 'check_violation';
  end if;

  update credit_cashouts
     set status = 'rejected', rejected_at = now(), rejected_by = auth.uid(), paying_at = null
   where id = p_cashout;
  insert into credit_ledger (user_id, amount_cents, kind, cashout_id)
  values (v.user_id, v.amount_cents, 'adjustment', p_cashout);

  insert into public.admin_actions (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'cashout.reject', 'credit_cashout', p_cashout::text,
          jsonb_strip_nulls(jsonb_build_object('user_id', v.user_id, 'amount_cents', v.amount_cents)));

  if v.user_id is not null then
    perform create_notification(
      v.user_id, 'system', 'Cash-out returned to your credit',
      format('Your $%s cash-out wasn’t sent. The credit is back on your balance.',
             to_char(v.amount_cents / 100.0, 'FM999990.00')),
      jsonb_build_object('screen', 'invite', 'cashoutId', p_cashout)
    );
  end if;
end $$;
revoke execute on function public.admin_reject_cashout(uuid) from public, anon;
grant execute on function public.admin_reject_cashout(uuid) to authenticated;

-- ---------- admin: read models ----------
-- Ambassadors (role granted) the team hasn't approved yet, oldest first.
create or replace function public.admin_ambassador_queue()
returns table (
  user_id uuid, name text, email text, invites int, completed_invites int,
  balance_cents int, payout_ready boolean, applied_at timestamptz
) language sql stable security definer set search_path = public as $$
  select u.id,
         trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')),
         u.email,
         (select count(*)::int from referrals r where r.ambassador_id = u.id),
         (select count(*)::int from credit_ledger l where l.user_id = u.id and l.kind = 'invite_reward'),
         credit_balance_cents(u.id),
         payout_account_ready(u.id),
         ur.created_at
  from user_roles ur
  join users u on u.id = ur.user_id
  where is_admin()
    and ur.role = 'ambassador'
    and u.deleted_at is null
    and not exists (select 1 from ambassador_approvals a where a.user_id = u.id)
  order by ur.created_at asc;
$$;
revoke execute on function public.admin_ambassador_queue() from public, anon;
grant execute on function public.admin_ambassador_queue() to authenticated;

create or replace function public.admin_list_cashouts(p_statuses cashout_status[] default null, p_limit int default 50)
returns table (
  id uuid, user_id uuid, name text, email text, amount_cents int, status cashout_status,
  created_at timestamptz, paid_at timestamptz, rejected_at timestamptz, paying_at timestamptz,
  stripe_transfer_id text, last_error text, payout_ready boolean
) language sql stable security definer set search_path = public as $$
  select c.id, c.user_id,
         trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')),
         u.email, c.amount_cents, c.status, c.created_at, c.paid_at, c.rejected_at, c.paying_at,
         c.stripe_transfer_id, c.last_error,
         case when c.user_id is null then false else payout_account_ready(c.user_id) end
  from credit_cashouts c
  left join users u on u.id = c.user_id
  where is_admin()
    and (p_statuses is null or c.status = any (p_statuses))
  order by c.created_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
revoke execute on function public.admin_list_cashouts(cashout_status[], int) from public, anon;
grant execute on function public.admin_list_cashouts(cashout_status[], int) to authenticated;

-- Recent decisions: approvals, paid and rejected cash-outs, newest first.
create or replace function public.admin_ambassador_history(p_limit int default 30)
returns table (
  kind text, id text, user_id uuid, name text, amount_cents int, status text, at timestamptz
) language sql stable security definer set search_path = public as $$
  select * from (
    select 'approval'::text, a.user_id::text, a.user_id,
           trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')),
           null::int, 'approved'::text, a.approved_at
    from ambassador_approvals a
    left join users u on u.id = a.user_id
    where is_admin()
    union all
    select 'cashout', c.id::text, c.user_id,
           trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')),
           c.amount_cents, c.status::text, coalesce(c.paid_at, c.rejected_at, c.created_at)
    from credit_cashouts c
    left join users u on u.id = c.user_id
    where is_admin() and c.status <> 'pending'
  ) h
  order by h.approved_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 200));
$$;
revoke execute on function public.admin_ambassador_history(int) from public, anon;
grant execute on function public.admin_ambassador_history(int) to authenticated;

create or replace function public.admin_ambassador_counts()
returns table (applications int, cashouts int)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from user_roles ur join users u on u.id = ur.user_id
           where ur.role = 'ambassador' and u.deleted_at is null
             and not exists (select 1 from ambassador_approvals a where a.user_id = ur.user_id)),
         (select count(*)::int from credit_cashouts where status = 'pending')
  where is_admin();
$$;
revoke execute on function public.admin_ambassador_counts() from public, anon;
grant execute on function public.admin_ambassador_counts() to authenticated;
