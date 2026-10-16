-- 0063_bookings_no_overlap.sql — the database refuses two live bookings for one tutor at once.
--
-- resolveBooking (_shared/booking.ts) and reschedule-booking already check for a clash, but
-- that is read-then-write: two students confirming the same slot at the same moment could both
-- pass the check. This constraint makes the second insert fail with 23P01
-- (exclusion_violation), which confirm-booking / reschedule-booking turn into a 409.
--
-- Same rule as the app's check: only `pending` and `confirmed` bookings hold a slot, it is per
-- tutor (a student may hold overlapping sessions with different tutors), there is no buffer,
-- and ranges are half-open, so a session ending at 3:00 and one starting at 3:00 both fit.

-- Production already has btree_gist (installed by the Stripe Sync Engine, in schema `stripe`);
-- then this is a no-op. The gist operator class is found by type, not search_path.
create extension if not exists btree_gist with schema extensions;

-- An exclusion constraint needs an IMMUTABLE expression, and timestamptz + interval is only
-- STABLE, so the end time is stored and kept in step by a trigger.
alter table public.bookings add column if not exists scheduled_end timestamptz;

create or replace function public.set_booking_scheduled_end()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.scheduled_end := new.scheduled_at + new.duration_minutes * interval '1 minute';
  return new;
end;
$$;
revoke execute on function public.set_booking_scheduled_end() from public, anon, authenticated;

drop trigger if exists bookings_set_scheduled_end on public.bookings;
create trigger bookings_set_scheduled_end
  before insert or update on public.bookings
  for each row execute function public.set_booking_scheduled_end();

-- Backfill without touching updated_at.
alter table public.bookings disable trigger bookings_updated_at;
update public.bookings
set scheduled_end = scheduled_at + duration_minutes * interval '1 minute'
where scheduled_end is distinct from scheduled_at + duration_minutes * interval '1 minute';
alter table public.bookings enable trigger bookings_updated_at;

alter table public.bookings alter column scheduled_end set not null;

alter table public.bookings drop constraint if exists bookings_tutor_no_overlap;
alter table public.bookings
  add constraint bookings_tutor_no_overlap
  exclude using gist (tutor_id with =, tstzrange(scheduled_at, scheduled_end, '[)') with &&)
  where (status in ('pending', 'confirmed'));
