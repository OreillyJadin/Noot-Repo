import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BookingError, isBlockedBetween, resolveBooking } from '../_shared/booking.ts';
import { cancellationDeadlineFor } from '../_shared/cancellation.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

const HORIZON_MS = 13 * 24 * 60 * 60 * 1000;

type BookingSeries = {
  id: string;
  student_id: string;
  tutor_id: string;
  subject: string;
  first_scheduled_at: string;
  duration_minutes: number;
  price: number;
  student_fee: number;
  platform_fee: number;
  tutor_payout_amount: number;
  session_type: string;
  location: string | null;
  weeks: number;
  next_index: number;
  stripe_setup_intent_id: string;
  stripe_payment_method_id: string;
};

serveWithErrorReporting('create-series-bookings', async (req: Request) => {
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!service || req.headers.get('Authorization') !== `Bearer ${service}`) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, service);
  const { data: expired, error: loadError } = await db.from('booking_series')
    .select('*').eq('status', 'active').order('created_at').order('id');
  if (loadError) throw loadError;

  const candidates = expired ?? [];
  let created = 0;
  let skipped = 0;
  let ended = 0;
  let completed = 0;
  let failed = 0;
  let due = 0;

  const notify = async (
    userId: string,
    title: string,
    body: string,
    seriesId: string,
    bookingId?: string,
  ) => {
    const { error } = await db.rpc('create_notification', {
      p_user: userId,
      p_type: 'booking',
      p_title: title,
      p_body: body,
      p_data: { seriesId, ...(bookingId ? { bookingId } : {}) },
    });
    if (error) console.error('create-series-bookings: notification failed', seriesId, userId, error.message);
  };

  const notifyBoth = async (
    series: BookingSeries,
    title: string,
    body: string,
    bookingId?: string,
  ) => {
    await Promise.all([
      notify(series.student_id, title, body, series.id, bookingId),
      notify(series.tutor_id, title, body, series.id, bookingId),
    ]);
  };

  const advance = async (series: BookingSeries, index: number, status?: string) => {
    const update: Record<string, unknown> = { next_index: index + 1 };
    if (status) update.status = status;
    const { data, error } = await db.from('booking_series').update(update)
      .eq('id', series.id).eq('status', 'active').eq('next_index', index)
      .select('id').maybeSingle();
    if (error) throw error;
    return !!data;
  };

  const chicagoDate = (value: string) => new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(value));

  for (const series of candidates) {
    try {
      const index = Number(series.next_index);
      const weeks = Number(series.weeks);
      if (index >= weeks) {
        const { data, error } = await db.from('booking_series')
          .update({ status: 'completed' })
          .eq('id', series.id).eq('status', 'active').eq('next_index', index)
          .select('id').maybeSingle();
        if (error) throw error;
        if (data) completed++;
        continue;
      }

      const { data: scheduledAt, error: timeError } = await db.rpc('booking_series_occurrence_time', {
        p_first: series.first_scheduled_at,
        p_index: index,
      });
      if (timeError) throw timeError;
      if (new Date(scheduledAt as string).getTime() > Date.now() + HORIZON_MS) continue;
      if (due >= 50) break;
      due++;

      const { data: users, error: usersError } = await db.from('users')
        .select('id,status,deleted_at').in('id', [series.student_id, series.tutor_id]);
      if (usersError) throw usersError;
      const byId = new Map((users ?? []).map((user) => [user.id, user]));
      const student = byId.get(series.student_id);
      const tutor = byId.get(series.tutor_id);
      let endReason: string | null = null;
      if (!student || student.status !== 'active' || student.deleted_at !== null ||
          !tutor || tutor.status !== 'active' || tutor.deleted_at !== null) {
        endReason = 'party_inactive';
      }
      if (!endReason) {
        const { data: profile, error } = await db.from('tutor_profiles')
          .select('approval_status').eq('user_id', series.tutor_id).maybeSingle();
        if (error) throw error;
        if (profile?.approval_status !== 'approved') endReason = 'tutor_not_approved';
      }
      if (!endReason) {
        const { data: course, error } = await db.from('tutor_courses')
          .select('id').eq('tutor_id', series.tutor_id).eq('course_code', series.subject).maybeSingle();
        if (error) throw error;
        if (!course) endReason = 'course_removed';
      }
      if (!endReason && await isBlockedBetween(db, series.student_id, series.tutor_id)) {
        endReason = 'blocked';
      }

      if (endReason) {
        const { data, error } = await db.from('booking_series')
          .update({ status: 'ended', end_reason: endReason })
          .eq('id', series.id).eq('status', 'active').eq('next_index', index)
          .select('id').maybeSingle();
        if (error) throw error;
        if (data) {
          ended++;
          await notifyBoth(series, 'Weekly sessions ended', 'Your weekly sessions can no longer continue. No more sessions will be booked.', undefined);
        }
        continue;
      }

      try {
        await resolveBooking(db, {
          studentId: series.student_id,
          tutorId: series.tutor_id,
          courseCode: series.subject,
          durationMinutes: series.duration_minutes,
          scheduledAt: scheduledAt as string,
        });
      } catch (error) {
        if (!(error instanceof BookingError)) throw error;
        if (await advance(series, index)) {
          skipped++;
          await notifyBoth(
            series,
            'Weekly session skipped',
            `Your weekly ${series.subject} session on ${chicagoDate(scheduledAt as string)} was skipped because the time isn't available.`,
          );
        }
        continue;
      }

      const deadline = cancellationDeadlineFor(new Date(scheduledAt as string)).toISOString();
      const { data: booking, error: insertError } = await db.from('bookings').insert({
        student_id: series.student_id,
        tutor_id: series.tutor_id,
        subject: series.subject,
        scheduled_at: scheduledAt,
        duration_minutes: series.duration_minutes,
        price: series.price,
        student_fee: series.student_fee,
        platform_fee: series.platform_fee,
        tutor_payout_amount: series.tutor_payout_amount,
        credit_applied: 0,
        session_type: series.session_type,
        location: series.location,
        status: 'confirmed',
        accepted_at: new Date().toISOString(),
        cancellation_deadline: deadline,
        refund_status: 'not_applicable',
        stripe_setup_intent_id: series.stripe_setup_intent_id,
        stripe_payment_method_id: series.stripe_payment_method_id,
        hold_due_at: new Date(new Date(scheduledAt as string).getTime() - 48 * 60 * 60 * 1000).toISOString(),
        series_id: series.id,
        series_index: index,
      }).select('id').single();

      let wasCreated = !insertError;
      let bookingId = booking?.id as string | undefined;
      if (insertError) {
        if (insertError.code === '23505' && insertError.message.includes('bookings_series_id_series_index_key')) {
          wasCreated = false;
          const { data: existing, error: existingError } = await db.from('bookings')
            .select('id').eq('series_id', series.id).eq('series_index', index).maybeSingle();
          if (existingError) throw existingError;
          bookingId = existing?.id;
        } else if (insertError.code === '23P01' || insertError.code === '40P01') {
          if (await advance(series, index)) {
            skipped++;
            await notifyBoth(
              series,
              'Weekly session skipped',
              `Your weekly ${series.subject} session on ${chicagoDate(scheduledAt as string)} was skipped because the time isn't available.`,
            );
          }
          continue;
        } else {
          throw insertError;
        }
      }

      const nextIndex = index + 1;
      if (await advance(series, index, nextIndex >= weeks ? 'completed' : undefined)) {
        if (wasCreated) created++;
        if (nextIndex >= weeks) completed++;
        await notifyBoth(
          series,
          'Weekly session booked',
          `Your weekly ${series.subject} session on ${chicagoDate(scheduledAt as string)} is booked.`,
          bookingId,
        );
      }
    } catch (error) {
      failed++;
      console.error('create-series-bookings: series processing failed', series.id, error);
    }
  }

  return Response.json({ created, skipped, ended, completed, failed });
});
