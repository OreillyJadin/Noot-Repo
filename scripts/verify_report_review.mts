// Local stack only: reporting as a non-owner, including hostile raw inserts.
// pnpm dlx tsx scripts/verify_report_review.mts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { api, initSupabase } from '../packages/core/src/index.ts';
import { DEV_PASSWORD } from './_devPassword.mjs';

const URL = 'http://127.0.0.1:54321';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const users: string[] = [];
const bookings: string[] = [];
const reviews: string[] = [];
const clients: ReturnType<typeof createClient>[] = [];
let passed = 0;
function check(name: string, ok: boolean) {
  assert.ok(ok, name);
  console.log(`✅ ${name}`);
  passed++;
}
async function user(label: string) {
  const email = `reviewreport+${Date.now()}.${label}@crimson.ua.edu`;
  const result = await svc.auth.admin.createUser({ email, password: DEV_PASSWORD, email_confirm: true });
  if (result.error) throw result.error;
  const id = result.data.user!.id;
  users.push(id);
  const name = await svc.from('users').update({ first_name: label, last_name: 'ReportTest' }).eq('id', id);
  if (name.error) throw name.error;
  const c = initSupabase({ url: URL, anonKey: ANON });
  clients.push(c);
  const login = await c.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (login.error) throw login.error;
  return { id, c, session: login.data.session! };
}

try {
  const author = await user('Author');
  const tutor = await user('Tutor');
  const other = await user('Other');
  const student = await user('Student');
  for (let i = 0; i < 12; i++) {
    const booking = await svc.from('bookings').insert({
      student_id: author.id, tutor_id: tutor.id, subject: 'AC 210',
      scheduled_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      duration_minutes: 60, price: 30, tutor_payout_amount: 24, session_type: 'video',
      status: 'completed', cancellation_deadline: new Date().toISOString(),
    }).select('id').single();
    if (booking.error) throw booking.error;
    bookings.push(booking.data.id);
    const review = await svc.from('reviews').insert({
      booking_id: booking.data.id, reviewer_id: author.id, subject_user_id: tutor.id,
      rating: 4, comment: `Review report verification ${i}`, approval_status: i === 11 ? 'pending' : 'approved',
    }).select('id').single();
    if (review.error) throw review.error;
    reviews.push(review.data.id);
  }
  const raw = (reviewId: string, extra = {}) => student.c.from('content_reports').insert({
    reporter_id: student.id, target_kind: 'review', target_review_id: reviewId, reason: 'harassment', ...extra,
  });
  await api.moderation.reportReview(reviews[0], 'harassment', ' Please investigate. ');
  const own = await student.c.from('content_reports').select('*').eq('target_review_id', reviews[0]).single();
  if (own.error) throw own.error;
  check('non-owner student reports an approved review through core API', own.data.detail === 'Please investigate.' && own.data.target_kind === 'review');
  check('duplicate report rejected', (await raw(reviews[0])).error?.code === '23505');
  check('missing review rejected', !!(await raw(randomUUID())).error);
  check('unpublished review rejected', !!(await raw(reviews[11])).error);
  check('mixed targets rejected', !!(await raw(reviews[1], { target_user_id: tutor.id })).error);
  check('disguising a review report as a user report rejected', !!(await raw(reviews[1], { target_kind: 'user', target_user_id: tutor.id })).error);
  check('spoofed reporter rejected', !!(await raw(reviews[1], { reporter_id: other.id })).error);
  check('invalid reason rejected', !!(await raw(reviews[1], { reason: 'invalid' })).error);
  check('pre-resolved report rejected', !!(await raw(reviews[1], { status: 'dismissed' })).error);
  check('oversized detail rejected', !!(await raw(reviews[1], { detail: 'x'.repeat(2001) })).error);
  const self = await author.c.from('content_reports').insert({ reporter_id: author.id, target_kind: 'review', target_review_id: reviews[1], reason: 'spam' });
  check('author cannot report own review', !!self.error);
  const privateRead = await other.c.from('content_reports').select('id').eq('id', own.data.id);
  if (privateRead.error) throw privateRead.error;
  check('student cannot read another person’s report', privateRead.data.length === 0);
  const edit = await student.c.from('content_reports').update({ status: 'dismissed' }).eq('id', own.data.id).select('id');
  if (edit.error) throw edit.error;
  check('reporter cannot resolve report', edit.data.length === 0);
  const nullTarget = await raw(reviews[1], { target_review_id: null });
  check('empty review target rejected', !!nullTarget.error);
  const race = await Promise.all([raw(reviews[1]), raw(reviews[1])]);
  check('concurrent duplicate reports allow exactly one insert', race.filter(r => !r.error).length === 1 && race.some(r => r.error?.code === '23505'));
  for (let i = 2; i < 10; i++) {
    const result = await raw(reviews[i], { created_at: '2000-01-01T00:00:00Z' });
    if (result.error) throw result.error;
  }
  check('hourly limit blocks an eleventh report despite attempted backdating', (await raw(reviews[10])).error?.code === '42900');
  const suspended = await svc.from('users').update({ status: 'suspended' }).eq('id', other.id);
  if (suspended.error) throw suspended.error;
  const inactive = await other.c.from('content_reports').insert({ reporter_id: other.id, target_kind: 'review', target_review_id: reviews[0], reason: 'spam' });
  check('inactive caller rejected with existing token', !!inactive.error);
  const admin = initSupabase({ url: URL, anonKey: ANON });
  clients.push(admin);
  const login = await admin.auth.signInWithPassword({ email: 'admin@crimson.ua.edu', password: DEV_PASSWORD });
  if (login.error) throw login.error;
  const reports = await api.admin.listReports();
  const found = reports.find(r => r.id === own.data.id);
  check('admin queue includes review text, author and tutor', found?.reviewContent === 'Review report verification 0' && found.reviewAuthorName === 'Author ReportTest' && found.reviewTutorName === 'Tutor ReportTest');
  const empty = await admin.from('content_reports').select('id').eq('target_review_id', reviews[11]);
  if (empty.error) throw empty.error;
  check('invalid attempts did not create reports', empty.data.length === 0);
  console.log(`\n${passed} passed, 0 failed`);
} finally {
  for (const c of clients) await c.auth.signOut({ scope: 'local' });
  if (reviews.length) {
    const reports = await svc.from('content_reports').delete().in('target_review_id', reviews);
    if (reports.error) throw reports.error;
  }
  if (bookings.length) {
    const result = await svc.from('bookings').delete().in('id', bookings);
    if (result.error) throw result.error;
  }
  for (const id of users.reverse()) {
    const row = await svc.from('users').delete().eq('id', id);
    if (row.error) throw row.error;
    const auth = await svc.auth.admin.deleteUser(id);
    if (auth.error) throw auth.error;
  }
}
