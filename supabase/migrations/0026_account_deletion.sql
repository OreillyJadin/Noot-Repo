-- 0026_account_deletion.sql — make in-app account deletion possible.
--
-- App Store Guideline 5.1.1(v): any app that supports account creation must let the user
-- initiate deletion from inside the app. noot had no such route at all, which is one of the
-- most common causes of rejection.
--
-- THE PROBLEM THIS SOLVES. `users.id` referenced `auth.users(id) ON DELETE CASCADE`, and
-- bookings.student_id / bookings.tutor_id cascade from `users`. So deleting the auth identity
-- — the only way to truly revoke sign-in — would have taken the user's entire booking and
-- payment history with it. We are required to keep financial records for tax, accounting and
-- chargeback handling, so a plain cascade delete is not an option.
--
-- THE SHAPE. Deletion is "revoke the identity, de-identify the record":
--   • the auth.users row is deleted, so the person can never sign in again;
--   • the public.users row SURVIVES, stripped of every identifying field, so bookings and
--     payouts still join to something and the money history stays intact but anonymous.
-- Dropping the FK below is what lets those two things happen independently. The trade-off is
-- deliberate: deleting a user straight from the Auth dashboard now leaves an orphaned app row
-- rather than silently destroying their financial history. That is the safer failure.
--
-- Anonymisation itself is done by the `delete-account` Edge Function under the service role,
-- not here — it also has storage objects and messages to clear, which SQL alone can't reach.

-- When the account was deleted. Null for live accounts; the marker every read filters on.
-- Deliberately a timestamp rather than a new `user_status` value: `ALTER TYPE ... ADD VALUE`
-- cannot be used later in the same transaction a migration runs in, and a nullable column
-- carries strictly more information anyway.
alter table users add column if not exists deleted_at timestamptz;

-- Detach the app user from the auth identity. Without this, deleting the auth row cascades
-- straight through users -> bookings and the retained financial record disappears.
alter table users drop constraint if exists users_id_fkey;

-- Deleted accounts must not surface anywhere a live user would be listed.
create index if not exists users_active_idx on users (id) where deleted_at is null;

comment on column users.deleted_at is
  'Set by the delete-account Edge Function. The row is retained, de-identified, so booking and '
  'payment history survives; the matching auth.users row is deleted so sign-in is revoked.';
