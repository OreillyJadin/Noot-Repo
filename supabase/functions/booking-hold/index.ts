import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { attachBookingHold, bookingChargeCents } from '../_shared/deferredHolds.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';
import { ownedCustomerId } from '../_shared/stripeCustomer.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serveWithErrorReporting('booking-hold', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const inactive = await requireActiveUser(db, user.id, cors);
    if (inactive) return inactive;
    const { bookingId, action, paymentIntentId } = await req.json();
    if (typeof bookingId !== 'string' || !['create', 'attach'].includes(action)) {
      return Response.json({ error: 'bookingId and action (create|attach) required' }, { status: 400, headers: cors });
    }
    const { data: booking, error } = await db.from('bookings').select('*').eq('id', bookingId).single();
    if (error || !booking) return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors });
    if (booking.student_id !== user.id) return Response.json({ error: 'Only the student can update payment' }, { status: 403, headers: cors });
    if (booking.extends_booking_id) {
      return Response.json({ error: 'Manage this from the main session' }, { status: 400, headers: cors });
    }
    if (action === 'attach' && typeof paymentIntentId === 'string' && booking.stripe_payment_intent_id === paymentIntentId) {
      return Response.json({ ok: true }, { headers: cors });
    }
    if (!booking.stripe_setup_intent_id || booking.stripe_payment_intent_id || !booking.hold_failed_at ||
        !['pending', 'confirmed'].includes(booking.status) ||
        new Date(booking.scheduled_at).getTime() <= Date.now() + 12 * 3600000) {
      return Response.json({ error: 'This session no longer needs a payment update. Refresh your sessions.' }, { status: 409, headers: cors });
    }
    if (new Date(booking.hold_due_at).getTime() > Date.now()) {
      return Response.json({ error: 'You can update payment starting two days before this session.' }, { status: 409, headers: cors });
    }
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    const stripe = key ? new (await import('https://esm.sh/stripe@16?target=deno')).default(key, { apiVersion: '2024-06-20' }) : null;
    let customerId: string | null = null;
    if (stripe) {
      const setup = await stripe.setupIntents.retrieve(booking.stripe_setup_intent_id);
      customerId = typeof setup.customer === 'string' ? setup.customer : setup.customer?.id ?? null;
      if (!customerId) throw new Error('Missing customer');
      if (customerId !== await ownedCustomerId(stripe, db, user.id, user.email ?? '')) {
        throw new Error('Payment customer does not belong to this student');
      }
    }
    if (action === 'create') {
      const pi = stripe ? await stripe.paymentIntents.create({
        amount: bookingChargeCents(booking), currency: 'usd', capture_method: 'manual',
        customer: customerId!, payment_method_types: ['card'],
        metadata: { booking_id: booking.id, user_id: user.id, purpose: 'booking_repair' },
      }, { idempotencyKey: `repair_${booking.id}_${booking.hold_failed_at}` }) : null;
      return Response.json({
        paymentIntentId: pi?.id ?? 'sim_pi_repair_' + booking.id,
        paymentIntentClientSecret: pi?.client_secret ?? null,
        amountCents: bookingChargeCents(booking), simulated: !stripe,
      }, { headers: cors });
    }
    let created = Math.floor(Date.now() / 1000);
    if (stripe) {
      if (typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) throw new Error('Missing payment');
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status !== 'requires_capture' || pi.currency !== 'usd' || pi.capture_method !== 'manual' ||
          pi.amount !== bookingChargeCents(booking) || pi.customer !== customerId ||
          pi.metadata.user_id !== user.id || pi.metadata.booking_id !== booking.id || pi.metadata.purpose !== 'booking_repair') {
        return Response.json({ error: 'That payment does not match this session' }, { status: 400, headers: cors });
      }
      const { data: used, error: useError } = await db.from('bookings').select('id').eq('stripe_payment_intent_id', paymentIntentId);
      if (useError) throw useError;
      if (used?.some((b) => b.id !== booking.id)) return Response.json({ error: 'Payment already used' }, { status: 409, headers: cors });
      created = pi.created;
    } else if (paymentIntentId !== 'sim_pi_repair_' + booking.id) {
      throw new Error('Invalid simulated payment');
    }
    let attached = false;
    try {
      attached = await attachBookingHold(db, booking, paymentIntentId, created);
    } finally {
      if (!attached && stripe) {
        const { data: current } = await db.from('bookings').select('stripe_payment_intent_id').eq('id', booking.id).single();
        if (current && current.stripe_payment_intent_id !== paymentIntentId) {
          await stripe.paymentIntents.cancel(paymentIntentId, {}, { idempotencyKey: `release_unattached_${paymentIntentId}` });
        }
      }
    }
    return Response.json(attached ? { ok: true } : { error: 'This session changed. Refresh your sessions.' },
      { status: attached ? 200 : 409, headers: cors });
  } catch {
    return Response.json({ error: 'Could not update your payment. Refresh and try again.' }, { status: 400, headers: cors });
  }
});
