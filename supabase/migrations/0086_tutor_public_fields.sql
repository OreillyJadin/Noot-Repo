-- 0086_tutor_public_fields.sql — SEC-006: other signed-in users see only a tutor's display fields.
--
-- Before: users_select / tutor_profiles_select (0002) let ANY signed-in user read the WHOLE
-- row of every approved tutor — email, stripe_customer_id, stripe_connect_account_id,
-- transcript_url, agreement_signed_name/version/at, reviewed_by, Stripe payout flags …
-- RLS is row-level, so the only way to hide columns from non-owners is to stop them reading
-- the base tables at all and hand them a view with just the public shape.
--
-- After:
--   • users / tutor_profiles base tables: owner + admin only (service_role bypasses RLS as
--     before, so Edge Functions are untouched). Owners keep reading and updating their own
--     row with every column; admin screens keep reading everything.
--   • public.tutor_public_profiles: one row per approved, non-deleted tutor with ONLY the
--     fields the app shows to other users (name, photo, year/major, bio, subjects, rates,
--     rating, session count, Verified badge) plus what booking needs (id, approval state).
--     The caller's own row is included whatever its approval state, so a tutor's own
--     edit screens (tutors.getById(me.id)) keep working during onboarding.
--     Sensitive columns are not in the view, so there is nothing to grant or leak.
--
-- The view runs with its owner's rights (postgres, which bypasses RLS) on purpose: with
-- security_invoker it would see nothing, since the base policies now refuse non-owners.
-- It therefore re-applies the two row rules the policies used to carry (approved + not
-- deleted) and 0051's active-caller rule itself. security_barrier stops a caller-supplied
-- function in a filter from running before those predicates.
--
-- Client reads of other tutors move to the view (packages/core tutors.search / getById /
-- listSaved, chat counterpart fallback). scripts/verify_tutor_public_fields.mts checks
-- every route as a plain student, the owner and an admin.

-- ---------- 1. base tables: owner + admin only ----------
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists tutor_profiles_select on public.tutor_profiles;
create policy tutor_profiles_select on public.tutor_profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- ---------- 2. the public shape ----------
drop view if exists public.tutor_public_profiles;
create view public.tutor_public_profiles
  with (security_barrier = true, security_invoker = false)
as
select
  u.id,
  u.first_name,
  u.last_name,
  u.year,
  u.major,
  u.avatar_url,
  tp.bio,
  tp.subjects,
  tp.hourly_rate,
  tp.rating_avg,
  tp.total_sessions,
  tp.verified_grade,
  (tp.grades_verified_at is not null) as grades_verified,
  tp.approval_status
from public.users u
join public.tutor_profiles tp on tp.user_id = u.id
where (select public.is_active_user())
  and (
    (tp.approval_status = 'approved' and u.deleted_at is null)
    or u.id = (select auth.uid())
  );

alter view public.tutor_public_profiles owner to postgres;
comment on view public.tutor_public_profiles is
  'SEC-006: the only fields of an approved tutor that other signed-in users may read. Add a column here only if the app shows it to everyone.';

revoke all on public.tutor_public_profiles from public, anon;
grant select on public.tutor_public_profiles to authenticated, service_role;
