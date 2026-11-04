-- Column grants reject even explicit NULL/default timestamp writes before RLS or triggers.
revoke insert, update on public.users from public, anon, authenticated;
revoke insert (created_at, deleted_at), update (created_at, deleted_at)
  on public.users from public, anon, authenticated;

grant insert (
  id, email, first_name, last_name, active_role, status, updated_at,
  year, major, gender, courses, avatar_url, stripe_customer_id,
  terms_accepted_at, terms_version, password_set_at,
  guidelines_accepted_at, guidelines_version, date_of_birth,
  expected_graduation_year, expected_graduation_term
), update (
  id, email, first_name, last_name, active_role, status, updated_at,
  year, major, gender, courses, avatar_url, stripe_customer_id,
  terms_accepted_at, terms_version, password_set_at,
  guidelines_accepted_at, guidelines_version, date_of_birth,
  expected_graduation_year, expected_graduation_term
) on public.users to anon, authenticated;
