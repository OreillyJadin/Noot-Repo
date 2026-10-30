create or replace function public.notify_on_session_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.reviews
    where booking_id = new.id and reviewer_id = new.student_id
  ) and not exists (
    select 1 from public.notifications
    where user_id = new.student_id and type = 'booking'
      and data @> jsonb_build_object('bookingId', new.id, 'event', 'rate_session')
  ) then
    perform public.create_notification(
      new.student_id, 'booking', 'How was your session?',
      'Your ' || new.subject || ' session is complete. Tap to rate your tutor.',
      jsonb_build_object('bookingId', new.id, 'event', 'rate_session')
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_on_session_completed() from public, anon, authenticated;

create trigger trg_notify_on_session_completed
  after update of status on public.bookings
  for each row
  when (new.status = 'completed' and old.status is distinct from new.status)
  execute function public.notify_on_session_completed();
