import type Stripe from 'https://esm.sh/stripe@16?target=deno';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { BookingError, assertPayoutReady } from './booking.ts';
import { cancelParentExtensions } from './extensions.ts';
import { otherOutcomeTransferExists, payTutor } from './payouts.ts';
import { capturedRefundCents, chargeRefundedCents, chargeRefundPercent, refundOwedCents } from './refunds.ts';
import { updateConfirmedBookingRaiseOnly } from './refundWrite.ts';

export type NoShowParty = 'student' | 'tutor';

export async function settleNoShow(
  db: SupabaseClient,
  bookingId: string,
  party: NoShowParty,
  stripeClient?: Stripe,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { data: booking, error } = await db.from('bookings')
    .select('id, student_id, tutor_id, status, price, credit_applied, stripe_payment_intent_id, stripe_setup_intent_id, tutor_payout_amount')
    .eq('id', bookingId).maybeSingle();
  if (error) throw error;
  if (!booking) return { status: 404, body: { error: 'Booking not found' } };
  if (booking.status !== 'confirmed') {
    return { status: 409, body: { error: 'This session was already completed or cancelled.' } };
  }

  const tutorNoShow = party === 'tutor';
  let refundPercent = tutorNoShow ? 100 : 0;
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const pi = booking.stripe_payment_intent_id as string | null;
  if (!pi && booking.stripe_setup_intent_id) refundPercent = 100;
  let transferId: string | null = null;
  let chargeId: string | null = null;
  let refundedCents: number | null = null;

  if (stripeKey && pi?.startsWith('pi_')) {
    const stripe = stripeClient ?? new (await import('https://esm.sh/stripe@16?target=deno')).default(
      stripeKey, { apiVersion: '2024-06-20' },
    );
    try {
      const current = await stripe.paymentIntents.retrieve(pi, { expand: ['latest_charge'] });
      const payNoShowTutor = async (
        charge: Parameters<typeof payTutor>[0]['charge'],
        connectId: string,
      ) => {
        const payout = await payTutor({
          stripe,
          bookingId,
          destination: connectId,
          payoutCents: Math.round(Number(booking.tutor_payout_amount) * 100),
          originalPayoutCents: Math.round(Number(booking.tutor_payout_amount) * 100),
          charge,
          idempotencyKey: `noshow_transfer_${bookingId}`,
          metadata: { booking_id: bookingId, reason: 'student_no_show' },
        });
        transferId = payout.transferId;
        if (!payout.complete) {
          const failedAt = new Date().toISOString();
          const { data: flagged, error: flagError } = await updateConfirmedBookingRaiseOnly(db, bookingId, {
            status: 'no_show',
            no_show_party: party,
            stripe_charge_id: chargeId,
            stripe_transfer_id: transferId,
            payout_failed_at: failedAt,
          }, refundPercent, refundedCents);
          if (flagError) console.error('settle-no-show: payout failure status update failed', bookingId, flagError.message);
          if (!flagged) {
            await db.from('bookings').update({ payout_failed_at: failedAt }).eq('id', bookingId);
            console.error('settle-no-show: captured, transfer failed and booking left confirmed', bookingId, chargeId);
          } else {
            try { await cancelParentExtensions(db, bookingId); }
            catch (extensionError) {
              console.error('settle-no-show: extension cancellation failed', bookingId, String(extensionError));
            }
          }
          console.error('settle-no-show: captured but transfer failed', bookingId, `owed ${payout.shortfallCents}c`, String(payout.error));
          return {
            status: 502,
            body: {
              error: 'The charge went through but the payout failed. Our team has been notified and will complete it.',
              captured: true,
              payoutFailed: true,
            },
          };
        }
        return null;
      };

      if (current.status === 'canceled') {
        refundPercent = 100;
        refundedCents = current.amount;
      } else if (current.status === 'succeeded') {
        if (await otherOutcomeTransferExists(stripe, bookingId, tutorNoShow ? null : 'student_no_show')) {
          return { status: 409, body: { error: 'This session was already completed or cancelled.' } };
        }
        const charge = current.latest_charge;
        if (!charge || typeof charge === 'string') throw new Error('Captured charge was not expanded');
        const refunded = await capturedRefundCents(stripe, charge);
        const targetPercent = tutorNoShow ? 100 : 0;
        let owed = 0;
        if (tutorNoShow) {
          owed = refundOwedCents(charge, refunded, targetPercent);
          if (owed > 0) {
            await stripe.refunds.create(
              { charge: charge.id, amount: owed, metadata: { booking_id: bookingId, reason: 'tutor_no_show' } },
              { idempotencyKey: `noshow_refund_${bookingId}` },
            );
          }
        }
        refundPercent = Math.max(targetPercent, chargeRefundPercent(charge, refunded + owed));
        refundedCents = chargeRefundedCents(charge, refunded + owed);
        chargeId = charge.id;
        if (refundPercent < 100 && !tutorNoShow) {
          const { data: prof } = await db.from('tutor_profiles').select('stripe_connect_account_id')
            .eq('user_id', booking.tutor_id).maybeSingle();
          const connectId = (prof?.stripe_connect_account_id as string | null | undefined) ?? null;
          await assertPayoutReady(stripeKey, connectId);
          const result = await payNoShowTutor(charge, connectId!);
          if (result) return result;
        }
      } else if (tutorNoShow) {
        await stripe.paymentIntents.cancel(pi, {}, { idempotencyKey: `noshow_cancel_${bookingId}` });
        refundedCents = current.amount;
      } else {
        const { data: prof } = await db.from('tutor_profiles').select('stripe_connect_account_id')
          .eq('user_id', booking.tutor_id).maybeSingle();
        const connectId = (prof?.stripe_connect_account_id as string | null | undefined) ?? null;
        await assertPayoutReady(stripeKey, connectId);
        const captured = await stripe.paymentIntents.capture(
          pi, { expand: ['latest_charge'] }, { idempotencyKey: `noshow_cap_${bookingId}` },
        );
        const charge = typeof captured.latest_charge === 'string' ? null : captured.latest_charge;
        chargeId = typeof captured.latest_charge === 'string' ? captured.latest_charge : (charge?.id ?? null);
        refundedCents = charge ? chargeRefundedCents(charge, 0) : 0;
        const result = await payNoShowTutor(charge, connectId!);
        if (result) return result;
      }
    } catch (stripeErr) {
      if (stripeErr instanceof BookingError) throw stripeErr;
      console.error('settle-no-show: stripe failed', JSON.stringify(stripeErr), stripeErr);
      return { status: 400, body: { error: 'The payment step failed. Please try again.' } };
    }
  }

  const { data: settled, error: updateError } = await updateConfirmedBookingRaiseOnly(db, bookingId, {
    status: 'no_show',
    no_show_party: party,
    stripe_charge_id: chargeId,
    stripe_transfer_id: transferId,
  }, refundPercent, refundedCents);
  if (updateError) return { status: 400, body: { error: updateError.message } };
  if (!settled) return { status: 409, body: { error: 'This session was already completed or cancelled.' } };
  if (Number(settled.refund_percent) > 0 && Number(booking.credit_applied ?? 0) > 0) {
    const { error: creditError } = await db.rpc('return_booking_credit', {
      p_booking: bookingId,
      p_percent: Number(settled.refund_percent),
    });
    if (creditError) console.error('settle-no-show: credit return failed', bookingId, creditError.message);
  }
  try { await cancelParentExtensions(db, bookingId); }
  catch (extensionError) {
    console.error('settle-no-show: extension cancellation failed', bookingId, String(extensionError));
  }
  return {
    status: 200,
    body: {
      status: 'no_show',
      refundPercent: Number(settled.refund_percent),
      refundStatus: settled.refund_status,
    },
  };
}
