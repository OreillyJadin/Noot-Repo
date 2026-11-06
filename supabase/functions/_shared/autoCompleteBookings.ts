import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { completeBooking, type CompleteResult } from './completeBooking.ts';
import { fetchAttendance, classifyAttendance } from './daily.ts';
import { cancelParentExtensions } from './extensions.ts';
import { settleNoShow } from './settleNoShow.ts';

type BookingRow = {
  id: string;
  student_id: string;
  tutor_id: string;
  status: string;
  scheduled_at: string;
  scheduled_end: string;
  duration_minutes: number;
  session_type: string;
  daily_room_name: string | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id?: string | null;
  payout_failed_at?: string | null;
  tutor_payout_amount: number;
  price: number;
  created_at: string;
  hold_placed_at: string | null;
  no_show_claim_party?: 'student' | 'tutor' | null;
  no_show_claimed_at?: string | null;
  no_show_contested_at?: string | null;
  completion_claimed_at?: string | null;
  completion_objected_at?: string | null;
  extends_booking_id?: string | null;
};

const bookingFields = 'id, student_id, tutor_id, status, scheduled_at, scheduled_end, duration_minutes, session_type, daily_room_name, stripe_payment_intent_id, stripe_transfer_id, payout_failed_at, tutor_payout_amount, price, created_at, hold_placed_at, no_show_claim_party, no_show_claimed_at, no_show_contested_at, completion_claimed_at, completion_objected_at, extends_booking_id';

async function attendance(booking: BookingRow, durationMinutes = Number(booking.duration_minutes)) {
  if (booking.session_type !== 'video' || !booking.daily_room_name) {
    return { map: null, snapshot: { checked_at: new Date().toISOString(), unavailable: true } as Record<string, unknown> };
  }
  const map = await fetchAttendance(
    booking.daily_room_name, booking.scheduled_at, durationMinutes, booking.student_id, booking.tutor_id,
  );
  const snapshot = map
    ? {
      checked_at: new Date().toISOString(),
      student_seconds: Math.round(map.get(booking.student_id) ?? 0),
      tutor_seconds: Math.round(map.get(booking.tutor_id) ?? 0),
    }
    : { checked_at: new Date().toISOString(), unavailable: true };
  return { map, snapshot };
}

function holdExpired(booking: BookingRow, sixDaysAgo: Date): boolean {
  if (!booking.stripe_payment_intent_id) return false;
  const basis = booking.hold_placed_at ?? booking.created_at;
  return Date.parse(basis) <= sixDaysAgo.getTime();
}

