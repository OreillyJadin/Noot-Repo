// @noot/core/models — domain types.
//
// NOTE: reconcile with prd-data-models.md. The PRD defines FOUR roles
// (student, tutor, ambassador, admin) and profile tables for tutor + ambassador;
// ARCHITECTURE.md §4 currently sketches only student/tutor. These types follow
// the PRD's four-role model. See ARCHITECTURE.md §13 open decisions.

export type Role = 'student' | 'tutor' | 'ambassador' | 'admin';

export type UUID = string;
/** ISO-8601 timestamp. */
export type Timestamp = string;

export interface User {
  id: UUID;
  email: string;
  fullName: string;
  college: string | null;
  avatarInitials: string;
  roles: Role[];
  activeRole: Role;
  createdAt: Timestamp;
}

export type TutorStatus = 'draft' | 'in_review' | 'active';
export type GradeVerification = 'draft' | 'submitted' | 'verified';

export interface TutorProfile {
  userId: UUID;
  headline: string;
  bio: string;
  gradeVerification: GradeVerification;
  stripeAccountId: string | null;
  status: TutorStatus;
  sessionsCompleted: number;
  /** PRIVATE — never returned to students. Credibility signal is sessionsCompleted. */
  ratingAvg: number | null;
}

export interface TutorCourse {
  id: UUID;
  tutorId: UUID;
  courseCode: string; // e.g. "MGT 300"
  title: string;
  rateCents: number;
}

export type FocusTag = 'general' | 'hw' | 'exam' | 'resume' | 'advising';
export type RepeatMode = 'once' | 'weekly';
export type BookingStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface Booking {
  id: UUID;
  studentId: UUID;
  tutorId: UUID;
  courseCode: string;
  startsAt: Timestamp;
  endsAt: Timestamp;
  lengthMin: number;
  location: string | null;
  /** External video link at launch (ARCHITECTURE.md §9); null for in-person. */
  videoUrl: string | null;
  videoProvider: string | null;
  focusTag: FocusTag;
  introMessage: string;
  repeat: RepeatMode;
  seriesId: UUID | null;
  priceCents: number;
  serviceFeeCents: number;
  status: BookingStatus;
  stripePaymentIntentId: string | null;
  createdAt: Timestamp;
}

export interface ChatThread {
  id: UUID;
  studentId: UUID;
  tutorId: UUID;
}

export interface ChatMessage {
  id: UUID;
  threadId: UUID;
  senderId: UUID;
  body: string;
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

export interface Rating {
  id: UUID;
  bookingId: UUID;
  raterId: UUID;
  rateeId: UUID;
  stars: 1 | 2 | 3 | 4 | 5;
  note: string | null;
  /** student→tutor review is public; tutor→student note is private. */
  isPublic: boolean;
  /** double-blind: false until both sides submit (or 24h auto-complete). */
  visible: boolean;
}
