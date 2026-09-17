// Test-only Stripe helpers shared by the verify_* suites.
//
// confirm-booking requires a PaymentIntent in status `requires_capture` (T5). In the app
// the native PaymentSheet puts it there; a script has to do it over the REST API. Test
// mode only — every function here refuses anything but an sk_test_ key.
const KEY = () => process.env.STRIPE_SECRET_KEY ?? '';

/** True when the function runtime is using real (test-mode) Stripe rather than the simulated path. */
export const stripeTestMode = () => KEY().startsWith('sk_test_');

function assertTestKey() {
  if (!stripeTestMode()) {
    throw new Error('refusing to touch Stripe without an sk_test_ STRIPE_SECRET_KEY');
  }
}

async function stripe(path: string, body?: Record<string, string>) {
  assertTestKey();
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${KEY()}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(body ? { body: new URLSearchParams(body) } : {}),
  });
  return await res.json();
}

/**
 * Authorize a manual-capture hold with Stripe's test Visa, the way PaymentSheet does.
 * A no-op returning null for simulated (`sim_pi_…`) ids so callers can stay mode-agnostic.
 */
export async function authorizeHold(paymentIntentId: string) {
  if (!paymentIntentId.startsWith('pi_')) return null;
  return await stripe(`payment_intents/${paymentIntentId}/confirm`, {
    payment_method: 'pm_card_visa',
    return_url: 'https://noot.app/return',
  });
}

/** Read a PaymentIntent — used to assert the held amount is the server's price. */
export const getPaymentIntent = (id: string) => stripe(`payment_intents/${id}`);

/** Release a hold so nothing sits open in the test account after a run. */
export async function cancelHold(paymentIntentId: string) {
  if (!paymentIntentId?.startsWith('pi_')) return null;
  return await stripe(`payment_intents/${paymentIntentId}/cancel`, {});
}

/** Overwrite metadata — used to forge "someone else's hold" in the negative tests. */
export const setPaymentIntentMetadata = (id: string, metadata: Record<string, string>) =>
  stripe(`payment_intents/${id}`, Object.fromEntries(
    Object.entries(metadata).map(([k, v]) => [`metadata[${k}]`, v]),
  ));
