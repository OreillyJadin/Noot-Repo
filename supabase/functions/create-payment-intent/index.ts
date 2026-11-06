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
// Noot credit (0040) comes off the total automatically: the hold is for chargeCents, and
// metadata records the credit and student service fee so confirm-booking can validate it.
//
// An admin (public.is_admin() on the caller's JWT, never a client flag) books for free:
// $0 total, no PaymentIntent, no Stripe Customer, no credit touched — `free: true` and a
// null paymentIntentId tell the app to skip the PaymentSheet and confirm directly.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isAdmin, requireActiveUser } from '../_shared/auth.ts';
import { BookingAgeError, requireBookingAge } from '../_shared/age.ts';
import { BookingError, freeBookingFor, IMMEDIATE_HOLD_DAYS, resolveBooking } from '../_shared/booking.ts';
import { creditToApply } from '../_shared/credits.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';
import { ownedCustomerId } from '../_shared/stripeCustomer.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serveWithErrorReporting('create-payment-intent', async (req: Request) => {
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
    const repeatWeeks = body?.repeatWeeks;
    // The web app (optional; older builds never send it): a redirect-based method would
    // leave the page before confirm-booking runs, so it gets cards only.
    const cardOnly = body?.cardOnly === true;
    if (repeatWeeks !== undefined && (!Number.isInteger(repeatWeeks) || repeatWeeks < 2 || repeatWeeks > 12)) {
      return Response.json({ error: 'repeatWeeks must be an integer from 2 to 12.' }, { status: 400, headers: cors });
    }
    await requireBookingAge(db, user.id, body?.tutorId);
    let resolved = await resolveBooking(db, {
      studentId: user.id,
      tutorId: body?.tutorId,
      courseCode: body?.courseCode,
      durationMinutes: body?.durationMinutes,
      scheduledAt: body?.scheduledAt,
    });

    if (repeatWeeks !== undefined && new Date(resolved.scheduledAt).getTime() < Date.now() + 24 * 60 * 60 * 1000) {
      return Response.json({ error: 'Weekly sessions require the first session to be at least 24 hours away.' }, { status: 400, headers: cors });
    }

    if (await isAdmin(userClient)) {
      if (repeatWeeks !== undefined) {
        return Response.json({ error: "Repeat weekly isn't available on this booking." }, { status: 400, headers: cors });
      }
      resolved = freeBookingFor(resolved);
      return Response.json(
        {
          paymentIntentClientSecret: null,
          ephemeralKeySecret: null,
          customerId: null,
          paymentIntentId: null,
          amountCents: 0,
          studentFeeCents: 0,
          creditCents: 0,
          chargeCents: 0,
          price: 0,
          simulated: false,
          free: true,
        },
        { headers: cors },
      );
    }

    // A failed balance read just means no credit this time, never a failed booking.
    const { data: bal } = await db.rpc('credit_balance_cents', { p_user: user.id });
    const creditCents = creditToApply(Number(bal ?? 0), resolved.amountCents);
    const chargeCents = resolved.amountCents - creditCents;
    const deferred = repeatWeeks !== undefined ||
      new Date(resolved.scheduledAt).getTime() > Date.now() + IMMEDIATE_HOLD_DAYS * 86400000;

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!stripeKey) {
      // No Stripe key configured (local/dev): return a simulated intent, never crash.
      // Same shape as the real branch so the client has one code path.
      return Response.json(
        {
          paymentIntentClientSecret: 'sim_secret_' + crypto.randomUUID(),
          ephemeralKeySecret: null,
          customerId: null,
          paymentIntentId: deferred ? null : 'sim_pi_' + crypto.randomUUID(),
          setupIntentId: deferred ? 'sim_seti_' + crypto.randomUUID() : null,
          setupIntentClientSecret: deferred ? 'sim_secret_' + crypto.randomUUID() : null,
          deferred,
          amountCents: resolved.amountCents,
          studentFeeCents: Math.round(resolved.studentFee * 100),
          creditCents,
          chargeCents,
          price: resolved.price,
          simulated: true,
          free: false,
        },
        { headers: cors },
      );
    }

    const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    const customerId = await ownedCustomerId(stripe, db, user.id, user.email ?? '');

    const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: '2024-06-20' });

    if (deferred) {
      const setup = await stripe.setupIntents.create({
        customer: customerId,
        usage: 'off_session',
        payment_method_types: ['card'],
        metadata: {
          user_id: user.id,
          tutor_id: resolved.tutorId,
          course_code: resolved.courseCode,
          duration_minutes: String(resolved.durationMinutes),
          scheduled_at: resolved.scheduledAt,
          student_fee_cents: String(Math.round(resolved.studentFee * 100)),
          credit_cents: String(creditCents),
          amount: String(chargeCents),
          ...(repeatWeeks !== undefined ? { repeat_weeks: String(repeatWeeks) } : {}),
        },
      });
      return Response.json({
        deferred: true, setupIntentId: setup.id, setupIntentClientSecret: setup.client_secret,
        paymentIntentId: null, paymentIntentClientSecret: null,
        customerId, ephemeralKeySecret: ephemeralKey.secret,
        amountCents: resolved.amountCents, studentFeeCents: Math.round(resolved.studentFee * 100),
        creditCents, chargeCents, price: resolved.price, simulated: false, free: false,
      }, { headers: cors });
    }

    const intent = await stripe.paymentIntents.create({
      amount: chargeCents,
      currency: 'usd',
      capture_method: 'manual', // held until session completion (captured in complete-session)
      customer: customerId,
      ...(cardOnly ? { payment_method_types: ['card'] } : { automatic_payment_methods: { enabled: true } }),
      // confirm-booking re-derives the price and checks it against this metadata, so a
      // PaymentIntent can't be reused for a different tutor, course, or duration.
      metadata: {
        user_id: user.id,
        tutor_id: resolved.tutorId,
        course_code: resolved.courseCode,
        duration_minutes: String(resolved.durationMinutes),
        scheduled_at: resolved.scheduledAt,
        student_fee_cents: String(Math.round(resolved.studentFee * 100)),
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
        studentFeeCents: Math.round(resolved.studentFee * 100),
        creditCents,
        chargeCents,
        price: resolved.price,
        simulated: false,
        free: false,
      },
      { headers: cors },
    );
  } catch (err) {
    if (err instanceof BookingAgeError) {
      return Response.json(err.toBody(), { status: err.status, headers: cors });
    }
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
