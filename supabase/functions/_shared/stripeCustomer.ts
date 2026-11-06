import type Stripe from 'https://esm.sh/stripe@16?target=deno';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function isStripeResourceMissing(error: unknown): boolean {
  const stripeError = error as {
    code?: unknown;
    statusCode?: unknown;
    raw?: { code?: unknown; statusCode?: unknown };
  };
  return stripeError?.code === 'resource_missing' ||
    stripeError?.statusCode === 404 ||
    stripeError?.raw?.code === 'resource_missing' ||
    stripeError?.raw?.statusCode === 404;
}

export async function ownedCustomerId(
  stripe: Stripe,
  db: SupabaseClient,
  userId: string,
  email: string,
): Promise<string> {
  const { data: user, error: userError } = await db
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();
  if (userError) throw userError;

  const existingId = user?.stripe_customer_id as string | null | undefined;
  if (existingId) {
    let customer: Awaited<ReturnType<Stripe['customers']['retrieve']>> | null = null;
    try {
      customer = await stripe.customers.retrieve(existingId);
    } catch (error) {
      if (!isStripeResourceMissing(error)) throw error;
    }

    if (customer && (!('deleted' in customer) || customer.deleted !== true)) {
      const metadata = (customer as Stripe.Customer).metadata ?? {};
      if (metadata.user_id === userId) return customer.id;
      if (!metadata.user_id) {
        const { data: otherOwners, error: ownerError } = await db
          .from('users')
          .select('id')
          .eq('stripe_customer_id', existingId)
          .neq('id', userId)
          .limit(1);
        if (ownerError) throw ownerError;
        if (!otherOwners?.length) {
          await stripe.customers.update(existingId, {
            metadata: { ...metadata, user_id: userId },
          });
          return existingId;
        }
      }
    }
  }

  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { user_id: userId },
  });
  const { data: saved, error: saveError } = await db
    .from('users')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (saveError) throw saveError;
  if (!saved) throw new Error('Could not save Stripe customer');
  return customer.id;
}
