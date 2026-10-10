// Edge Function: create-payment-intent (ARCHITECTURE.md §5).
// B4 → create a Stripe PaymentIntent with MANUAL capture (held payment), released
// to the tutor on session completion. Deno runtime.
//
// Body: { tutorId, courseCode, durationMinutes, scheduledAt }. The amount is NOT accepted
// from the client — it is derived from tutor_courses.hourly_rate by resolveBooking(), which
// also asserts the tutor is bookable (T5). If STRIPE_SECRET_KEY is set we create a real
// manual-capture PaymentIntent; otherwise we return a simulated intent so local/dev never
// crashes. This is one of the two allowed places to import Stripe directly.
//
// Noot credit (0040) comes off the charge automatically: the hold is for chargeCents, and
// metadata.credit_cents records the credit so confirm-booking can check it and spend it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { BookingError, resolveBooking } from '../_shared/booking.ts';
import { creditToApply } from '../_shared/credits.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    // Service-role client: resolveBooking must see rows RLS hides from the student
    // (a deleted tutor, the other direction of user_blocks).
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    const body = await req.json().catch(() => ({}));
    const resolved = await resolveBooking(db, {
      studentId: user.id,
      tutorId: body?.tutorId,
      courseCode: body?.courseCode,
      durationMinutes: body?.durationMinutes,
      scheduledAt: body?.scheduledAt,
    });

    // A failed balance read just means no credit this time, never a failed booking.
    const { data: bal } = await db.rpc('credit_balance_cents', { p_user: user.id });
    const creditCents = creditToApply(Number(bal ?? 0), resolved.amountCents);
    const chargeCents = resolved.amountCents - creditCents;

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!stripeKey) {
      // No Stripe key configured (local/dev): return a simulated intent, never crash.
      // Same shape as the real branch so the client has one code path.
      return Response.json(
        {
          paymentIntentClientSecret: 'sim_secret_' + crypto.randomUUID(),
          ephemeralKeySecret: null,
          customerId: null,
          paymentIntentId: 'sim_pi_' + crypto.randomUUID(),
          amountCents: resolved.amountCents,
          creditCents,
          chargeCents,
          price: resolved.price,
          simulated: true,
        },
        { headers: cors },
      );
    }

    const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    // A persistent Stripe Customer per user powers PaymentSheet (saved cards / Link).
    // A stored id can be from the other Stripe mode (T10), so treat resource_missing as
    // "make a new one" rather than failing the booking.
    const { data: urow } = await db.from('users').select('stripe_customer_id').eq('id', user.id).maybeSingle();
    let customerId = (urow?.stripe_customer_id as string | null | undefined) ?? null;
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if ((existing as { deleted?: boolean }).deleted) customerId = null;
      } catch (err) {
        if ((err as { code?: string })?.code === 'resource_missing') customerId = null;
        else throw err;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
      customerId = customer.id;
      await db.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: '2024-06-20' });

    const intent = await stripe.paymentIntents.create({
      amount: chargeCents,
      currency: 'usd',
      capture_method: 'manual', // held until session completion (captured in complete-session)
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      // confirm-booking re-derives the price and checks it against this metadata, so a
      // PaymentIntent can't be reused for a different tutor, course, or duration.
      metadata: {
        user_id: user.id,
        tutor_id: resolved.tutorId,
        course_code: resolved.courseCode,
        duration_minutes: String(resolved.durationMinutes),
        scheduled_at: resolved.scheduledAt,
        credit_cents: String(creditCents),
      },
    });

    return Response.json(
      {
        paymentIntentClientSecret: intent.client_secret,
        ephemeralKeySecret: ephemeralKey.secret,
        customerId,
        paymentIntentId: intent.id,
        amountCents: resolved.amountCents,
        creditCents,
        chargeCents,
        price: resolved.price,
        simulated: false,
      },
      { headers: cors },
    );
  } catch (err) {
    if (err instanceof BookingError) {
      return Response.json({ error: err.message }, { status: err.status, headers: cors });
    }
    // Deliberately generic: anything reaching here is an internal fault, and Stripe's
    // own error strings can embed a partially-redacted API key. User-facing copy comes
    // from BookingError and the explicit checks above.
    console.error('create-payment-intent failed', JSON.stringify(err), err);
    return Response.json(
      { error: 'Something went wrong setting up that booking. Please try again.' },
      { status: 400, headers: cors },
    );
  }
});
