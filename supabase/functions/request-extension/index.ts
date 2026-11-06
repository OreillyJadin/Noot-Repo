import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { requireActiveUser } from '../_shared/auth.ts';
import { isBlockedBetween } from '../_shared/booking.ts';
import { splitPrice, studentFeeFor } from '../_shared/fees.ts';
import { ownedCustomerId } from '../_shared/stripeCustomer.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  bookingId?: string;
  minutes?: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const moneyError = "Your card couldn't be charged for extra time";

serveWithErrorReporting('request-extension', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    const body = await req.json().catch(() => ({})) as Body;
    if (typeof body.bookingId !== 'string' || !body.bookingId) {
      return Response.json({ error: 'bookingId is required' }, { status: 400, headers: cors });
    }
    if (body.minutes !== 30 && body.minutes !== 60) {
      return Response.json({ error: 'minutes must be 30 or 60' }, { status: 400, headers: cors });
    }

    const { data: parent, error: parentError } = await db.from('bookings')
      .select('id, student_id, tutor_id, subject, status, scheduled_at, scheduled_end, duration_minutes, price, session_type, location, meeting_link, daily_room_name, video_link_sent_at, daily_room_deleted_at, accept_by, cancellation_deadline, stripe_payment_intent_id, no_show_claimed_at, completion_claimed_at, dispute_status, extends_booking_id')
      .eq('id', body.bookingId).maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors });
    if (parent.student_id !== user.id) {
      return Response.json({ error: 'Only the student can request more time' }, { status: 403, headers: cors });
    }
    if (parent.status !== 'confirmed' || parent.extends_booking_id) {
      return Response.json({ error: 'This session cannot be extended' }, { status: 409, headers: cors });
    }
    if (parent.no_show_claimed_at || parent.completion_claimed_at || parent.dispute_status === 'flagged') {
      return Response.json({ error: 'This session is under review' }, { status: 409, headers: cors });
    }

    const now = Date.now();
    const end = new Date(parent.scheduled_end).getTime();
    if (!Number.isFinite(end) || now < end - 10 * 60_000 || now >= end) {
      return Response.json({ error: 'Add time is available during the last 10 minutes of a session' }, { status: 400, headers: cors });
    }
    const { data: tutor, error: tutorError } = await db.from('users')
      .select('first_name, last_name, status, deleted_at')
      .eq('id', parent.tutor_id).maybeSingle();
    if (tutorError) throw tutorError;
    if (!tutor || tutor.status !== 'active' || tutor.deleted_at) {
      return Response.json({ error: 'That tutor is no longer available' }, { status: 404, headers: cors });
    }
    if (await isBlockedBetween(db, user.id, parent.tutor_id)) {
      return Response.json({ error: 'This session cannot be extended' }, { status: 409, headers: cors });
    }

    const { data: existing, error: existingError } = await db.from('bookings')
      .select('id').eq('extends_booking_id', parent.id).in('status', ['pending', 'confirmed']).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return Response.json({ error: 'This session already has an extension request' }, { status: 409, headers: cors });

    const startsAt = new Date(end);
    const endsAt = new Date(end + body.minutes * 60_000);
    const startIso = startsAt.toISOString();
    const endIso = endsAt.toISOString();
    const { data: tutorClash, error: tutorClashError } = await db.from('bookings')
      .select('id')
      .eq('tutor_id', parent.tutor_id)
      .in('status', ['pending', 'confirmed'])
      .lt('scheduled_at', endIso)
      .gt('scheduled_end', startIso)
      .limit(1);
    if (tutorClashError) throw tutorClashError;
    if (tutorClash?.length) {
      const name = [tutor.first_name, tutor.last_name].filter(Boolean).join(' ') || 'Your tutor';
      return Response.json({ error: `${name} has another session right after` }, { status: 409, headers: cors });
    }
    const { data: studentClash, error: studentClashError } = await db.from('bookings')
      .select('id')
      .eq('student_id', user.id)
      .in('status', ['pending', 'confirmed'])
      .lt('scheduled_at', endIso)
      .gt('scheduled_end', startIso)
      .limit(1);
    if (studentClashError) throw studentClashError;
    if (studentClash?.length) {
      return Response.json({ error: 'You have another session right after' }, { status: 409, headers: cors });
    }

    const price = round2(Number(parent.price) * body.minutes / Number(parent.duration_minutes));
    const studentFee = studentFeeFor(price);
    const { data: profile, error: profileError } = await db.from('tutor_profiles')
      .select('grades_verified_at').eq('user_id', parent.tutor_id).maybeSingle();
    if (profileError) throw profileError;
    const gradesVerified = !!profile?.grades_verified_at;
    const split = splitPrice(price, gradesVerified);
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const stripe = secretKey ? new Stripe(secretKey, { apiVersion: '2024-06-20' }) : null;
    let paymentIntentId: string | null = null;
    let paymentMethodId: string | null = null;

    if (price > 0 && stripe) {
      let customerId: string;
      const parentIntentId = parent.stripe_payment_intent_id as string | null;
      if (parentIntentId?.startsWith('pi_')) {
        let parentIntent: Stripe.PaymentIntent;
        try {
          parentIntent = await stripe.paymentIntents.retrieve(parentIntentId);
        } catch {
          return Response.json({ error: moneyError }, { status: 402, headers: cors });
        }
        customerId = typeof parentIntent.customer === 'string'
          ? parentIntent.customer
          : parentIntent.customer?.id ?? '';
        paymentMethodId = typeof parentIntent.payment_method === 'string'
          ? parentIntent.payment_method
          : parentIntent.payment_method?.id ?? null;
        if (!customerId || !paymentMethodId) {
          return Response.json({ error: moneyError }, { status: 402, headers: cors });
        }
        let customer: Stripe.Customer | Stripe.DeletedCustomer;
        try {
          customer = await stripe.customers.retrieve(customerId);
        } catch {
          return Response.json({ error: moneyError }, { status: 402, headers: cors });
        }
        if ('deleted' in customer || customer.metadata?.user_id !== user.id) {
          return Response.json({ error: moneyError }, { status: 402, headers: cors });
        }
      } else {
        const customerIdOwned = await ownedCustomerId(stripe, db, user.id, user.email ?? '');
        const customer = await stripe.customers.retrieve(customerIdOwned);
        if ('deleted' in customer || customer.metadata?.user_id !== user.id) {
          return Response.json({ error: 'Add a card to add time' }, { status: 402, headers: cors });
        }
        customerId = customerIdOwned;
        const defaultMethod = customer.invoice_settings.default_payment_method;
        paymentMethodId = typeof defaultMethod === 'string' ? defaultMethod : defaultMethod?.id ?? null;
        if (!paymentMethodId) {
          const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
          paymentMethodId = methods.data[0]?.id ?? null;
        }
        if (!paymentMethodId) {
          return Response.json({ error: 'Add a card to add time' }, { status: 402, headers: cors });
        }
      }

      try {
        const intent = await stripe.paymentIntents.create({
          amount: Math.round((price + studentFee) * 100),
          currency: 'usd',
          customer: customerId,
          payment_method: paymentMethodId,
          payment_method_types: ['card'],
          capture_method: 'manual',
          off_session: true,
          confirm: true,
          metadata: {
            booking_kind: 'extension',
            parent_booking_id: parent.id,
            user_id: user.id,
            tutor_id: parent.tutor_id,
            scheduled_at: startIso,
            duration_minutes: String(body.minutes),
          },
        }, { idempotencyKey: `ext:${parent.id}:${body.minutes}` });
        if (intent.status !== 'requires_capture') {
          if (intent.status === 'succeeded') {
            await stripe.refunds.create(
              { payment_intent: intent.id },
              { idempotencyKey: `refund_ext_unexpected_${intent.id}` },
            ).catch((refundError) => console.error('request-extension: unexpected capture refund failed', intent.id, String(refundError)));
          } else if (intent.status !== 'canceled') {
            await stripe.paymentIntents.cancel(intent.id).catch(() => {});
          }
          return Response.json({ error: moneyError }, { status: 402, headers: cors });
        }
        paymentIntentId = intent.id;
      } catch (error) {
        const failedIntent = (error as { payment_intent?: string | { id?: string } })?.payment_intent;
        const failedIntentId = typeof failedIntent === 'string' ? failedIntent : failedIntent?.id;
        if (failedIntentId) {
          await stripe.paymentIntents.cancel(failedIntentId).catch(() => {});
        }
        console.error('request-extension: payment failed', String(error));
        return Response.json({ error: moneyError }, { status: 402, headers: cors });
      }
    } else if (price > 0) {
      paymentIntentId = `sim_pi_ext_${crypto.randomUUID()}`;
    }

    const deadline = new Date(now + 5 * 60_000).toISOString();
    const extensionRow = {
      student_id: parent.student_id,
      tutor_id: parent.tutor_id,
      subject: parent.subject,
      scheduled_at: startIso,
      scheduled_end: endIso,
      duration_minutes: body.minutes,
      status: 'pending',
      price,
      student_fee: studentFee,
      platform_fee: split.platformFee,
      tutor_payout_amount: split.tutorPayout,
      credit_applied: 0,
      session_type: parent.session_type,
      location: parent.location,
      meeting_link: parent.meeting_link,
      daily_room_name: parent.daily_room_name,
      video_link_sent_at: parent.video_link_sent_at,
      daily_room_deleted_at: parent.daily_room_deleted_at,
      accept_by: deadline,
      cancellation_deadline: parent.cancellation_deadline,
      stripe_payment_intent_id: paymentIntentId,
      stripe_payment_method_id: paymentMethodId,
      hold_placed_at: paymentIntentId ? new Date().toISOString() : null,
      hold_due_at: null,
      hold_failed_at: null,
      hold_released_at: null,
      extends_booking_id: parent.id,
    };
    const { data: extension, error: insertError } = await db.from('bookings')
      .insert(extensionRow).select('id').maybeSingle();
    if (insertError || !extension) {
      if (paymentIntentId?.startsWith('pi_') && stripe) {
        const { data: attached, error: attachedError } = await db.from('bookings').select('id')
          .eq('stripe_payment_intent_id', paymentIntentId).maybeSingle();
        if (!attachedError && !attached) await stripe.paymentIntents.cancel(paymentIntentId).catch(() => {});
        else if (attachedError) console.error('request-extension: could not verify PI attachment; leaving it uncancelled', paymentIntentId);
      }
      if (insertError?.code === '23P01' || insertError?.code === '23505' || insertError?.code === '23514') {
        return Response.json({ error: 'This session can no longer be extended' }, { status: 409, headers: cors });
      }
      if (insertError) throw insertError;
      return Response.json({ error: 'Could not create extension request' }, { status: 500, headers: cors });
    }

    const { data: studentProfile } = await db.from('users')
      .select('first_name, last_name').eq('id', user.id).maybeSingle();
    const studentName = [studentProfile?.first_name, studentProfile?.last_name].filter(Boolean).join(' ') || 'Your student';
    const minutesLabel = body.minutes === 60 ? '+60 min' : '+30 min';
    const { error: notifyError } = await db.rpc('create_notification', {
      p_user: parent.tutor_id,
      p_type: 'booking',
      p_title: 'Add-time request',
      p_body: `${studentName} wants ${minutesLabel}. Accept within 5 minutes.`,
      p_data: { bookingId: parent.id, extensionBookingId: extension.id },
    });
    if (notifyError) console.error('request-extension: tutor notification failed', notifyError.message);
    return Response.json({
      bookingId: extension.id,
      parentBookingId: parent.id,
      status: 'pending',
      minutes: body.minutes,
      price,
      studentFee,
      total: round2(price + studentFee),
      acceptBy: deadline,
    }, { headers: cors });
  } catch (error) {
    console.error('request-extension failed', error);
    return Response.json({ error: 'Could not request more time' }, { status: 500, headers: cors });
  }
});
