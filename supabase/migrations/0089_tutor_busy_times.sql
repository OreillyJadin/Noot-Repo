-- 0089_tutor_busy_times.sql — let the booking picker grey out a tutor's taken hours.
--
-- Students cannot read other people's bookings (RLS), so B3 offered every hour of a tutor's
-- weekly availability and the student only found out a time was taken at payment
-- ("That time was just booked"). This returns just the busy time ranges for one tutor —
-- no booking ids, students, courses or status — using the same rule as the server's clash
-- check in _shared/booking.ts: live (pending/confirmed) bookings, half-open ranges, plus a
-- scheduled interview with the noot team, which blocks an hour.
create or replace function public.tutor_busy_times(
  p_tutor uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_exclude_booking uuid default null
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_tutor is null or p_from is null or p_to is null or p_to <= p_from then
    raise exception 'a tutor and a valid time range are required' using errcode = 'check_violation';
  end if;
  if p_to - p_from > interval '15 days' then
    raise exception 'time range is too long' using errcode = 'check_violation';
  end if;

  return query
    select b.scheduled_at, b.scheduled_end
      from bookings b
     where b.tutor_id = p_tutor
       and b.status in ('pending', 'confirmed')
       and (p_exclude_booking is null or b.id <> p_exclude_booking)
       and b.scheduled_at < p_to
       and b.scheduled_end > p_from
    union all
    select i.scheduled_at, i.scheduled_at + interval '60 minutes'
      from tutor_interviews i
     where i.tutor_id = p_tutor
       and i.cancelled_at is null
       and i.scheduled_at < p_to
       and i.scheduled_at + interval '60 minutes' > p_from
    order by 1;
end;
$$;

revoke all on function public.tutor_busy_times(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.tutor_busy_times(uuid, timestamptz, timestamptz, uuid) to authenticated;
