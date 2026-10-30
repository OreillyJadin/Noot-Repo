// @noot/core — the app's data + auth boundary. UI imports from here; only this
// package (and supabase/functions) may touch Supabase/Stripe directly.
export * from './models';
export { tutorEarnedAmount } from './earnings';
export * from './campusTime';
export {
  STORAGE_LIMITS,
  MAX_ATTACHMENT_BYTES,
  resolveUploadType,
  type UploadBucket,
} from './storageLimits';
export * as auth from './auth';
export type { MfaFactor, MfaStatus, TotpEnrollment } from './auth/mfa';
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
  STUDENT_FEE_RATE,
  studentFeeFor,
  feeRateFor,
  tutorPayoutFor,
  creditToApply,
  MIN_CHARGE_CENTS,
  MIN_HOURLY_RATE,
  MAX_HOURLY_RATE,
  bookingQuote,
  type BookingQuote,
} from './pricing';
export { UA_MAJORS, searchMajors, type Major } from './data/uaMajors';
export { attentionTotal, type AdminHubCounts } from './adminHub';
export { mergeAvailabilityWindows, type AvailabilityWindow } from './availability';
export {
  api,
  FunctionError,
  STUDENT_UNDER_AGE_MESSAGE,
  TUTOR_CANCEL_FLAG_OVER,
  NO_SHOW_FLAG_AT,
  REMINDER_CHOICES,
  DEFAULT_REMINDERS,
  type Invite,
  type Milestone,
  type CreditKind,
  type CreditEntry,
  type PendingTutor,
  type TutorApplicationStatus,
  type AdminUser,
  type AdminUserHistory,
  type AdminUserHistoryUser,
  type AdminUserHistoryCounts,
  type AdminUserHistoryBooking,
  type AdminUserHistoryReport,
  type AdminUserHistoryAction,
  type AdminUserQuery,
  type AdminUserRole,
  type AdminUserStatus,
  type AdminReview,
  type AdminBooking,
  type AdminCalendarEvent,
} from './api';
export { initSupabase, getSupabase, type SupabaseConfig } from './supabase';
