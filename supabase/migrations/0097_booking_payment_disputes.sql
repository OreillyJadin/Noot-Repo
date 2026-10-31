create table public.booking_payment_disputes (
  stripe_dispute_id text primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  stripe_charge_id text not null,
  status text not null,
  amount_cents integer not null check (amount_cents > 0),
  payout_hold boolean not null default true,
  admin_followup text not null,
  updated_at timestamptz not null default now()
);
create index booking_payment_disputes_booking_idx on public.booking_payment_disputes (booking_id);
alter table public.booking_payment_disputes enable row level security;
create policy booking_payment_disputes_admin_read on public.booking_payment_disputes
  for select to authenticated
  using ((select public.is_admin()) and (select public.is_active_user()));
revoke all on public.booking_payment_disputes from public, anon, authenticated;
grant select on public.booking_payment_disputes to authenticated;
comment on table public.booking_payment_disputes is
  'Admin dispute queue. Open/lost disputes hold unpaid tutor payouts. Won/warning_closed releases the hold; previously failed payouts need admin retry. Lost disputes claw back the tutor share, recorded in tutor_transfer_reversals using the dispute ID as stripe_refund_id (adjustment identity).';
