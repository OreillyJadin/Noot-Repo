import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isStripeResourceMissing } from './stripeCustomer.ts';

export type SessionExtensionRow = {
  id: string;
  extends_booking_id: string;
  status: string;
  duration_minutes: number;
  scheduled_end: string;
  stripe_payment_intent_id: string | null;
};

export async function getConfirmedExtension(
  db: SupabaseClient,
  parentId: string,
): Promise<SessionExtensionRow | null> {
  const { data, error } = await db.from('bookings')
    .select('id, extends_booking_id, status, duration_minutes, scheduled_end, stripe_payment_intent_id')
    .eq('extends_booking_id', parentId).eq('status', 'confirmed').maybeSingle();
  if (error) throw error;
  return data as SessionExtensionRow | null;
}

export async function effectiveDurationMinutes(
  db: SupabaseClient,
  parentId: string,
  durationMinutes: number,
): Promise<number> {
  const extension = await getConfirmedExtension(db, parentId);
  return durationMinutes + (extension ? Number(extension.duration_minutes) : 0);
}

export async function cancelParentExtensions(
  db: SupabaseClient,
  parentId: string,
  statuses: string[] = ['pending', 'confirmed'],
): Promise<void> {
  const { data: extensions, error } = await db.from('bookings')
    .select('id, status, stripe_payment_intent_id')
    .eq('extends_booking_id', parentId).in('status', statuses);
  if (error) throw error;
  for (const extension of extensions ?? []) {
    const now = new Date().toISOString();
    const pi = extension.stripe_payment_intent_id as string | null;
    const simulated = !pi || pi.startsWith('sim_pi_');
    const { data: cancelled, error: cancelError } = await db.from('bookings').update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_from_status: extension.status,
      refund_percent: 100,
      refund_status: 'refunded',
      stripe_charge_id: null,
      stripe_transfer_id: null,
      hold_released_at: simulated ? now : null,
    }).eq('id', extension.id).in('status', ['pending', 'confirmed']).select('id').maybeSingle();
    if (cancelError) throw cancelError;
    if (!cancelled || simulated || !pi?.startsWith('pi_')) continue;
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) continue;
    try {
      const { default: Stripe } = await import('https://esm.sh/stripe@16?target=deno');
      const stripe = new Stripe(key, { apiVersion: '2024-06-20' });
      try {
        await stripe.paymentIntents.cancel(pi, {}, { idempotencyKey: `cancel_ext_${extension.id}` });
      } catch (error) {
        if (!isStripeResourceMissing(error)) {
          const current = await stripe.paymentIntents.retrieve(pi);
          if (current.status !== 'canceled') throw error;
        }
      }
      await db.from('bookings').update({ hold_released_at: new Date().toISOString() })
        .eq('id', extension.id).eq('status', 'cancelled').is('hold_released_at', null);
    } catch (error) {
      console.error('session extension: payment hold cancellation failed', extension.id, String(error));
    }
  }
}
