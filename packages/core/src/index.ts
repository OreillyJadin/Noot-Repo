// @noot/core — the app's data + auth boundary. UI imports from here; only this
// package (and supabase/functions) may touch Supabase/Stripe directly.
export * from './models';
export * as auth from './auth';
export { onUserChanged } from './changes';
export {
  api,
  type AmbassadorReferrals,
  type AmbassadorReferralRow,
  type PendingTutor,
  type AdminUser,
  type AdminReview,
  type AdminBooking,
} from './api';
export { initSupabase, getSupabase, type SupabaseConfig } from './supabase';
