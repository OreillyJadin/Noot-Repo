import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { isBlockedBetween } from '../_shared/booking.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  bookingId?: string;
  action?: 'accept' | 'decline';
  note?: string;
}

serveWithErrorReporting('respond-booking-request', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    const body = (await req.json().catch(() => ({}))) as Body;
    const { bookingId, action } = body;
    if (!bookingId) return Response.json({ error: 'bookingId is required' }, { status: 400, headers: cors });
    if (action !== 'accept' && action !== 'decline') {
      return Response.json({ error: 'Invalid action' }, { status: 400, headers: cors });
    }
    if (body.note !== undefined && typeof body.note !== 'string') {
      return Response.json({ error: 'note must be text' }, { status: 400, headers: cors });
    }
    const note = body.note?.trim() ?? '';
    if (note.length > 300) {
      return Response.json({ error: 'Note must be 300 characters or fewer' }, { status: 400, headers: cors });
    }

    const { data: booking, error: loadError } = await db
      .from('bookings')
      .select('id, student_id, tutor_id, subject, request_note, status, accept_by, scheduled_at, stripe_payment_intent_id')
      .eq('id', bookingId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors });
    if (booking.tutor_id !== user.id) {
      return Response.json({ error: 'Not authorized to respond to this request' }, { status: 403, headers: cors });
    }
    if (booking.status !== 'pending') {
      return Response.json({ error: 'This request is no longer pending' }, { status: 409, headers: cors });
    }

    const now = new Date();
    if (action === 'accept') {
      if (!booking.accept_by || now.getTime() >= new Date(booking.accept_by).getTime()) {
        return Response.json({ error: 'This request has expired' }, { status: 409, headers: cors });
      }
      const { data: updated, error: updateError } = await db
        .from('bookings')
        .update({ status: 'confirmed', accepted_at: now.toISOString() })
        .eq('id', bookingId)
        .eq('status', 'pending')
        .gt('accept_by', now.toISOString())
        .select('id')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) {
        return Response.json({ error: 'This request has expired or is no longer pending' }, { status: 409, headers: cors });
      }

      // Create the conversation when the tutor accepts, then post the student's
      // request note before the tutor's acceptance message. Skipped when either party has
      // blocked the other — service role bypasses messages_insert's block check.
      const blocked = await isBlockedBetween(db, booking.student_id, booking.tutor_id).catch((e) => {
        console.error('respond-booking-request: block check failed', bookingId, e?.message ?? e);
        return true; // can't prove the pair is unblocked → don't post
      });
      if (blocked) {
        console.log('respond-booking-request: accepted a blocked pair — skipping the chat message', bookingId);
      } else {
        const { data: conversation, error: conversationError } = await db
          .from('conversations')
          .upsert(
            { student_id: booking.student_id, tutor_id: booking.tutor_id },
            { onConflict: 'student_id,tutor_id' },
          )
          .select('id')
          .single();
        if (conversationError) {
          console.error('respond-booking-request: conversation upsert failed', bookingId, conversationError.message);
        } else {
          const requestNote = typeof booking.request_note === 'string' ? booking.request_note.trim() : '';
          if (requestNote) {
            const { error: requestNoteError } = await db.from('messages').insert({
              conversation_id: conversation.id,
              sender_id: booking.student_id,
              content: requestNote,
            });
            if (requestNoteError) {
              console.error('respond-booking-request: request note insert failed', bookingId, requestNoteError.message);
            }
          }
          const when = new Date(booking.scheduled_at).toLocaleString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric',
            hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
          });
          const { error: messageError } = await db.from('messages').insert({
            conversation_id: conversation.id,
            sender_id: user.id,
            content: `Accepted your ${booking.subject} session — see you ${when}!`,
          });
          if (messageError) console.error('respond-booking-request: acceptance message failed', bookingId, messageError.message);
        }
      }

      let tutorName = 'Your tutor';
      const { data: tutor } = await db.from('users').select('first_name').eq('id', user.id).maybeSingle();
      if (tutor?.first_name?.trim()) tutorName = tutor.first_name.trim();
      const { error: notificationError } = await db.rpc('create_notification', {
        p_user: booking.student_id,
        p_type: 'booking',
        p_title: 'Session confirmed',
        p_body: `${tutorName} accepted your ${booking.subject} session.`,
        p_data: { bookingId: booking.id },
      });
      if (notificationError) console.error('respond-booking-request: acceptance notification failed', bookingId);
      return Response.json({ status: 'confirmed' }, { headers: cors });
    }

    const { data: updated, error: updateError } = await db
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_by_role: 'tutor',
        cancelled_from_status: 'pending',
        cancelled_at: now.toISOString(),
        refund_percent: 100,
        refund_status: 'refunded',
        stripe_charge_id: null,
        stripe_transfer_id: null,
        cancel_reason: 'tutor_declined',
        decline_note: note || null,
      })
      .eq('id', bookingId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (updateError) {
      const errorText = [updateError.message, updateError.details, updateError.hint].filter(Boolean).join(' ');
      if (updateError.code === '23514') {
        if (/That wording breaks our community rules/i.test(errorText)) {
          return Response.json({ error: updateError.message }, { status: 400, headers: cors });
        }
        if (/bookings_decline_note_check/i.test(errorText)) {
          return Response.json({ error: 'Note must be 300 characters or fewer' }, { status: 400, headers: cors });
        }
      }
      throw updateError;
    }
    if (!updated) {
      return Response.json({ error: 'This request is no longer pending' }, { status: 409, headers: cors });
    }

    const { error: creditError } = await db.rpc('return_booking_credit', {
      p_booking: bookingId,
      p_percent: 100,
    });
    if (creditError) console.error('respond-booking-request: credit return failed', bookingId);

    const paymentIntentId = booking.stripe_payment_intent_id as string | null;
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    let holdReleased = !paymentIntentId || paymentIntentId.startsWith('sim_pi_');
    if (paymentIntentId?.startsWith('pi_') && stripeKey) {
      try {
        const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
        const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
        try {
          await stripe.paymentIntents.cancel(
            paymentIntentId,
            {},
            { idempotencyKey: `cancel_${bookingId}` },
          );
          holdReleased = true;
        } catch {
          try {
            const current = await stripe.paymentIntents.retrieve(paymentIntentId);
            holdReleased = current.status === 'canceled';
          } catch {
            holdReleased = false;
          }
        }
      } catch {
        holdReleased = false;
      }
      if (!holdReleased) console.error('respond-booking-request: payment hold release failed', bookingId);
    }
    if (holdReleased) {
      const { error: holdUpdateError } = await db
        .from('bookings')
        .update({ hold_released_at: now.toISOString() })
        .eq('id', bookingId)
        .eq('status', 'cancelled')
        .is('hold_released_at', null);
      if (holdUpdateError) console.error('respond-booking-request: hold release timestamp failed', bookingId);
    }

    let tutorName = 'Your tutor';
    const { data: tutor } = await db.from('users').select('first_name').eq('id', user.id).maybeSingle();
    if (tutor?.first_name?.trim()) tutorName = tutor.first_name.trim();
    const noteCopy = note ? ` Note: "${note}"` : '';
    const { error: notificationError } = await db.rpc('create_notification', {
      p_user: booking.student_id,
      p_type: 'booking',
      p_title: 'Session request declined',
      p_body: `${tutorName} can't make your ${booking.subject} session, so you won't be charged.${noteCopy}`,
      p_data: { bookingId: booking.id },
    });
    if (notificationError) console.error('respond-booking-request: decline notification failed', bookingId);
    return Response.json({ status: 'cancelled', refundPercent: 100, holdReleased }, { headers: cors });
  } catch (e) {
    console.error('respond-booking-request failed', e instanceof Error ? e.message : 'unknown error');
    return Response.json({ error: 'Could not respond to this booking request' }, { status: 400, headers: cors });
  }
});
