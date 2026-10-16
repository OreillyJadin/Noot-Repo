alter table public.bookings
  add column if not exists student_fee numeric(10,2) not null default 0 check (student_fee >= 0);

comment on column public.bookings.student_fee is
  'Student service fee, separate from the tutor-side platform fee and calculated on bookings.price.';

comment on column public.bookings.price is
  'Session price before the student service fee.';

alter table public.bookings
  drop constraint if exists bookings_check;

alter table public.bookings
  drop constraint if exists bookings_credit_applied_check;

alter table public.bookings
  add constraint bookings_credit_applied_check
  check (credit_applied >= 0 and credit_applied <= price + student_fee);
