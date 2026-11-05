update public.bookings
set accept_by = scheduled_at - interval '1 hour'
where status = 'pending'
  and accept_by is not null
  and accept_by > scheduled_at - interval '1 hour';
