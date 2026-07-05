-- 0005_grants.sql — table-level privileges for the PostgREST data-API roles.
--
-- WHY THIS EXISTS: our tables are owned by `postgres`, and in this environment the
-- default privileges only give anon/authenticated/service_role TRUNCATE/REFERENCES/
-- TRIGGER on postgres-owned tables — NOT select/insert/update/delete. Without these
-- grants every client query fails with "permission denied for table ..." (a GRANT
-- error, distinct from RLS, which would instead return zero rows).
--
-- SECURITY MODEL UNCHANGED: RLS (0002) is still the real gate. A grant only lets a role
-- *reach* a table; row visibility/mutability is decided by the policies. Tables with no
-- insert/update policy (bookings, referrals, reviews-writes, …) stay client-immutable
-- because RLS denies the write regardless of this grant — those remain Edge-Function-only.

grant usage on schema public to anon, authenticated, service_role;

-- anon is pre-auth: read-only (only campuses has an anon SELECT policy, so that's all it sees).
grant select on all tables in schema public to anon;

-- authenticated: full DML, gated per-row by RLS policies.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- service_role bypasses RLS (Edge Functions / admin): everything.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Same privileges for anything created later, so new tables don't silently 403.
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
