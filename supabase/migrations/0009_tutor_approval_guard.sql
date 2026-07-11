-- 0009_tutor_approval_guard.sql — Admin (Phase 2): close the tutor self-approval gap.
-- ⚠️ SECURITY: tutor_profiles_update RLS (0002) allows user_id = auth.uid(), so a tutor
-- could set their OWN approval_status = 'approved' and become bookable without review.
-- This trigger makes the approval fields (approval_status / reviewed_by / reviewed_at)
-- writable ONLY by the service role — i.e. only the approve-tutor Edge Function (and the
-- seed) can change them. Tutors editing bio/rate/etc. are unaffected (those updates don't
-- touch the approval fields). Admins approve through the app → approve-tutor → service role,
-- so they never write these fields directly from a client either.

create or replace function protect_tutor_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.approval_status is distinct from OLD.approval_status
     or NEW.reviewed_by is distinct from OLD.reviewed_by
     or NEW.reviewed_at is distinct from OLD.reviewed_at then
    if coalesce((auth.jwt() ->> 'role'), '') <> 'service_role' then
      raise exception 'tutor approval fields can only be set by the approval service'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists protect_tutor_approval_trg on tutor_profiles;
create trigger protect_tutor_approval_trg
  before update on tutor_profiles
  for each row
  execute function protect_tutor_approval();
