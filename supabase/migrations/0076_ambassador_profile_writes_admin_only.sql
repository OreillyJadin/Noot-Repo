-- 0076: ambassadors can no longer write their own ambassador_profiles row.
--
-- The 0002 policies let the owner insert and update their row directly, so a user could set
-- their own total_referrals, total_earned, referral_code or stripe_connect_account_id
-- (or create the row with a chosen code, skipping create_my_ambassador_profile). The app
-- never writes this table from the client: create_my_ambassador_profile (security definer)
-- creates the row with a server-generated code. Owners keep read access; admins keep writes.
alter policy ambassador_profiles_insert on public.ambassador_profiles
  with check ((select public.is_admin()));

alter policy ambassador_profiles_update on public.ambassador_profiles
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
