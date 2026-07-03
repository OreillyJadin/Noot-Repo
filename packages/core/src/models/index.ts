// @noot/core/models — domain types. Mirrors ARCHITECTURE.md §4, which reconciles
// prd-data-models.md with the design handoff. Resolved decisions:
//   • multiple roles per account, switched from Profile (roles[] + activeRole)
//   • reviews are admin-moderated (hidden until approved, then attached to a user)
//   • binary 24h refund
//   • weekly availability + one-off overrides
//   • ambassador role with a flat $5 one-time referral bonus
//
// Money: prd-data-models.md models prices as decimal dollars; kept as `number`
// here to match. (If we move to integer cents in the DB, update these together.)

export type Role = 'student' | 'tutor' | 'ambassador' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';

export type UUID = string;
/** ISO-8601 timestamp. */
export type Timestamp = string;

export interface User {
  id: UUID;
  email: string; // .edu, unique
  firstName: string;
  lastName: string;
  /** A user may hold several roles; activeRole is the one currently switched-to. */
  roles: Role[];
  activeRole: Role;
  status: UserStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface TutorProfile {
  id: UUID;
  userId: UUID;
  bio: string;
  subjects: string[];
  hourlyRate: number;
  transcriptUrl: string | null;
  /** Only approved tutors are visible/bookable. */
  approvalStatus: ApprovalStatus;
  reviewedBy: UUID | null; // admin
  reviewedAt: Timestamp | null;
  stripeConnectAccountId: string | null;
  /** Denormalized from approved Reviews. Not shown until reviews are approved. */
  ratingAvg: number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AmbassadorProfile {
  id: UUID;
  userId: UUID;
  referralCode: string; // unique, shareable
  stripeConnectAccountId: string | null;
  totalReferrals: number;
  totalEarned: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Referral {
  id: UUID;
  ambassadorId: UUID;
  referredUserId: UUID;
  referredRole: 'student' | 'tutor';
  referralCodeUsed: string;
  createdAt: Timestamp;
}

export type BonusStatus = 'pending' | 'paid';

export interface ReferralBonus {
  id: UUID;
  ambassadorId: UUID;
  referralId: UUID; // unique — one bonus per referral, ever
  triggeringBookingId: UUID;
  bonusAmount: number; // flat $5 (stored, not hardcoded)
  status: BonusStatus;
  paidAt: Timestamp | null;
  createdAt: Timestamp;
}

export type SessionType = 'video' | 'in_person';
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type RefundStatus = 'not_applicable' | 'refunded' | 'not_refunded';

export interface Booking {
  id: UUID;
  studentId: UUID;
  tutorId: UUID;
  subject: string;
  scheduledAt: Timestamp;
  durationMinutes: number;
  price: number; // total charged to student
  platformFee: number; // noot's cut
  tutorPayoutAmount: number;
  sessionType: SessionType;
  /** Populated when video (external link at launch, ARCHITECTURE.md §9). */
  meetingLink: string | null;
  /** Populated when in_person. */
  location: string | null;
  status: BookingStatus;
  cancellationDeadline: Timestamp; // scheduledAt − 24h
  cancelledAt: Timestamp | null;
  refundStatus: RefundStatus;
  stripePaymentIntentId: string | null; // charged upfront
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Conversation {
  id: UUID;
  studentId: UUID;
  tutorId: UUID;
  createdAt: Timestamp;
}

export interface Message {
  id: UUID;
  conversationId: UUID;
  senderId: UUID;
  content: string;
  readAt: Timestamp | null;
  createdAt: Timestamp;
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  id: UUID;
  messageId: UUID;
  storagePath: string;
  kind: 'image' | 'file';
  filename: string;
}

/** Admin-moderated — hidden from everyone until approvalStatus=approved. */
export interface Review {
  id: UUID;
  bookingId: UUID;
  reviewerId: UUID;
  subjectUserId: UUID; // the person being rated
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  approvalStatus: ApprovalStatus;
  reviewedBy: UUID | null; // admin
  reviewedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface TutorAvailability {
  id: UUID;
  tutorId: UUID;
  dayOfWeek: number; // 0-6, recurring weekly
  startTime: string; // "14:00"
  endTime: string;
  createdAt: Timestamp;
}

export interface AvailabilityOverride {
  id: UUID;
  tutorId: UUID;
  date: string; // "2026-09-01"
  startTime: string;
  endTime: string;
  isOpen: boolean; // true = opened, false = blocked
  createdAt: Timestamp;
}

export interface PushToken {
  id: UUID;
  userId: UUID;
  token: string;
  platform: 'ios' | 'android';
  createdAt: Timestamp;
}
