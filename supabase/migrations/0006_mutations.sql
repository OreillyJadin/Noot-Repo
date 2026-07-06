-- 0006_mutations.sql — schema support for the write-side flows (ratings, cancel,
-- reschedule, no-show). Booking creation + payment need no schema change.

-- No-show is a distinct terminal state (report-no-show). PG12+ allows ADD VALUE in a
-- migration as long as the value isn't USED in the same transaction (it isn't here).
alter type booking_status add value if not exists 'no_show';

-- Reschedule proposals (X3 propose → X4 accept/decline). null = no active proposal.
alter table bookings add column if not exists reschedule_proposed_at timestamptz;
alter table bookings add column if not exists reschedule_proposed_by uuid references users(id);

-- Refund tier as a percent (0/50/100) so cancel-booking can record partial refunds;
-- refund_status stays the coarse enum. Existing rows default to 0.
alter table bookings add column if not exists refund_percent int not null default 0
  check (refund_percent between 0 and 100);

-- Double-blind ratings are TWO-SIDED: the student rates the tutor AND the tutor rates
-- the student, so a booking has up to two reviews (one per reviewer). Replace the
-- one-review-per-booking constraint with one-per-(booking, reviewer).
alter table reviews drop constraint if exists reviews_booking_id_key;
alter table reviews add constraint reviews_booking_reviewer_key unique (booking_id, reviewer_id);
