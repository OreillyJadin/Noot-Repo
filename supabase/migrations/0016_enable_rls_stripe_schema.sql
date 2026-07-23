-- 0016_enable_rls_stripe_schema.sql — mirrors the Stripe Sync Engine's RLS migration
-- (recorded on the cloud project as version 20260722015021; relabeled to 0016 so local
-- and remote migration history agree — otherwise the Supabase Preview branch check fails).
--
-- Enables RLS on every table in the sync engine's `stripe` schema. GUARDED: on databases
-- that don't have that schema (fresh preview branches, local dev — the sync engine installs
-- it out-of-band, not via a repo migration) this is a no-op, so branching stays green.
-- Re-enabling RLS on prod (where it's already on) is idempotent.
do $$
declare r record;
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'stripe') then
    for r in select tablename from pg_tables where schemaname = 'stripe' loop
      execute format('alter table stripe.%I enable row level security;', r.tablename);
    end loop;
  end if;
end $$;
