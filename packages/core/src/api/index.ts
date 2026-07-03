// @noot/core/api — typed data access. All Supabase queries and Edge Function calls
// live here (or under it). Screens import from @noot/core, never Supabase directly.
//
// Skeleton only — implement against the schema in supabase/migrations as it lands.
import { getSupabase } from '../supabase';
import type { Booking, Conversation, User } from '../models';

/** Invoke a Supabase Edge Function (server-only logic — see ARCHITECTURE.md §5). */
async function invokeFn<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T>(name, { body });
  if (error) throw error;
  return data as T;
}

export const api = {
  // --- users / profiles ---
  async getMe(): Promise<User | null> {
    // TODO: select from `profiles` for the current session user.
    throw new Error('not implemented');
  },

  // --- bookings ---
  async listUpcoming(): Promise<Booking[]> {
    // TODO: select confirmed bookings for the current user (student or tutor).
    throw new Error('not implemented');
  },

  /** B4 → held PaymentIntent via the `create-payment-intent` Edge Function. */
  createPaymentIntent(bookingDraft: Partial<Booking>) {
    return invokeFn<{ clientSecret: string }>(
      'create-payment-intent',
      bookingDraft as Record<string, unknown>,
    );
  },

  // --- chat ---
  async getConversation(tutorId: string): Promise<Conversation | null> {
    // TODO: select/create the per-tutor conversation; subscribe via Realtime in the UI.
    void tutorId;
    throw new Error('not implemented');
  },
};

export { getSupabase, initSupabase } from '../supabase';
