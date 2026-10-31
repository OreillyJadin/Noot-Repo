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

/** Create and confirm a manual-capture test hold. */
export async function createManualCaptureIntent(amountCents: number) {
  assertTestKey();
  const intent = await stripe('payment_intents', {
    amount: String(amountCents),
    currency: 'usd',
    capture_method: 'manual',
    payment_method: 'pm_card_visa',
    confirm: 'true',
    return_url: 'https://noot.app/return',
    'automatic_payment_methods[enabled]': 'true',
    'automatic_payment_methods[allow_redirects]': 'never',
  });
  if (intent.error) throw new Error(intent.error.message);
  return intent as { id: string; status: string; amount: number; amount_received: number };
}

/** Capture all or part of a test hold and expand its charge. */
export async function captureHold(paymentIntentId: string, amountToCapture?: number) {
  assertTestKey();
  if (!paymentIntentId.startsWith('pi_')) throw new Error('expected a real Stripe test PaymentIntent');
  const params: Record<string, string> = { 'expand[]': 'latest_charge' };
  if (amountToCapture !== undefined) params.amount_to_capture = String(amountToCapture);
  const result = await stripe(`payment_intents/${paymentIntentId}/capture`, params);
  if (result.error) throw new Error(result.error.message);
  return result as { id: string; status: string; amount_received: number; latest_charge: { id: string } | string | null };
}

/** Refund captured test funds. */
export async function refundCharge(chargeId: string, amountCents: number) {
  assertTestKey();
  const result = await stripe('refunds', { charge: chargeId, amount: String(amountCents) });
  if (result.error) throw new Error(result.error.message);
  return result as { id: string; amount: number; status: string };
}

/** List test refunds attached to a charge. */
export async function listRefundsForCharge(chargeId: string) {
  assertTestKey();
  const result = await stripe(`refunds?charge=${encodeURIComponent(chargeId)}&limit=100`);
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as { id: string; amount: number; status: string }[];
}

/** Read a test charge after refunds have settled. */
export async function getCharge(chargeId: string) {
  assertTestKey();
  const charge = await stripe(`charges/${chargeId}`);
  if (charge.error) throw new Error(charge.error.message);
  return charge as { id: string; amount: number; amount_captured: number; amount_refunded: number };
}

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
