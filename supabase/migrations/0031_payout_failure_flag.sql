-- Flag a booking whose payment was captured but whose tutor payout failed
-- (APP_REVIEW_TICKETS.md T17).
--
-- complete-session and report-no-show capture the held PaymentIntent and then transfer the
-- tutor's payout. Those are two Stripe calls, and the second can fail on its own — most
-- likely a stale Connect id from the other Stripe mode (T10). Previously that combination
-- left the student charged, the tutor unpaid, the booking still 'confirmed' and nothing
-- recorded anywhere. The functions now check payout eligibility before capturing, but the
-- window can't be closed completely, so when it happens it must be visible.
alter table public.bookings add column if not exists payout_failed_at timestamptz;

comment on column public.bookings.payout_failed_at is
  'Set when the payment was captured but the Stripe transfer to the tutor failed. Needs a manual payout; both Stripe calls are idempotency-keyed so a retry is safe.';

-- Partial index: this should be empty in normal operation, and it is what an admin /
-- monitoring query looks at.
create index if not exists bookings_payout_failed_idx
  on public.bookings (payout_failed_at)
  where payout_failed_at is not null;
