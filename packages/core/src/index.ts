// @noot/core — the app's data + auth boundary. UI imports from here; only this
// package (and supabase/functions) may touch Supabase/Stripe directly.
export * from './models';
export * as auth from './auth';
export { onUserChanged } from './changes';
export {
  missingRequirements,
  stepComplete,
  firstIncompleteStep,
  STEP_REQUIREMENTS,
  REQUIREMENT_LABEL,
  AGREEMENT_VERSION,
  type Requirement,
  type ApplicationFacts,
} from './tutorApplication';
export {
  VERIFIED_FEE_RATE,
  UNVERIFIED_FEE_RATE,
  feeRateFor,
  tutorPayoutFor,
  MIN_HOURLY_RATE,
  MAX_HOURLY_RATE,
} from './pricing';
export { UA_MAJORS, searchMajors, type Major } from './data/uaMajors';
export {
  api,
  type AmbassadorReferrals,
  type AmbassadorReferralRow,
  type PendingTutor,
  type TutorApplicationStatus,
  type AdminUser,
  type AdminReview,
  type AdminBooking,
} from './api';
export { initSupabase, getSupabase, type SupabaseConfig } from './supabase';
