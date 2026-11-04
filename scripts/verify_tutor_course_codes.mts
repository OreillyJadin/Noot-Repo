// Local stack only: canonical writes, legacy backfill, archive privacy and the picker API.
// pnpm dlx tsx scripts/verify_tutor_course_codes.mts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { api, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const clients: ReturnType<typeof createClient>[] = [];
const users: string[] = [];
const duplicateId = randomUUID();
const catalogIds = [randomUUID(), randomUUID(), randomUUID()];
let passed = 0;
function check(name: string, ok: boolean) {
  assert.ok(ok, name);
  console.log(`✅ ${name}`);
  passed++;
}
async function run<T>(q: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
async function user(label: string) {
  const email = `coursecodes-${Date.now()}-${label}@crimson.ua.edu`;
  const result = await svc.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (result.error) throw result.error;
  const id = result.data.user!.id;
  users.push(id);
  await run(svc.from('tutor_profiles').insert({ user_id: id, hourly_rate: 30 }));
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  clients.push(c);
  const login = await c.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (login.error) throw login.error;
  return { id, email, c };
}
const variant = (code: string) => ` \t${code.toLowerCase().replace(/\s/g, '')}  `;
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
async function rejected(action: () => Promise<unknown>) {
  try { await action(); return false; } catch { return true; }
}

try {
  const tutor = await user('tutor');
  const legacy = await user('legacy');
  const core = initSupabase({ url: URL, anonKey: ANON });
  clients.push(core);
  const login = await core.auth.signInWithPassword({ email: tutor.email, password: DEV_PASSWORD });
  if (login.error) throw login.error;
  const picked = await api.courses.search('CS100', 5);
  const code = picked.find(c => c.courseCode === 'CS 100')!.courseCode;
  const otherCode = (await api.courses.search('MATH125', 5)).find(c => c.courseCode === 'MATH 125')!.courseCode;
  check('onboarding picker returns canonical catalog codes', code === 'CS 100' && otherCode === 'MATH 125');
  const raw = (courseCode: string, extra = {}) => tutor.c.from('tutor_courses').insert({
    tutor_id: tutor.id, course_code: courseCode, grade: 'A', hourly_rate: 30, ...extra,
  });
  check('non-owner bogus course insert rejected', (await raw('ZZZZ 999')).error?.code === '23514');
  check('empty course code rejected', (await raw('  ')).error?.code === '23514');
  await run(raw(variant(code), { sessions: 7 }));
  const first = await run(tutor.c.from('tutor_courses').select('*').eq('tutor_id', tutor.id).single());
  check('variant spelling normalizes to exact catalog format', first.course_code === code);
  check('canonical duplicate rejected', (await raw(code)).error?.code === '23505');
  check('variant duplicate rejected', (await raw(variant(code))).error?.code === '23505');
  check('cannot insert for another tutor', (await raw(otherCode, { tutor_id: legacy.id })).error?.code === '42501');
  const invalidEdit = await tutor.c.from('tutor_courses').update({ course_code: 'ZZZZ 999' }).eq('id', first.id);
  check('changing an existing row to a bogus code rejected', invalidEdit.error?.code === '23514');
  await api.profile.setTutorCourses([{ courseCode: variant(code), grade: 'A', hourlyRate: 35, currentlyTaking: false }]);
  const afterSave = await run(tutor.c.from('tutor_courses').select('*').eq('id', first.id).single());
  check('core save normalizes before upsert and preserves row/session count', afterSave.course_code === code && afterSave.sessions === 7 && Number(afterSave.hourly_rate) === 35);
  check('RPC rejects canonical/variant duplicate list', await rejected(() => api.profile.setTutorCourses([
    { courseCode: code, grade: 'A', hourlyRate: 30, currentlyTaking: false },
    { courseCode: variant(code), grade: 'A', hourlyRate: 30, currentlyTaking: false },
  ])));
  check('RPC rejects bogus replacement', await rejected(() => api.profile.setTutorCourses([
    { courseCode: 'ZZZZ 999', grade: 'A', hourlyRate: 30, currentlyTaking: false },
  ])));
  const intact = await run(tutor.c.from('tutor_courses').select('id').eq('tutor_id', tutor.id));
  check('refused saves leave existing list intact', intact.length === 1 && intact[0].id === first.id);
  await api.profile.setTutorCourses([]);
  check('unverified empty list still saves', (await run(tutor.c.from('tutor_courses').select('id').eq('tutor_id', tutor.id))).length === 0);
  await api.profile.setTutorCourses([{ courseCode: code, grade: 'A', hourlyRate: 30, currentlyTaking: false }]);
  await run(svc.from('tutor_profiles').update({ grades_verified_at: new Date().toISOString() }).eq('user_id', tutor.id));
  await api.profile.setTutorCourses([{ courseCode: variant(code), grade: 'A', hourlyRate: 40, currentlyTaking: false }]);
  check('verified grade lock accepts unchanged grade with canonicalized code', Number((await run(tutor.c.from('tutor_courses').select('hourly_rate').eq('tutor_id', tutor.id).single())).hourly_rate) === 40);
  await run(svc.from('courses').insert([code, 'QA 123', 'Q A 123'].map((courseCode, i) => ({
    course_id: catalogIds[i], university_id: 'course-code-test', catalog_year: 'test',
    college_name: 'Test', subject_code: 'QA', subject_name: 'Test',
    course_number: '123', course_code: courseCode, course_title: 'Test',
  }))));
  check('same canonical code across catalogs remains unambiguous', (await run(tutor.c.rpc('canonical_course_code', { p_code: variant(code) }))) === code);
  check('ambiguous catalog spelling is rejected instead of guessed', (await legacy.c.from('tutor_courses').insert({
    tutor_id: legacy.id, course_code: 'qa123', grade: 'A', hourly_rate: 30,
  })).error?.code === '23514');
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  check('anonymous RPC execution denied', (await anon.rpc('set_tutor_courses', { p_courses: [] })).error?.code === '42501');
  await run(svc.from('users').update({ status: 'suspended' }).eq('id', tutor.id));
  check('inactive caller cannot save using an existing token', (await tutor.c.rpc('set_tutor_courses', { p_courses: [] })).error?.code === '42501');

  const migration = readFileSync(new globalThis.URL('../supabase/migrations/0109_tutor_course_codes.sql', import.meta.url), 'utf8');
  const backfill = migration.match(/do \$\$[\s\S]*?\$\$;/)![0];
  const canonicalId = randomUUID();
  const loneId = randomUUID();
  const unknownId = randomUUID();
  const ambiguousId = randomUUID();
  // Simulate pre-migration rows without weakening the live trigger outside this transaction.
  const sql = `begin;
    alter table public.tutor_courses disable trigger a_validate_tutor_course_code;
    insert into public.tutor_courses (id,tutor_id,course_code,grade,hourly_rate,sessions) values
      (${quote(canonicalId)},${quote(legacy.id)},${quote(code)},'A',30,2),
      (${quote(duplicateId)},${quote(legacy.id)},${quote(variant(code))},'B',45,3),
      (${quote(loneId)},${quote(legacy.id)},${quote(variant(otherCode))},'A',30,1),
      (${quote(unknownId)},${quote(legacy.id)},'LEGACY 999','A',30,0),
      (${quote(ambiguousId)},${quote(legacy.id)},'qa123','A',30,0);
    alter table public.tutor_courses enable trigger a_validate_tutor_course_code;
    ${backfill}
    commit;`;
  execFileSync('docker', ['exec', '-i', 'supabase_db_noot', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql });
  const rows = await run(svc.from('tutor_courses').select('*').eq('tutor_id', legacy.id));
  const canonical = rows.find(r => r.id === canonicalId);
  check('backfill merges aliases, keeps canonical settings and combines sessions', rows.length === 4 && canonical?.course_code === code && canonical.grade === 'A' && Number(canonical.hourly_rate) === 30 && canonical.sessions === 5);
  check('backfill normalizes an unambiguous lone alias', rows.find(r => r.id === loneId)?.course_code === otherCode);
  check('backfill retains unmatched legacy row unchanged', rows.find(r => r.id === unknownId)?.course_code === 'LEGACY 999');
  check('backfill retains ambiguous legacy row unchanged', rows.find(r => r.id === ambiguousId)?.course_code === 'qa123');
  const archived = await run(svc.from('tutor_course_code_archive').select('*').eq('id', duplicateId).single());
  check('duplicate settings are recoverable in restricted archive', archived.retained_id === canonicalId && archived.original_row.grade === 'B' && Number(archived.original_row.hourly_rate) === 45);
  check('authenticated caller cannot read archive', (await legacy.c.from('tutor_course_code_archive').select('*')).error?.code === '42501');
  check('anonymous caller cannot read archive', (await anon.from('tutor_course_code_archive').select('*')).error?.code === '42501');
  check('authenticated caller cannot write archive', (await legacy.c.from('tutor_course_code_archive').insert({ id: randomUUID(), retained_id: canonicalId, original_row: {} })).error?.code === '42501');
  const legacyLogin = await core.auth.signInWithPassword({ email: legacy.email, password: DEV_PASSWORD });
  if (legacyLogin.error) throw legacyLogin.error;
  await api.profile.setTutorCourses(rows.map(r => ({ courseCode: r.course_code, grade: r.grade, hourlyRate: 33, currentlyTaking: r.currently_taking })));
  check('legacy unmatched offering remains editable through core API', Number((await run(legacy.c.from('tutor_courses').select('hourly_rate').eq('id', unknownId).single())).hourly_rate) === 33);
  await api.profile.setTutorCourses([]);
  check('removed legacy unknown code cannot be added anew', !!(await legacy.c.from('tutor_courses').insert({ tutor_id: legacy.id, course_code: 'LEGACY 999', grade: 'A', hourly_rate: 30 })).error);
  console.log(`\n${passed} passed, 0 failed`);
} finally {
  for (const c of clients) await c.auth.signOut({ scope: 'local' });
  await run(svc.from('tutor_course_code_archive').delete().eq('id', duplicateId));
  await run(svc.from('courses').delete().in('course_id', catalogIds));
  for (const id of users.reverse()) {
    await run(svc.from('users').delete().eq('id', id));
    await svc.auth.admin.deleteUser(id);
  }
}
