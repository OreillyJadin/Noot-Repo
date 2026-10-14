import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey || req.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, serviceRoleKey);
  const { data: bookings, error: loadError } = await db
    .from('bookings')
    .select('id, stripe_payment_intent_id')
    .eq('status', 'cancelled')
    .or(
      'cancel_reason.in.(tutor_declined,tutor_no_response),and(cancel_reason.is.null,accept_by.not.is.null,accepted_at.is.null,refund_percent.eq.100)',
    )
    .not('stripe_payment_intent_id', 'is', null)
    .is('hold_released_at', null)
    .order('cancelled_at', { ascending: true })
    .limit(50);
  if (loadError) {
    console.error('release-booking-holds: booking lookup failed');
    return Response.json({ error: 'Could not load booking holds' }, { status: 500 });
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  let Stripe: (typeof import('https://esm.sh/stripe@16?target=deno'))['default'] | null = null;
  if (stripeKey && (bookings ?? []).some((b) => (b.stripe_payment_intent_id as string).startsWith('pi_'))) {
    try {
      ({ default: Stripe } = await import('https://esm.sh/stripe@16?target=deno'));
    } catch {
      console.error('release-booking-holds: Stripe client could not be loaded');
    }
  }
  let stripe: InstanceType<NonNullable<typeof Stripe>> | null = null;
  try {
    if (Stripe && stripeKey) stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  } catch {
    console.error('release-booking-holds: Stripe client could not be initialized');
  }
  let released = 0;
  let failed = 0;
  let skipped = 0;

  for (const booking of bookings ?? []) {
    const paymentIntentId = booking.stripe_payment_intent_id as string;
    if (paymentIntentId.startsWith('pi_')) {
      if (!stripe) {
        failed += 1;
        continue;
      }
      try {
        await stripe.paymentIntents.cancel(
          paymentIntentId,
          {},
          { idempotencyKey: `cancel_${booking.id}` },
        );
      } catch {
        try {
          const current = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (current.status !== 'canceled') {
            failed += 1;
            console.error('release-booking-holds: Stripe cancellation failed', booking.id);
            continue;
          }
        } catch {
          failed += 1;
          console.error('release-booking-holds: Stripe cancellation failed', booking.id);
          continue;
        }
      }
    } else {
      skipped += 1;
    }

    const { data: marked, error: markError } = await db
      .from('bookings')
      .update({ hold_released_at: new Date().toISOString() })
      .eq('id', booking.id)
      .eq('status', 'cancelled')
      .is('hold_released_at', null)
      .select('id');
    if (markError) {
      failed += 1;
      console.error('release-booking-holds: could not mark hold released', booking.id);
    } else if (marked?.length) {
      released += 1;
    }
  }

  return Response.json({ released, failed, skipped });
});
