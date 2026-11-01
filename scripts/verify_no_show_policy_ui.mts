import { readFileSync } from 'node:fs';
import { canReportNoShow } from '../packages/core/src/sessionTiming.ts';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const report = source('apps/mobile/app/xns.tsx');
const tutorSessions = source('apps/mobile/app/tutor_sessions.tsx');
const tutorDetail = source('apps/mobile/app/tb2.tsx');
const cancel = source('apps/mobile/app/xtc.tsx');
const standing = source('apps/mobile/app/standing.tsx');
const backend = source('supabase/functions/report-no-show/index.ts');
const bookingRules = source('supabase/functions/_shared/booking.ts');
const admin = source('apps/mobile/app/admin_user.tsx');
let passed = 0, failed = 0;
const check = (ok: boolean, message: string) => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`);
};

const end = Date.parse('2026-11-01T20:00:00Z');
const booking = { status: 'confirmed' as const, scheduledAt: new Date(end - 3_600_000).toISOString(), durationMinutes: 60 };
check(!canReportNoShow(booking, end - 1), 'no reports before the scheduled end');
check(canReportNoShow(booking, end), 'reports open at the scheduled end');
check(canReportNoShow(booking, end + 48 * 3_600_000) && !canReportNoShow(booking, end + 48 * 3_600_000 + 1), '48-hour reporting boundary');
check(['pending', 'completed', 'cancelled', 'no_show'].every(status => !canReportNoShow({ ...booking, status: status as typeof booking.status }, end)), 'closed sessions and requests cannot be reported');
check(backend.includes('assertSessionElapsed(booking.scheduled_at') && backend.includes('withinHours: NO_SHOW_WINDOW_HOURS') && bookingRules.includes('NO_SHOW_WINDOW_HOURS = 48'), 'server retains authoritative after-end/48-hour enforcement');
check(report.includes('after the scheduled end, within 48 hours') && !/15\+? minutes late|1 hour after the scheduled start/.test(report), 'both personas describe the actual reporting window');
check(report.includes("booking.status === 'confirmed' && canReportNoShow") && report.includes('!!booking.bookingId') && report.includes('if (busy || !reportOpen) return') && report.includes('disabled={busy || !reportOpen}'), 'report screen blocks invalid draft timing and duplicate submissions');
check(tutorSessions.includes('canReportNoShow(r.booking, now)') && tutorSessions.includes('Report a student no-show') && tutorSessions.includes('...draftFromBooking(r.booking), tutor: toTutor(tutor)') && tutorSessions.includes("router.push('/xns')"), 'tutor Past can open a report with the full booking and own tutor profile');
check(report.includes("persona === 'tutor' ? '/tutor_home' : '/home'"), 'report completion returns to the correct role home');
check(cancel.includes('do not automatically change your ranking or add penalties') && !/affect your ranking|flags your account/.test(cancel), 'cancellation copy does not promise automatic ranking penalties');
check(tutorDetail.includes('Cancellations are recorded for admin review') && !/reliability score/.test(tutorDetail), 'tutor details sheet describes manual review, not automatic score changes');
check(tutorDetail.includes('patchBooking({ tutor: toTutor(own) })') && tutorDetail.includes('const tutor = booking.tutor;') && !tutorDetail.includes('fetchedTutor'), 'tutor detail stores the resolved profile for cold-start cancellation and reschedule routes');
check(standing.includes('Counts do not automatically pause bookings') && !/Needs attention|Repeated no-shows can pause/.test(standing), 'session record no longer invents an automatic restriction');
check(admin.includes('counts.tutorCancels30d') && admin.includes('counts.noShowsAsStudent + counts.noShowsAsTutor'), 'admin cancellation and no-show review counts remain available');
check(backend.includes('let refundPercent = tutorNoShow ? 100 : 0') && backend.includes('payTutor('), 'existing refund and payout outcomes remain intact');

console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
