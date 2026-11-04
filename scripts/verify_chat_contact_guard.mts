import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { api, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = 'http://127.0.0.1:54321';
const LOCAL_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const student = initSupabase({ url: URL, anonKey: LOCAL_ANON });
const tutor = createClient(URL, LOCAL_ANON, { auth: { persistSession: false } });
const third = createClient(URL, LOCAL_ANON, { auth: { persistSession: false } });
const users: string[] = [];
let conversation: string | undefined;
let bookingId: string | undefined;
let checks = 0;
const FRIENDLY = "For your safety, keep contact and payment info on Noot until your tutor accepts a booking. Payments made outside Noot aren't protected.";
const positives: [string, string][] = [
  ['2055551234', 'phone'], ['(205) 555-1234', 'phone'], ['+1 (205) 555 1234', 'phone'], ['1-205-555-1234', 'phone'],
  ['text me at 205.555.1234', 'phone'], ['call me 205 555 1234', 'phone'],
  ['text me 555-1234', 'social'], ['call me at 5551234', 'social'],
  ['learner@example.com', 'email'], ['learner at gmail dot com', 'email'], ['learner(at)gmail(dot)com', 'email'],
  ['learner [at] gmail [dot] com', 'email'], ['learner at gmail.com', 'email'],
  ['Venmo me', 'payment'], ['cash app', 'payment'], ['cashapp learner', 'payment'], ['$learner', 'payment'],
  ['Zelle', 'payment'], ['PayPal', 'payment'], ['Apple Pay', 'payment'], ['Apple Cash', 'payment'],
  ['my snap is learner', 'social'], ['snapchat learner', 'social'], ['insta learner', 'social'], ['my ig is learner', 'social'],
  ['WhatsApp', 'social'], ['Telegram', 'social'], ['Discord', 'social'], ['@learner', 'social'],
];
const negatives = ['CS 100', 'MATH 125', '3:30', '10-11am', '$25', '25 dollars', 'room 205', '11/12',
  '11/12/2026', 'page 123', 'section 004', 'chapter 10', 'blackboard', 'blackboard.ua.edu',
  'snap a photo of the exercise', 'snapshot of the assignment', 'badlang_1234567890123', 'call me at 3:30', 'Can we meet in room 123 at 3:30 for $25?'];
function ok(error: unknown) { if (error) throw error; }
function pass(message: string) { checks++; console.log(`✅ ${message}`); }
async function makeUser(name: string, client: typeof student, role?: string) {
  const email = `contact-${Date.now()}-${name}@crimson.ua.edu`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  ok(error); const id = data.user!.id; users.push(id);
  ok((await svc.from('users').update({ terms_accepted_at: new Date().toISOString() }).eq('id', id)).error);
  if (role) ok((await svc.from('user_roles').upsert({ user_id: id, role })).error);
  ok((await client.auth.signInWithPassword({ email, password: DEV_PASSWORD })).error);
  return id;
}
async function send(client: typeof student, text: string) {
  if (client === student) return (await api.chat.sendMessage(conversation!, text)).id;
  const { data, error } = await client.rpc('send_message_with_attachments', { p_conversation_id: conversation, p_content: text, p_attachments: [] });
  ok(error); return (Array.isArray(data) ? data[0] : data).id as string;
}
async function denied(client: typeof student, text: string) {
  await assert.rejects(send(client, text), (error: unknown) => {
    const e = error as { code: string; message: string };
    return e.code === '23514' && e.message === FRIENDLY;
  });
}
async function flags(id: string) {
  const { data, error } = await svc.from('content_reports').select('*').eq('target_message_id', id);
  ok(error); return data!;
}
try {
  const s = await makeUser('student', student);
  const t = await makeUser('tutor', tutor, 'tutor');
  await makeUser('third', third);
  const conv = await svc.from('conversations').insert({ student_id: s, tutor_id: t }).select('id').single();
  ok(conv.error); conversation = conv.data!.id;
  assert.ok((await student.rpc('contains_contact_info', { p_text: 'hello' })).error);
  assert.ok((await createClient(URL, LOCAL_ANON).rpc('contains_contact_info', { p_text: 'hello' })).error);
  pass('detector is not callable by students or anonymous users');
  for (const [text] of positives) for (const client of [student, tutor]) await denied(client, text);
  const blockedRows = await svc.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conversation!);
  ok(blockedRows.error); assert.equal(blockedRows.count, 0);
  pass(`${positives.length} contact-positive cases DENIED in both directions before acceptance`);
  for (const text of negatives) for (const client of [student, tutor]) {
    const id = await send(client, text); assert.equal((await flags(id)).length, 0, text);
  }
  pass(`${negatives.length} negative cases send without flags in both directions`);
  const direct = await student.from('messages').insert({ conversation_id: conversation, sender_id: s, content: '$learner' });
  assert.equal(direct.error?.message, FRIENDLY);
  pass('direct PostgREST insert cannot bypass the guard');
  const trusted = await svc.from('messages').insert({ conversation_id: conversation, sender_id: s, content: 'service contact 2055551234' }).select('id').single();
  ok(trusted.error); assert.equal((await flags(trusted.data!.id)).length, 0);
  pass('trusted service-role inserts remain exempt');
  const b = await svc.from('bookings').insert({ student_id: s, tutor_id: t, subject: 'CS 100', status: 'pending',
    scheduled_at: '2100-01-01T12:00:00Z', duration_minutes: 60, price: 30, platform_fee: 6,
    tutor_payout_amount: 24, session_type: 'in_person', cancellation_deadline: '2099-12-31T12:00:00Z' }).select('id').single();
  ok(b.error); bookingId = b.data!.id;
  for (const state of [{ status: 'pending' }, { status: 'cancelled', cancel_reason: 'tutor_declined' }, { status: 'cancelled', cancel_reason: 'tutor_no_response' }]) {
    ok((await svc.from('bookings').update(state).eq('id', bookingId)).error);
    await denied(student, '2055551234'); await denied(tutor, '2055551234');
  }
  pass('pending, declined and expired bookings do not unlock contact sharing');
  ok((await svc.from('bookings').update({ status: 'confirmed', cancel_reason: null }).eq('id', bookingId)).error);
  const flaggedIds: string[] = [];
  for (const [text, kind] of positives) for (const client of [student, tutor]) {
    const id = await send(client, text); flaggedIds.push(id);
    const rows = await flags(id); assert.equal(rows.length, 1, text);
    assert.equal(rows[0].reporter_id, null); assert.equal(rows[0].auto_flagged, true);
    assert.equal(rows[0].detail, `Contact info (${kind}).`);
  }
  pass('after acceptance every positive sends with exactly one reporter-less, kind-labeled flag');
  for (const state of [{ status: 'completed' }, { status: 'no_show' },
    { status: 'cancelled', cancelled_from_status: 'confirmed' },
    { status: 'cancelled', cancelled_from_status: null, accepted_at: '2026-01-01T12:00:00Z' }]) {
    ok((await svc.from('bookings').update(state).eq('id', bookingId)).error);
    for (const client of [student, tutor]) assert.equal((await flags(await send(client, '@learner'))).length, 1);
  }
  pass('completed, no-show, cancelled-from-confirmed and accepted_at each retain acceptance');
  const both = await send(student, 'this fucking app, use Venmo');
  assert.equal((await flags(both)).length, 1);
  pass('combined profanity / contact content creates one flag, labeled as contact info');
  const edit = await student.from('messages').update({ content: 'edited @learner' }).eq('id', flaggedIds[0]).select('id');
  assert.ok(edit.error || edit.data?.length === 0);
  assert.equal((await flags(flaggedIds[0])).length, 1);
  pass('clients cannot edit messages or duplicate a flag through updates');
  const hidden = await third.from('content_reports').select('id').in('target_message_id', flaggedIds);
  ok(hidden.error); assert.equal(hidden.data!.length, 0);
  pass('third user cannot read contact flags');
  ok((await svc.from('user_roles').insert({ user_id: t, role: 'admin' })).error);
  ok((await svc.from('bookings').update({ status: 'pending', accepted_at: null, cancelled_from_status: null }).eq('id', bookingId)).error);
  assert.equal((await flags(await send(tutor, 'admin contact 2055551234'))).length, 0);
  const room = await svc.from('conversations').select('id').eq('kind', 'admin').single(); ok(room.error);
  const roomMessage = await tutor.rpc('send_message_with_attachments', { p_conversation_id: room.data!.id, p_content: 'admin contact 2055551234', p_attachments: [] });
  ok(roomMessage.error);
  const roomId = (Array.isArray(roomMessage.data) ? roomMessage.data[0] : roomMessage.data).id;
  assert.equal((await flags(roomId)).length, 0);
  ok((await svc.from('messages').delete().eq('id', roomId)).error);
  pass('admin participants and admin team room remain exempt');
  for (const screen of ['chat', 'chat_tutor']) {
    const source = readFileSync(`apps/mobile/app/${screen}.tsx`, 'utf8');
    assert.match(source, /await api\.chat\.sendMessage[\s\S]*?setDraft\(''\)/);
    assert.match(source, /Alert\.alert\('Message not sent', errText/);
    assert.match(source, /editable=\{!blocked && !sending\}/);
  }
  pass('both mobile composers retain drafts until success and surface server errors');
  console.log(`\n${checks} passed, 0 failed`);
} finally {
  if (bookingId) ok((await svc.from('bookings').delete().eq('id', bookingId)).error);
  if (conversation) ok((await svc.from('conversations').delete().eq('id', conversation)).error);
  for (const id of users) { ok((await svc.from('users').delete().eq('id', id)).error); ok((await svc.auth.admin.deleteUser(id)).error); }
}
