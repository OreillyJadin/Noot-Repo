// Verify migration 0062 against the LOCAL stack: every public foreign key has a covering
// index, and no public/storage RLS policy calls auth.uid() / auth.jwt() / auth.role() /
// auth.email() / current_setting() per row (Supabase advisor lints unindexed_foreign_keys
// and auth_rls_initplan). Fails on a new migration that reintroduces either.
//
// Needs: supabase db reset
//   pnpm dlx tsx scripts/verify_db_performance.mts
import { execFileSync } from 'node:child_process'

let pass = 0, fail = 0
const step = (n: number | string, ok: boolean, msg: string) => {
  ok ? pass++ : fail++
  console.log(`${n}) ${ok ? 'PASS ✅' : 'FAIL ❌'} — ${msg}`)
}

const sql = (query: string): string[] =>
  execFileSync('docker', [
    'exec', 'supabase_db_noot', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', query,
  ], { encoding: 'utf8' }).split('\n').map((l) => l.trim()).filter(Boolean)

// A foreign key is covered when some index on the table starts with exactly its columns.
const unindexed = sql(`
  select c.conrelid::regclass || ' (' || c.conname || ')'
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
   where c.contype = 'f' and n.nspname = 'public'
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
          and c.conkey @> (i.indkey::int2[])[0:cardinality(c.conkey) - 1])
   order by 1`)
step(1, unindexed.length === 0,
  unindexed.length ? `foreign keys without a covering index: ${unindexed.join(', ')}` : 'every public foreign key has a covering index')

// pg_policies deparses (select auth.uid()) as "( SELECT auth.uid() AS uid)"; any other
// occurrence is evaluated per row.
const perRow = sql(`
  select schemaname || '.' || tablename || ' ' || policyname
    from pg_policies
   where schemaname in ('public', 'storage')
     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                        '\\( SELECT auth\\.(uid|jwt|role|email)\\(\\) AS \\1\\)', '', 'g')
         ~ 'auth\\.(uid|jwt|role|email)\\(\\)|current_setting\\('
   order by 1`)
step(2, perRow.length === 0,
  perRow.length ? `policies evaluating auth.* per row: ${perRow.join(', ')}` : 'no public/storage policy evaluates auth.uid()/jwt()/role()/email() or current_setting() per row')

const wrapped = Number(sql(`
  select count(*) from pg_policies
   where schemaname in ('public', 'storage')
     and (coalesce(qual, '') || coalesce(with_check, '')) like '%( SELECT auth.uid() AS uid)%'`)[0])
step(3, wrapped >= 48, `${wrapped} policies use (select auth.uid()) (0062 wraps 48)`)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
