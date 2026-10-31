alter table public.bookings add column if not exists refunded_cents integer
  check (refunded_cents is null or refunded_cents >= 0);

comment on column public.bookings.refunded_cents is 'Card cents refunded or released; null means unknown.';
