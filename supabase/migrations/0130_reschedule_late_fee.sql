alter table public.bookings
  add column locked_refund_percent smallint check (locked_refund_percent in (0, 50)),
  add column reschedule_waive_late_fee boolean not null default false;

comment on column public.bookings.locked_refund_percent is
  'Maximum student cancellation refund percent after accepting a reschedule; null means no lock. Only server writes (bookings has SELECT-only client RLS).';
comment on column public.bookings.reschedule_waive_late_fee is
  'Tutor waiver attached to the pending reschedule proposal; cleared on accept or decline. Only server writes (bookings has SELECT-only client RLS).';
