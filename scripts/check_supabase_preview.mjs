#!/usr/bin/env node
// Guardrail: fail BEFORE pushing if the local migrations won't match the remote history,
// which is what makes the "Supabase Preview" GitHub check fail
// ("Remote migration versions not found in local migrations directory").
//
// It compares local supabase/migrations/*.sql versions against the remote
// supabase_migrations.schema_migrations table (read via the Supabase Management API).
//
// Usage:  node scripts/check_supabase_preview.mjs
// Needs SUPABASE_ACCESS_TOKEN (from env or ./.noot-secrets.local.env).
// Exit 0 = safe to push. Exit 1 = drift (would fail preview) OR couldn't check.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'nepnxbvseuzuayhxaigo';

// --- token: env or the gitignored local secrets file ---
function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const f = join(ROOT, '.noot-secrets.local.env');
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/^\s*SUPABASE_ACCESS_TOKEN=(.+)\s*$/m);
    if (m) return m[1].trim();
  }
  return null;
}

// version = the prefix before the first underscore (repo convention: 0001, 0002, …).
function localVersions() {
  const dir = join(ROOT, 'supabase/migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.split('_')[0])
    .sort();
}

async function remoteVersions(token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'select version from supabase_migrations.schema_migrations order by version;' }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  return rows.map((r) => String(r.version)).sort();
}

const token = getToken();
if (!token) {
  console.error('⚠️  check-supabase-preview: no SUPABASE_ACCESS_TOKEN (env or .noot-secrets.local.env) — cannot verify migration drift.');
  console.error('    Set it, or skip with SKIP_SUPABASE_CHECK=1 if you know the migrations are in sync.');
  process.exit(1);
}

try {
  const local = new Set(localVersions());
  const remote = await remoteVersions(token);
  const remoteOnly = remote.filter((v) => !local.has(v));
  const localOnly = [...local].filter((v) => !remote.includes(v));

  if (remoteOnly.length) {
    console.error('❌ Supabase Preview WOULD FAIL — remote migration versions with no local file:');
    remoteOnly.forEach((v) => console.error(`   • ${v}`));
    console.error('\nFix before pushing (pick one):');
    console.error('  · add a matching local file supabase/migrations/<version>_*.sql, OR');
    console.error('  · relabel the remote row to a numeric version that has a local file:');
    console.error("    update supabase_migrations.schema_migrations set version='00NN' where version='<version>';");
    process.exit(1);
  }

  console.log('✅ Supabase Preview OK — no remote-only migrations.');
  if (localOnly.length) console.log(`   (${localOnly.length} local migration(s) not yet on remote — that's fine, they'll apply: ${localOnly.join(', ')})`);
  process.exit(0);
} catch (e) {
  console.error('⚠️  check-supabase-preview: could not verify —', e.message);
  process.exit(1);
}
