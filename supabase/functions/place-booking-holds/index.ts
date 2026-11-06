import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { attachBookingHold, bookingChargeCents } from '../_shared/deferredHolds.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';
import { isStripeResourceMissing } from '../_shared/stripeCustomer.ts';

serveWithErrorReporting('place-booking-holds', async (req: Request) => {
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!service || req.headers.get('Authorization') !== `Bearer ${service}`) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, service);
  const { data: cancelled, error: expiryError } = await db.rpc('expire_unfunded_bookings');
  if (expiryError) throw expiryError;
  const { data: bookings, error } = await db.from('bookings').select('*')
    .in('status', ['pending', 'confirmed']).not('stripe_setup_intent_id', 'is', null)
    .is('stripe_payment_intent_id', null).is('hold_failed_at', null)
    .lte('hold_due_at', new Date().toISOString()).order('hold_due_at').limit(50);
  if (error) throw error;
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  const stripe = key ? new (await import('https://esm.sh/stripe@16?target=deno')).default(key, { apiVersion: '2024-06-20' }) : null;
  let placed = 0;
  let failed = 0;
  const failHold = async (booking: { id: string; scheduled_at: string }, code: string) => {
    const { error: markError } = await db.rpc('fail_booking_hold', {
      p_booking: booking.id, p_scheduled_at: booking.scheduled_at, p_code: code,
    });
    if (markError) throw markError;
  };
  for (const booking of bookings ?? []) {
    try {
      let id = 'sim_pi_' + booking.id;
      let created = Math.floor(Date.now() / 1000);
      if (stripe) {
        const setup = await stripe.setupIntents.retrieve(booking.stripe_setup_intent_id);
        const setupCustomerId = typeof setup.customer === 'string' ? setup.customer : setup.customer?.id;
        if (setup.status !== 'succeeded' || !setupCustomerId || !booking.stripe_payment_method_id) {
          await failHold(booking, 'payment_unavailable');
          failed++;
          continue;
        }
        const customer = await stripe.customers.retrieve(setupCustomerId);
        const customerOwnerId = 'deleted' in customer ? undefined : customer.metadata?.user_id;
        if (customerOwnerId !== booking.student_id) {
          await failHold(booking, 'payment_unavailable');
          failed++;
          console.error('place-booking-holds: saved customer does not belong to booking student', booking.id);
          continue;
        }
        const pi = await stripe.paymentIntents.create({
          amount: bookingChargeCents(booking), currency: 'usd', capture_method: 'manual',
          customer: setupCustomerId,
          payment_method: booking.stripe_payment_method_id,
          payment_method_types: ['card'], off_session: true, confirm: true,
          metadata: { booking_id: booking.id, user_id: booking.student_id },
        }, { idempotencyKey: `hold_${booking.id}` });
        if (pi.status !== 'requires_capture') {
          await failHold(booking, 'payment_unavailable');
          failed++;
          continue;
        }
        id = pi.id;
        created = pi.created;
      }
      let attached = false;
      try {
        attached = await attachBookingHold(db, booking, id, created);
      } finally {
        if (!attached && stripe) {
          const { data: current } = await db.from('bookings').select('stripe_payment_intent_id').eq('id', booking.id).single();
          if (current && current.stripe_payment_intent_id !== id) {
            await stripe.paymentIntents.cancel(id, {}, { idempotencyKey: `release_unattached_${id}` });
          }
        }
      }
      if (attached) placed++;
    } catch (err) {
      failed++;
      const failure = err as { type?: string; code?: string };
      if (failure.type === 'StripeCardError' || failure.code === 'authentication_required' ||
          isStripeResourceMissing(err)) {
        const code = isStripeResourceMissing(err) ? 'payment_unavailable' : failure.code ?? 'card_declined';
        await failHold(booking, code).catch(() =>
          console.error('place-booking-holds: could not record card failure', booking.id));
      } else {
        console.error('place-booking-holds: transient failure', booking.id);
      }
    }
  }
  return Response.json({ placed, failed, cancelled });
});
