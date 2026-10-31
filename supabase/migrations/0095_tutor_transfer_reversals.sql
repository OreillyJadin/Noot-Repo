-- Record Stripe-side tutor transfer reversals. Follow up on failed rows with:
-- select * from public.tutor_transfer_reversals where status = 'failed';
-- Reverse manually in Stripe (or recover from the tutor); the next refund event retries.
create table if not exists public.tutor_transfer_reversals (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.bookings(id) on delete cascade,
  stripe_charge_id   text not null,
  stripe_refund_id   text not null,
  stripe_transfer_id text not null,
  amount_cents       integer not null check (amount_cents > 0),
  status             text not null check (status in ('reversed', 'failed')),
  stripe_reversal_id text,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (stripe_refund_id, stripe_transfer_id)
);

create index if not exists tutor_transfer_reversals_booking_idx
  on public.tutor_transfer_reversals (booking_id);
create index if not exists tutor_transfer_reversals_failed_idx
  on public.tutor_transfer_reversals (created_at)
  where status = 'failed';

alter table public.tutor_transfer_reversals enable row level security;
create policy tutor_transfer_reversals_admin_read on public.tutor_transfer_reversals
  for select to authenticated using ((select public.is_admin()) and (select public.is_active_user()));
revoke all on public.tutor_transfer_reversals from public, anon, authenticated;
grant select on public.tutor_transfer_reversals to authenticated;

comment on table public.tutor_transfer_reversals is
  'Tracks Stripe-side refund reversals of tutor transfers; failed rows need manual follow-up and are retried on the next refund event.';
