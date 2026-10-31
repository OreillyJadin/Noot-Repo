// Local-stack regression: notification clearing must remain owner-only under RLS.
// pnpm dlx tsx scripts/verify_notification_clear.mts
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { initSupabase, api, auth, getSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const url = 'http://127.0.0.1:54321';
const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const service = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const admin = createClient(url, service, { auth: { persistSession: false } });
initSupabase({ url, anonKey: anon });
const ids: string[] = [];
const stamp = Date.now();
async function user(label: string) {
  const email = `clear-${label}-${stamp}@crimson.ua.edu`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (error) throw error;
  const id = data.user!.id;
  ids.push(id);
  return { id, email };
}
async function exists(id: string) {
  const { data, error } = await admin.from('notifications').select('id').eq('id', id);
  if (error) throw error;
  return data!.length === 1;
}

try {
  const owner = await user('owner');
  const other = await user('other');
  const { data: notes, error } = await admin.from('notifications').insert([
    ...Array.from({ length: 105 }, (_, i) => ({ user_id: owner.id, type: 'system', title: `Clear ${i}`, created_at: '2020-01-01T00:00:00Z' })),
    { user_id: other.id, type: 'system', title: 'Other inbox', created_at: '2020-01-01T00:00:00Z' },
    { user_id: owner.id, type: 'system', title: 'Visible latest', created_at: '2020-01-02T00:00:00.123456Z' },
    { user_id: owner.id, type: 'system', title: 'Later arrival', created_at: '2020-01-02T00:00:00.123457Z' },
  ]).select('id, user_id, title');
  if (error) throw error;
  const own = notes!.find((n) => n.title === 'Clear 0')!;
  const foreign = notes!.find((n) => n.user_id === other.id)!;
  const later = notes!.find((n) => n.title === 'Later arrival')!;

  assert.equal((await auth.signInWithPassword(other.email, DEV_PASSWORD)).ok, true);
  await api.notifications.clear(own.id);
  assert.equal(await exists(own.id), true, 'API cannot delete another user notification');
  const raw = await getSupabase().from('notifications').delete().eq('id', own.id).select('id');
  assert.ifError(raw.error);
  assert.equal(raw.data!.length, 0, 'RLS blocks deletion by a modified client');

  assert.equal((await auth.signInWithPassword(owner.email, DEV_PASSWORD)).ok, true);
  await api.notifications.clear(own.id);
  assert.equal(await exists(own.id), false, 'owner clears one');
  await api.notifications.clear(own.id);
  assert.equal((await api.notifications.list()).length, 100, 'list is capped, clear-all must not be');
  const snapshot = notes!.find((n) => n.title === 'Visible latest')!;
  const { data: cutoff, error: cutoffError } = await admin.from('notifications').select('created_at').eq('id', snapshot.id).single();
  assert.ifError(cutoffError);
  await api.notifications.clearAll(cutoff!.created_at);
  assert.deepEqual((await api.notifications.list()).map((n) => n.id), [later.id], 'clears older pages, preserves arrivals after cutoff');
  assert.equal(await api.notifications.unreadCount(), 1, 'unread count excludes cleared notifications');
  assert.equal(await exists(foreign.id), true, 'clear-all preserves other inboxes');

  const suspended = await admin.from('users').update({ status: 'suspended' }).eq('id', owner.id);
  assert.ifError(suspended.error);
  await api.notifications.clear(later.id);
  await api.notifications.clearAll('2100-01-01T00:00:00Z');
  assert.equal(await exists(later.id), true, 'suspended account token cannot clear inbox');
  const restored = await admin.from('users').update({ status: 'active' }).eq('id', owner.id);
  assert.ifError(restored.error);
  await api.notifications.clearAll('2100-01-01T00:00:00Z');
  assert.equal((await api.notifications.list()).length, 0, 'empty inbox persists');
  assert.equal(await api.notifications.unreadCount(), 0);
  console.log('PASS notification clear: individual, repeat, all pages, arrival cutoff, owner isolation, suspended account, unread count');
} finally {
  await auth.signOut();
  for (const id of ids) {
    await admin.from('notifications').delete().eq('user_id', id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
}
