alter table public.bookings
  add column request_note text
    check (request_note is null or char_length(request_note) <= 1000);

create trigger bookings_request_note_filter
  before insert or update of request_note on public.bookings
  for each row execute function public.reject_blocked_content('request_note');
