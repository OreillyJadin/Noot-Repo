-- Extend the content filter to the remaining user-supplied text (APP_REVIEW_TICKETS.md T20).
--
-- 0029 covered chat messages, tutor bios and review comments — but an adversarial audit
-- saved a slur as a first name while the same word was correctly rejected in chat. A
-- display name is more visible than a message: it renders in search results, tutor cards,
-- chat headers and the admin panel. `major` is free text and shown on tutor cards too.
--
-- The reply to App Review says objectionable content is filtered; that has to mean all of
-- the text a user can put on screen, not just the chat box.
drop trigger if exists users_first_name_filter on users;
create trigger users_first_name_filter
  before insert or update of first_name on users
  for each row execute function public.reject_blocked_content('first_name');

drop trigger if exists users_last_name_filter on users;
create trigger users_last_name_filter
  before insert or update of last_name on users
  for each row execute function public.reject_blocked_content('last_name');

drop trigger if exists users_major_filter on users;
create trigger users_major_filter
  before insert or update of major on users
  for each row execute function public.reject_blocked_content('major');

-- bookings.location and meeting_link are inserted by confirm-booking straight from the
-- request body, as service role, and location is rendered to the other party.
drop trigger if exists bookings_location_filter on bookings;
create trigger bookings_location_filter
  before insert or update of location on bookings
  for each row execute function public.reject_blocked_content('location');

-- Note deliberately NOT covered here:
--   • tutor_profiles.subjects[] — a text[] of course codes chosen from a picker, not free
--     text; reject_blocked_content() reads a scalar via to_jsonb ->> and would need an
--     array-aware variant. Tracked in T20; low risk while the picker is the only writer.
--   • bookings.meeting_link — video sessions are not sold at launch (T14), so nothing
--     writes it. Revisit with the video feature, where a URL allowlist matters more than
--     a word filter.