async function markUnderReview(
  db: SupabaseClient,
  booking: BookingRow,
  reason: string,
  snapshot: Record<string, unknown>,
  claimKind: 'no_show' | 'completion' | 'fallback',
) {
  let query = db.from('bookings').update({
    dispute_status: 'flagged',
    dispute_reason: reason,
    attendance: snapshot,
  }).eq('id', booking.id).eq('status', 'confirmed').eq('dispute_status', 'none');
  if (claimKind === 'no_show') {
    query = query.eq('no_show_claimed_at', booking.no_show_claimed_at).is('no_show_contested_at', null);
  } else {
    query = query.is('no_show_claimed_at', null);
    query = booking.completion_claimed_at
      ? query.eq('completion_claimed_at', booking.completion_claimed_at)
      : query.is('completion_claimed_at', null);
  }
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function autoCompleteBookings(
  db: SupabaseClient,
  url: string,
  complete: typeof completeBooking = completeBooking,
  clock = new Date(),
): Promise<CompleteResult> {
  const now = clock.toISOString();
  const ended48HoursAgo = new Date(clock.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const created6DaysAgo = new Date(clock.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const held4DaysAgo = new Date(clock.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const held6DaysAgo = new Date(clock.getTime() - 6 * 24 * 60 * 60 * 1000);
  const retryBefore = new Date(clock.getTime() - 60 * 60 * 1000).toISOString();
  const retryDue = `payout_failed_at.lt.${retryBefore},and(payout_failed_at.is.null,stripe_transfer_id.is.null,updated_at.lt.${retryBefore})`;

  const { data: fallback, error: fallbackError } = await db.from('bookings').select(bookingFields)
    .eq('status', 'confirmed').eq('dispute_status', 'none').is('no_show_party', null)
    .is('no_show_claimed_at', null).is('completion_claimed_at', null).is('extends_booking_id', null)
    .lte('scheduled_end', now)
    .or(`scheduled_end.lte.${ended48HoursAgo},and(stripe_payment_intent_id.not.is.null,hold_placed_at.lte.${held4DaysAgo}),and(hold_placed_at.is.null,stripe_payment_intent_id.not.is.null,created_at.lte.${created6DaysAgo})`)
    .order('scheduled_end', { ascending: true }).limit(25);
  if (fallbackError) {
    console.error('auto-complete-sessions: booking lookup failed');
    return { status: 500, body: { error: 'Could not load sessions' } };
  }

  const { data: noShowClaims, error: noShowError } = await db.from('bookings').select(bookingFields)
    .eq('status', 'confirmed').eq('dispute_status', 'none').is('no_show_party', null)
    .not('no_show_claimed_at', 'is', null).is('no_show_contested_at', null).is('extends_booking_id', null)
    .lte('scheduled_end', now).order('no_show_claimed_at', { ascending: true }).limit(25);
  if (noShowError) return { status: 500, body: { error: 'Could not load no-show claims' } };

  const { data: completionClaims, error: completionError } = await db.from('bookings').select(bookingFields)
    .eq('status', 'confirmed').eq('dispute_status', 'none').is('no_show_party', null)
    .is('no_show_claimed_at', null).not('completion_claimed_at', 'is', null).is('completion_objected_at', null).is('extends_booking_id', null)
    .lte('scheduled_end', now).order('completion_claimed_at', { ascending: true }).limit(25);
  if (completionError) return { status: 500, body: { error: 'Could not load completion claims' } };

  const { data: retries, error: retryError } = await db.from('bookings')
    .select('id, tutor_id, status, scheduled_at, duration_minutes, stripe_payment_intent_id, stripe_transfer_id, payout_failed_at, tutor_payout_amount, price, extends_booking_id')
    .eq('status', 'completed').eq('dispute_status', 'none').is('no_show_party', null)
    .is('extends_booking_id', null)
    .gt('price', 0).gt('tutor_payout_amount', 0).like('stripe_payment_intent_id', 'pi_%')
    .or(retryDue).order('payout_failed_at', { ascending: true, nullsFirst: true })
    .order('updated_at', { ascending: true }).limit(25);
  if (retryError) return { status: 500, body: { error: 'Could not load payout retries' } };

  const { data: extensionRows, error: extensionError } = await db.from('bookings')
    .select('extends_booking_id, status, payout_failed_at, stripe_transfer_id, updated_at')
    .not('extends_booking_id', 'is', null)
    .in('status', ['pending', 'confirmed', 'completed'])
    .limit(500);
  if (extensionError) return { status: 500, body: { error: 'Could not load session extensions' } };
  const extensionParentIds = [...new Set((extensionRows ?? [])
    .map((row) => row.extends_booking_id as string | null)
    .filter((id): id is string => !!id))];
  let extensionParents: BookingRow[] = [];
  if (extensionParentIds.length) {
    const { data: parents, error: parentsError } = await db.from('bookings')
      .select(bookingFields).in('id', extensionParentIds)
      .in('status', ['completed', 'cancelled', 'no_show']);
    if (parentsError) return { status: 500, body: { error: 'Could not load settled extension parents' } };
    const parentsById = new Map((parents ?? []).map((parent) => [parent.id, parent as BookingRow]));
    const needsWork = new Set((extensionRows ?? []).filter((row) => {
      const parent = parentsById.get(row.extends_booking_id as string);
      if (!parent) return false;
      if (parent.status === 'completed' && row.status !== 'completed') return true;
      if (parent.status === 'cancelled' || parent.status === 'no_show') {
        return row.status === 'pending' || row.status === 'confirmed';
      }
      return row.status === 'completed' && (
        (!!row.payout_failed_at && row.payout_failed_at < retryBefore) ||
        (!row.payout_failed_at && !row.stripe_transfer_id && row.updated_at < retryBefore)
      );
    }).map((row) => row.extends_booking_id as string));
    extensionParents = [...needsWork].map((id) => parentsById.get(id)!).filter(Boolean);
  }

  const candidates = [
    ...(fallback ?? []),
    ...(noShowClaims ?? []),
    ...(completionClaims ?? []),
    ...(retries ?? []),
    ...extensionParents,
  ];
  const tutorIds: string[] = [...new Set(
    candidates.map((booking) => booking.tutor_id).filter((id): id is string => typeof id === 'string' && id.length > 0),
  )];
  const tutorById = new Map<string, { status: string; deleted_at: string | null }>();
  if (tutorIds.length) {
    const { data: tutors, error: tutorError } = await db
      .from('users')
      .select('id, status, deleted_at')
      .in('id', tutorIds);
    if (tutorError) {
      console.error('auto-complete-sessions: tutor lookup failed');
      return { status: 500, body: { error: 'Could not check tutor availability' } };
    }
    for (const tutor of tutors ?? []) tutorById.set(tutor.id, tutor);
  }

  const candidateIds = [...new Set(candidates.map((booking) => booking.id))];
  const extensionDurationByParent = new Map<string, number>();
  const extensionEndByParent = new Map<string, string>();
  if (candidateIds.length) {
    const { data: activeExtensions, error: activeExtensionError } = await db.from('bookings')
      .select('extends_booking_id, duration_minutes, scheduled_end')
      .in('extends_booking_id', candidateIds).eq('status', 'confirmed');
    if (activeExtensionError) return { status: 500, body: { error: 'Could not load active session extensions' } };
    for (const extension of activeExtensions ?? []) {
      const parentId = extension.extends_booking_id as string;
      extensionDurationByParent.set(parentId, Number(extension.duration_minutes));
      extensionEndByParent.set(parentId, extension.scheduled_end as string);
    }
  }
  const effectiveDuration = (booking: BookingRow) =>
    Number(booking.duration_minutes) + (extensionDurationByParent.get(booking.id) ?? 0);
  const sessionEnded = (booking: BookingRow) =>
    Date.parse(extensionEndByParent.get(booking.id) ?? booking.scheduled_end) <= clock.getTime();

  let completed = 0;
  let noShowsSettled = 0;
  let holdExpiredCount = 0;
  let failed = 0;
  const isTutorEligible = (booking: Pick<BookingRow, 'id' | 'tutor_id'>): boolean => {
    const tutor = tutorById.get(booking.tutor_id);
    if (!tutor || tutor.status !== 'active' || tutor.deleted_at !== null) {
      console.error('auto-complete-sessions: skipped booking for inactive or deleted tutor', booking.id);
      return false;
    }
    return true;
  };

  const processCompletion = async (booking: BookingRow) => {
    if (!sessionEnded(booking)) return;
    const claimKind = booking.completion_claimed_at ? 'completion' : 'fallback';
    const { map, snapshot } = await attendance(booking, effectiveDuration(booking));
    if (booking.session_type === 'video' && map && !classifyAttendance({
      studentSeconds: Math.round(map.get(booking.student_id) ?? 0),
      tutorSeconds: Math.round(map.get(booking.tutor_id) ?? 0),
    }).tutorAttended) {
      await markUnderReview(db, booking, 'Completed with no tutor video attendance', snapshot, claimKind);
      return;
    }
    let eligibility = db.from('bookings').update({ attendance: snapshot })
      .eq('id', booking.id).eq('status', 'confirmed').eq('dispute_status', 'none')
      .is('no_show_claimed_at', null);
    eligibility = booking.completion_claimed_at
      ? eligibility.eq('completion_claimed_at', booking.completion_claimed_at)
      : eligibility.is('completion_claimed_at', null);
    const { data: ready, error: attendanceError } = await eligibility.select('id').maybeSingle();
    if (attendanceError) throw attendanceError;
    if (!ready) return;
    const result = await complete(db, url, booking);
    if (result.status === 200 && result.body.status === 'completed') completed += 1;
    else if (result.body.holdExpired === true) holdExpiredCount += 1;
    else {
      failed += 1;
      console.error('auto-complete-sessions: booking was not completed', booking.id);
    }
  };

  for (const booking of (noShowClaims ?? []) as BookingRow[]) {
    if (!sessionEnded(booking)) continue;
    const claimAt = Date.parse(booking.no_show_claimed_at ?? '');
    const dueByWindow = Number.isFinite(claimAt) && claimAt <= clock.getTime() - 24 * 60 * 60 * 1000;
    if (!dueByWindow && !holdExpired(booking, held6DaysAgo)) continue;
    if (!isTutorEligible(booking)) continue;
    try {
      const { map, snapshot } = await attendance(booking, effectiveDuration(booking));
      const accusedId = booking.no_show_claim_party === 'tutor' ? booking.tutor_id : booking.student_id;
      if (booking.session_type === 'video' && map && classifyAttendance({
        studentSeconds: Math.round(map.get(booking.student_id) ?? 0),
        tutorSeconds: Math.round(map.get(booking.tutor_id) ?? 0),
      })[booking.no_show_claim_party === 'tutor' ? 'tutorAttended' : 'studentAttended']) {
        await markUnderReview(db, booking, 'No-show report contradicted by video attendance', snapshot, 'no_show');
        continue;
      }
      const { data: stillOpen, error } = await db.from('bookings').update({ attendance: snapshot })
        .eq('id', booking.id).eq('status', 'confirmed').eq('dispute_status', 'none')
        .eq('no_show_claimed_at', booking.no_show_claimed_at).is('no_show_contested_at', null)
        .select('id').maybeSingle();
      if (error) throw error;
      if (!stillOpen) continue;
      const result = await settleNoShow(db, booking.id, booking.no_show_claim_party ?? 'student');
      if (result.status === 200) noShowsSettled += 1;
      else {
        failed += 1;
        console.error('auto-complete-sessions: no-show claim settlement failed', booking.id);
      }
    } catch {
      failed += 1;
      console.error('auto-complete-sessions: no-show claim failed', booking.id);
    }
  }

  for (const booking of (completionClaims ?? []) as BookingRow[]) {
    const claimAt = Date.parse(booking.completion_claimed_at ?? '');
    if (!(Number.isFinite(claimAt) && claimAt <= clock.getTime() - 24 * 60 * 60 * 1000)
        && !holdExpired(booking, held6DaysAgo)) continue;
    if (!isTutorEligible(booking)) continue;
    try { await processCompletion(booking); }
    catch {
      failed += 1;
      console.error('auto-complete-sessions: completion claim failed', booking.id);
    }
  }
  for (const booking of (fallback ?? []) as BookingRow[]) {
    if (!isTutorEligible(booking)) continue;
    try { await processCompletion(booking); }
    catch {
      failed += 1;
      console.error('auto-complete-sessions: booking failed', booking.id);
    }
  }

  for (const booking of retries ?? []) {
    if (!isTutorEligible(booking)) continue;
    try {
      const { data: claimed, error } = await db.from('bookings').update({ payout_failed_at: now })
        .eq('id', booking.id).eq('status', 'completed').or(retryDue).select('id');
      if (error) throw error;
      if (!claimed?.length) continue;
      const result = await complete(db, url, booking);
      if (result.status === 200 && result.body.status === 'completed') completed += 1;
      else {
        failed += 1;
        console.error('auto-complete-sessions: payout retry failed', booking.id);
      }
    } catch {
      failed += 1;
      console.error('auto-complete-sessions: payout retry failed', booking.id);
    }
  }

  const alreadyProcessed = new Set([
    ...(fallback ?? []),
    ...(noShowClaims ?? []),
    ...(completionClaims ?? []),
    ...(retries ?? []),
  ].map((booking) => booking.id));
  for (const booking of extensionParents) {
    if (alreadyProcessed.has(booking.id) || !isTutorEligible(booking)) continue;
    try {
      if (booking.status === 'cancelled' || booking.status === 'no_show') {
        await cancelParentExtensions(db, booking.id);
        continue;
      }
      const result = await complete(db, url, booking);
      if (result.status === 200 && result.body.status === 'completed') completed += 1;
      else {
        failed += 1;
        console.error('auto-complete-sessions: extension settlement retry failed', booking.id);
      }
    } catch {
      failed += 1;
      console.error('auto-complete-sessions: extension settlement retry failed', booking.id);
    }
  }

  return { status: 200, body: { completed, noShowsSettled, holdExpired: holdExpiredCount, failed } };
}
