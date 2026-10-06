// @noot/core/api — typed data access. All Supabase queries and Edge Function calls
// live here (or under it). Screens import from @noot/core, never Supabase directly.
//
// Shape rules:
//   • DB is snake_case; models are camelCase. Every row crosses through a map* fn below.
//   • RLS (0002) is the real access control — these queries assume the anon key and only
//     ever see rows the signed-in user is allowed to. We DON'T re-check ownership here.
//   • Trust-sensitive writes (create booking, capture payment, approve tutor, moderate
//     review, award bonus) are NOT here — they're Edge Functions (service role). See §5.
import { getSupabase } from '../supabase';
import { notifyUserChanged } from '../changes';
import { normalizeCourseQuery, rankCourseMatches } from '../courseSearch';
import type {
  AmbassadorProfile,
  Booking,
  CatalogCourse,
  ContentReport,
  ReportReason,
  ChatParticipant,
  Conversation,
  ConversationSummary,
  Message,
  MessageAttachment,
  OutgoingAttachment,
  Notification,
  ReviewSummary,
  TutorAvailability,
  TutorInterview,
  TutorCourse,
  MyTutorProfile,
  TutorSummary,
  User,
} from '../models';

/** Someone the caller invited (my_invites, 0040). */
export interface Invite {
  referralId: string;
  /** First name + last initial — all an inviter is shown. */
  name: string;
  joinedAt: string;
  /** They've completed a session, so the inviter's $5 credit has been earned. */
  completed: boolean;
  /** That session was refunded or disputed, so the $5 was taken back. */
  reversed: boolean;
  rewardCents: number;
}
/** An ambassador goal: complete `threshold` invites, earn `bonusCents`. */
export interface Milestone {
  threshold: number;
  bonusCents: number;
}
export type CreditKind =
  | 'invite_reward'
  | 'milestone_bonus'
  | 'booking_spend'
  | 'booking_return'
  | 'cashout'
  | 'reward_reversal'
  | 'adjustment';
/** One line of the caller's credit history. Positive = earned, negative = spent. */
export interface CreditEntry {
  id: string;
  kind: CreditKind;
  amountCents: number;
  /** For a milestone_bonus: the goal (threshold) it paid. */
  milestone: number | null;
  createdAt: string;
}

/** A user row for the admin user-management list. */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  /** 'active' | 'suspended' | 'banned', or 'deleted' for an account its owner removed. */
  status: string;
  /** When the owner deleted the account; its name and email are scrubbed by then. */
  deletedAt: string | null;
  createdAt: string;
}
export type AdminUserRole = 'student' | 'tutor' | 'ambassador' | 'admin';
export type AdminUserStatus = 'active' | 'suspended' | 'banned' | 'deleted';
/** What to list in admin user management. Everything is optional: no filter lists everyone. */
export interface AdminUserQuery {
  /** Matched against name and email. */
  search?: string;
  /** 'student' means an account that is nothing else — everyone holds the student role. */
  role?: AdminUserRole | null;
  status?: AdminUserStatus | null;
  /** Page size, at most 100 (the server caps it). */
  limit?: number;
  offset?: number;
}
/** A pending review for the admin moderation queue. */
export interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  reviewerName: string;
  subjectName: string;
  course: string;
  createdAt: string;
}
/** A booking row for the admin oversight list. */
export interface AdminBooking {
  id: string;
  studentName: string;
  tutorName: string;
  subject: string;
  scheduledAt: string;
  status: string;
  price: number;
  disputeStatus: string;
  disputeReason: string | null;
}

/** A tutor awaiting admin approval (admin queue). */
export interface PendingTutor {
  userId: string;
  name: string;
  email: string;
  year: string | null;
  major: string | null;
  bio: string;
  subjects: string[];
  hourlyRate: number;
  transcriptUrl: string | null;
  verifiedGrade: string | null;
  submittedAt: string;
  /** 'application': a submitted application to approve or reject. 'grades': already live,
   *  with a transcript waiting to be checked for the Verified badge. */
  awaiting: 'application' | 'grades';
  /** False when the tutor chose to sign up unverified (nothing to check). */
  hasTranscript: boolean;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** The signed-in user's id, or throw. Most calls are scoped to "me". */
async function requireUid(): Promise<string> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  const uid = session?.user.id;
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

/** The signed-in user's id + email, or throw. Storage paths are keyed off both. */
async function requireUser(): Promise<{ uid: string; email: string }> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  const uid = session?.user.id;
  if (!uid) throw new Error('Not authenticated');
  return { uid, email: session?.user.email ?? '' };
}

/**
 * A file name derived from the user's email, so a human browsing the bucket can tell whose
 * file it is: `sara@crimson.ua.edu` → `sara_at_crimson.ua.edu`. Falls back to "avatar" for
 * a session with no email (phone-only sign-in).
 */
function emailFileName(email: string): string {
  const slug = email
    .trim()
    .toLowerCase()
    .replace('@', '_at_')
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');
  return slug || 'avatar';
}

/** Storage needs an explicit contentType when the body is raw bytes (no Blob.type to read). */
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Mirrors the chat-attachments bucket's file_size_limit (0021) so we fail early and kindly. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Columns of `messages` — spelled out so embeds can be appended without pulling `*`. */
const MESSAGE_SELECT = 'id, conversation_id, sender_id, content, read_at, created_at, attachment_count';

/** Bytes in an upload body — used to reject empty files before they hit Storage. */
function byteLength(data: Blob | ArrayBuffer | Uint8Array): number {
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) return data.byteLength;
  return data.size;
}

/**
 * Write bytes to `{bucket}/{uid}/{email}.{ext}`, then delete anything else in that folder so
 * each user keeps exactly one current file per bucket. The `{uid}` folder is load-bearing —
 * the Storage RLS policies (0013 avatars, 0006 transcripts) authorize writes by comparing it
 * to auth.uid(); the email is only the file name, to make the object identifiable in Studio.
 *
 * `data` must be real bytes. A React Native `Blob` is a handle to a native file, not its
 * contents, so passing one writes a 0-byte object — callers decode to an ArrayBuffer first.
 */
async function putUserFile(
  bucket: string,
  data: Blob | ArrayBuffer | Uint8Array,
  opts: { ext: string; fallbackExt: string; contentType?: string; label: string },
): Promise<{ uid: string; path: string }> {
  const { uid, email } = await requireUser();
  if (!byteLength(data)) {
    throw new Error(`That ${opts.label} came through empty — please pick it again.`);
  }

  const safeExt =
    (opts.ext || opts.fallbackExt).replace(/[^a-z0-9]/gi, '').toLowerCase() || opts.fallbackExt;
  const fileName = `${emailFileName(email)}.${safeExt}`;
  const path = `${uid}/${fileName}`;
  const type =
    opts.contentType ||
    (data instanceof Blob ? data.type : '') ||
    MIME_BY_EXT[safeExt] ||
    'application/octet-stream';

  const sb = getSupabase();
  const { error } = await sb.storage.from(bucket).upload(path, data, { upsert: true, contentType: type });
  if (error) throw error;

  // Drop any earlier file for this user (a legacy fixed name, a previous email, a different
  // extension) so the folder doesn't accumulate. Best-effort — never fail the upload.
  try {
    const { data: existing } = await sb.storage.from(bucket).list(uid);
    const stale = (existing ?? []).map((o) => o.name).filter((n) => n !== fileName);
    if (stale.length) await sb.storage.from(bucket).remove(stale.map((n) => `${uid}/${n}`));
  } catch {
    /* leftover files are harmless */
  }

  return { uid, path };
}

/** numeric(10,2) columns arrive as string|number depending on the driver — normalize. */
function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}
function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

// ---------------------------------------------------------------------------
// mappers (row -> model)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    roles: (row.user_roles ?? []).map((r: any) => r.role),
    activeRole: row.active_role,
    status: row.status,
    year: row.year ?? null,
    major: row.major ?? null,
    gender: row.gender ?? null,
    courses: row.courses ?? [],
    avatarUrl: row.avatar_url ?? null,
    passwordSetAt: row.password_set_at ?? null,
    termsAcceptedAt: row.terms_accepted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTutorCourse(row: any): TutorCourse {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    courseCode: row.course_code,
    grade: row.grade ?? null,
    hourlyRate: num(row.hourly_rate),
    sessions: row.sessions ?? 0,
    createdAt: row.created_at,
  };
}

function mapTutorInterview(row: any): TutorInterview {
  return { id: row.id, tutorId: row.tutor_id, scheduledAt: row.scheduled_at, details: row.details ?? '' };
}

function mapTutorAvailability(row: any): TutorAvailability {
  return {
    id: row.id,
    tutorId: row.tutor_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
  };
}

/** Row = a `users` row with tutor_profiles (1:1) and tutor_courses (1:many) embedded. */
function mapTutorSummary(row: any): TutorSummary {
  const tp = row.tutor_profiles ?? {};
  return {
    userId: row.id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    year: row.year ?? null,
    major: row.major ?? null,
    gender: row.gender ?? null,
    bio: tp.bio ?? '',
    subjects: tp.subjects ?? [],
    hourlyRate: num(tp.hourly_rate),
    ratingAvg: numOrNull(tp.rating_avg),
    totalSessions: tp.total_sessions ?? 0,
    verifiedGrade: tp.verified_grade ?? null,
    verified: tp.grades_verified_at != null,
    courses: (row.tutor_courses ?? []).map(mapTutorCourse),
  };
}

function mapBooking(row: any): Booking {
  return {
    id: row.id,
    studentId: row.student_id,
    tutorId: row.tutor_id,
    subject: row.subject,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    price: num(row.price),
    creditApplied: num(row.credit_applied),
    platformFee: num(row.platform_fee),
    tutorPayoutAmount: num(row.tutor_payout_amount),
    sessionType: row.session_type,
    meetingLink: row.meeting_link ?? null,
    location: row.location ?? null,
    status: row.status,
    cancellationDeadline: row.cancellation_deadline,
    cancelledAt: row.cancelled_at ?? null,
    refundStatus: row.refund_status,
    stripePaymentIntentId: row.stripe_payment_intent_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConversation(row: any): Conversation {
  return {
    id: row.id,
    kind: row.kind === 'admin' ? 'admin' : 'direct',
    studentId: row.student_id ?? null,
    tutorId: row.tutor_id ?? null,
    createdAt: row.created_at,
  };
}

/** Columns the catalog picker needs. */
const CATALOG_SELECT = 'course_code, course_title, subject_code, subject_name, credit_hours, college_name';

function mapCatalogCourse(row: any): CatalogCourse {
  return {
    courseCode: row.course_code,
    courseTitle: row.course_title ?? '',
    subjectCode: row.subject_code ?? '',
    subjectName: row.subject_name ?? '',
    creditHours: row.credit_hours ?? null,
    collegeName: row.college_name ?? '',
  };
}

function mapParticipant(row: any): ChatParticipant {
  return {
    id: row.id,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    avatarUrl: row.avatar_url ?? null,
  };
}

function mapAttachment(row: any): MessageAttachment {
  return {
    id: row.id,
    messageId: row.message_id,
    storagePath: row.storage_path,
    kind: row.kind === 'image' ? 'image' : 'file',
    filename: row.filename,
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    mimeType: row.mime_type ?? null,
  };
}

/** Echo a just-sent attachment back as a MessageAttachment without re-reading the rows. */
function mapOutgoing(messageId: string, a: OutgoingAttachment, i: number): MessageAttachment {
  return { id: `${messageId}:${i}`, messageId, ...a };
}

function mapMessage(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
    attachmentCount: row.attachment_count ?? 0,
    ...(row.message_attachments
      ? { attachments: (row.message_attachments as any[]).map(mapAttachment) }
      : {}),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// The users+profile+courses select used by every tutor read.
// tutor_profiles has TWO FKs to users (user_id, reviewed_by), so the embed must hint
// the user_id FK explicitly or PostgREST errors on the ambiguity.
const TUTOR_SELECT = `
  id, first_name, last_name, year, major, gender,
  tutor_profiles!user_id!inner ( bio, subjects, hourly_rate, rating_avg, total_sessions, verified_grade, approval_status, grades_verified_at ),
  tutor_courses ( id, tutor_id, course_code, grade, hourly_rate, sessions, created_at )
`;

/**
 * An Edge Function that answered with a non-2xx status. `message` is the server's own
 * `error` string, so it can be shown to the user; `status` is the HTTP status.
 */
export class FunctionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'FunctionError';
    this.status = status;
  }
}

/**
 * Invoke a Supabase Edge Function (server-only logic — see ARCHITECTURE.md §5).
 *
 * supabase-js turns any non-2xx into a FunctionsHttpError whose `.message` is the generic
 * "Edge Function returned a non-2xx status code" and leaves the body unread — so our
 * functions' careful error copy (the deletion 409, the content filter, the pricing
 * rejections) never reached the user. Read the body and rethrow a FunctionError carrying it.
 */
async function invokeFn<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T>(name, { body });
  if (error) {
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === 'function') {
      try {
        const parsed = await res.clone().json();
        const serverMessage = typeof parsed?.error === 'string' ? parsed.error : null;
        if (serverMessage) throw new FunctionError(serverMessage, res.status);
      } catch (e) {
        // A FunctionError is the message we want; anything else means the body wasn't
        // the JSON shape we expected, so fall through to the original error.
        if (e instanceof FunctionError) throw e;
      }
    }
    throw error;
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// write-method inputs (Edge Function bodies)
// ---------------------------------------------------------------------------

/**
 * Note there is deliberately no `price` here. The server derives it from
 * tutor_courses.hourly_rate and checks the held PaymentIntent against it (T5) — a
 * client-supplied price was a cash-out hole, since complete-session transfers the
 * resulting payout out of the platform balance.
 */
export interface ConfirmBookingInput {
  tutorId: string;
  /** Must match a tutor_courses row for this tutor — it selects the rate. */
  courseCode: string;
  scheduledAt: string;
  durationMinutes: number;
  sessionType: 'video' | 'in_person';
  location?: string;
  meetingLink?: string;
  message?: string;
  paymentIntentId?: string;
}

/** The booking being paid for. The server derives the amount from these (T5). */
export interface CreatePaymentIntentInput {
  tutorId: string;
  courseCode: string;
  durationMinutes: number;
  scheduledAt: string;
}

export interface RescheduleBookingInput {
  bookingId: string;
  action: 'propose' | 'accept' | 'decline';
  newScheduledAt?: string;
}

export interface ReportNoShowInput {
  bookingId: string;
  party: 'student' | 'tutor';
}

export interface SubmitRatingInput {
  bookingId: string;
  rating: number;
  comment?: string;
  happened?: boolean;
}

// ---------------------------------------------------------------------------
// api
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase row, like the mappers above */
function mapAmbassadorProfile(row: any): AmbassadorProfile {
  return {
    id: row.id,
    userId: row.user_id,
    referralCode: row.referral_code,
    stripeConnectAccountId: row.stripe_connect_account_id ?? null,
    totalReferrals: row.total_referrals ?? 0,
    totalEarned: num(row.total_earned),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** See api.profile.getTutorStanding. */
export type TutorApplicationStatus = 'none' | 'draft' | 'pending' | 'approved' | 'rejected';

export const api = {
  // --- users / profiles ---
  async getMe(): Promise<User | null> {
    const uid = await requireUid();
    const { data, error } = await getSupabase()
      .from('users')
      .select('*, user_roles(role)')
      .eq('id', uid)
      .maybeSingle();
    if (error) throw error;
    return data ? mapUser(data) : null;
  },

  profile: {
    /** Update the signed-in user's personal fields (edit_personal / student_profile). */
    async updatePersonal(patch: {
      firstName?: string;
      lastName?: string;
      year?: string | null;
      major?: string | null;
      gender?: 'f' | 'm' | null;
    }): Promise<void> {
      const uid = await requireUid();
      const row: Record<string, unknown> = {};
      if (patch.firstName !== undefined) row.first_name = patch.firstName;
      if (patch.lastName !== undefined) row.last_name = patch.lastName;
      if (patch.year !== undefined) row.year = patch.year;
      if (patch.major !== undefined) row.major = patch.major;
      if (patch.gender !== undefined) row.gender = patch.gender;
      if (Object.keys(row).length === 0) return;
      const { error } = await getSupabase().from('users').update(row).eq('id', uid);
      if (error) throw error;
      notifyUserChanged();
    },

    /**
     * Record that the user accepted the Terms of Use (T9, Guideline 1.2). Called from
     * set_password.tsx during onboarding, and from accept_terms.tsx for an account that got
     * a password without passing through it. Keep
     * TERMS_VERSION in step with the effective date of legal/TERMS_OF_USE.md,
     * published at trynoot.com/terms.
     */
    async acceptTerms(version: string): Promise<void> {
      const uid = await requireUid();
      // .select().single() on purpose: a bare update that matches no row (the users row
      // can lag a fresh sign-up) returns no error, and onboarding would continue with
      // terms_accepted_at still null — a silently unrecorded consent.
      const { error } = await getSupabase()
        .from('users')
        .update({ terms_accepted_at: new Date().toISOString(), terms_version: version })
        .eq('id', uid)
        .select('id')
        .single();
      if (error) throw error;
      notifyUserChanged();
    },

    /** Set the student's enrolled course codes (edit_courses). */
    async setCourses(courses: string[]): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase().from('users').update({ courses }).eq('id', uid);
      if (error) throw error;
      notifyUserChanged();
    },

    /**
     * Switch the user's active "mode" (persists to users.active_role). Self-only via RLS;
     * a DB trigger (0007) additionally rejects a role the user doesn't hold. 'admin' is not
     * a switchable mode — the app never passes it here.
     */
    async setActiveRole(role: 'student' | 'tutor' | 'ambassador'): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase().from('users').update({ active_role: role }).eq('id', uid);
      if (error) throw error;
      notifyUserChanged();
    },

    /** Add a role the user can hold (e.g. "Become a tutor/ambassador"). RLS blocks 'admin'. */
    async addRole(role: 'tutor' | 'ambassador'): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('user_roles')
        .upsert({ user_id: uid, role }, { onConflict: 'user_id,role' });
      if (error) throw error;
      notifyUserChanged();
    },

    /**
     * Upload the tutor's transcript to the private `transcripts` bucket as
     * `{uid}/{email}.{ext}` and record the storage path on tutor_profiles.transcript_url.
     * Admins read it via a signed URL (listPendingTutors) — the file is never public.
     * Returns the storage path. `file` must be bytes, not an RN Blob (see putUserFile).
     */
    async uploadTranscript(
      file: Blob | ArrayBuffer | Uint8Array,
      ext: string,
      contentType?: string,
    ): Promise<string> {
      const { uid, path } = await putUserFile('transcripts', file, {
        ext,
        fallbackExt: 'pdf',
        contentType,
        label: 'transcript',
      });
      const { error: pErr } = await getSupabase()
        .from('tutor_profiles')
        .upsert({ user_id: uid, transcript_url: path }, { onConflict: 'user_id' });
      if (pErr) throw pErr;
      notifyUserChanged();
      return path;
    },

    /**
     * Upload the signed-in user's profile photo to the public `avatars` bucket and record the
     * resolved public URL on users.avatar_url. Returns the public URL (with a cache-busting
     * query so an overwrite of the same path still refreshes).
     *
     * Path is `{uid}/{email}.{ext}` — e.g. `beb9a0df-…/sara_at_crimson.ua.edu.jpg`. See
     * putUserFile for why the {uid} folder stays and why `data` must be bytes, not an RN Blob.
     */
    async uploadAvatar(
      data: Blob | ArrayBuffer | Uint8Array,
      ext: string,
      contentType?: string,
    ): Promise<string> {
      const { uid, path } = await putUserFile('avatars', data, {
        ext,
        fallbackExt: 'jpg',
        contentType,
        label: 'image',
      });
      const sb = getSupabase();
      const { data: pub } = sb.storage.from('avatars').getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: uErr } = await sb.from('users').update({ avatar_url: url }).eq('id', uid);
      if (uErr) throw uErr;
      notifyUserChanged();
      return url;
    },

    /**
     * Where the signed-in user stands as a tutor:
     *   'none'     never started (no tutor_profiles row)
     *   'draft'    started onboarding, not submitted yet (submitted_at null — 0038)
     *   'pending'  submitted, in the admin review queue
     *   'approved' live and bookable
     *   'rejected' not approved; can fix and resubmit
     * plus `gradesVerified`: an admin checked the transcript (Verified badge, lower fee).
     *
     * This — NOT user_roles — is the signal the UI should branch on. The tutor role is only
     * granted once an admin approves (approve-tutor), so before that a real applicant holds
     * no tutor role at all and a role check can't tell "never applied" from "in review".
     * tutor_profiles_select (0002) already lets a user read their own row.
     */
    async getTutorStanding(): Promise<{ status: TutorApplicationStatus; gradesVerified: boolean }> {
      const uid = await requireUid();
      const { data, error } = await getSupabase()
        .from('tutor_profiles')
        .select('approval_status, submitted_at, grades_verified_at')
        .eq('user_id', uid)
        .maybeSingle();
      if (error) throw error;
      const gradesVerified = data?.grades_verified_at != null;
      const s = data?.approval_status;
      if (!data) return { status: 'none', gradesVerified };
      if (s === 'approved' || s === 'rejected') return { status: s, gradesVerified };
      return { status: data.submitted_at ? 'pending' : 'draft', gradesVerified };
    },

    /** The signed-in tutor's own scheduled interview, if the team has set one (0042). */
    async getMyInterview(): Promise<TutorInterview | null> {
      const uid = await requireUid();
      const { data, error } = await getSupabase()
        .from('tutor_interviews')
        .select('id, tutor_id, scheduled_at, details')
        .eq('tutor_id', uid)
        .is('cancelled_at', null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapTutorInterview(data) : null;
    },

    /** Just the status part of getTutorStanding. */
    async getTutorStatus(): Promise<TutorApplicationStatus> {
      return (await api.profile.getTutorStanding()).status;
    },

    /**
     * Permanently delete the signed-in user's account (App Store Guideline 5.1.1(v)).
     *
     * Server-side only: the Edge Function takes the target from the verified JWT, so there is
     * no id to tamper with. It revokes the auth identity and de-identifies the app row —
     * bookings and payouts survive, anonymised, because we must retain financial records
     * (disclosed in the privacy policy). Rejects with 409 if a live session is still booked.
     *
     * The caller must sign out afterwards: the session is dead the moment this returns.
     */
    async deleteAccount(): Promise<void> {
      await invokeFn('delete-account');
    },

    /** Create/update the signed-in user's tutor profile (edit_tutor). Upsert on user_id. */
    async updateTutorProfile(patch: {
      bio?: string;
      subjects?: string[];
      hourlyRate?: number;
      transcriptUrl?: string | null;
      verifiedGrade?: string | null;
    }): Promise<void> {
      const uid = await requireUid();
      const row: Record<string, unknown> = { user_id: uid };
      if (patch.bio !== undefined) row.bio = patch.bio;
      if (patch.subjects !== undefined) row.subjects = patch.subjects;
      if (patch.hourlyRate !== undefined) row.hourly_rate = patch.hourlyRate;
      if (patch.transcriptUrl !== undefined) row.transcript_url = patch.transcriptUrl;
      if (patch.verifiedGrade !== undefined) row.verified_grade = patch.verifiedGrade;
      const { error } = await getSupabase()
        .from('tutor_profiles')
        .upsert(row, { onConflict: 'user_id' });
      if (error) throw error;
      notifyUserChanged();
    },

    /**
     * The caller's own tutor application: bio, courses (with grades + rates) and weekly
     * availability. Reads the caller's own rows directly: tutors.getById inner-joins
     * tutor_profiles, so it returns nothing until that row exists — and during onboarding
     * nothing created it before the transcript upload on step 6 (tracker T1).
     */
    async getMyTutorProfile(): Promise<MyTutorProfile> {
      const uid = await requireUid();
      const sb = getSupabase();
      const [prof, courses, avail] = await Promise.all([
        sb
          .from('tutor_profiles')
          .select(
            'bio, approval_status, submitted_at, transcript_url, transcript_skipped, agreement_signed_at, agreement_signed_name, stripe_payouts_enabled, grades_verified_at',
          )
          .eq('user_id', uid)
          .maybeSingle(),
        sb.from('tutor_courses').select('*').eq('tutor_id', uid).order('created_at', { ascending: true }),
        sb.from('tutor_availability').select('*').eq('tutor_id', uid).order('day_of_week', { ascending: true }),
      ]);
      if (prof.error) throw prof.error;
      if (courses.error) throw courses.error;
      if (avail.error) throw avail.error;
      const tp = prof.data;
      return {
        approvalStatus: (tp?.approval_status as MyTutorProfile['approvalStatus']) ?? null,
        submittedAt: tp?.submitted_at ?? null,
        bio: (tp?.bio as string | undefined) ?? '',
        courses: (courses.data ?? []).map(mapTutorCourse),
        availability: (avail.data ?? []).map(mapTutorAvailability),
        transcriptUploaded: !!tp?.transcript_url,
        transcriptSkipped: !!tp?.transcript_skipped,
        agreementSignedAt: tp?.agreement_signed_at ?? null,
        agreementSignedName: tp?.agreement_signed_name ?? null,
        payoutsEnabled: !!tp?.stripe_payouts_enabled,
        gradesVerified: tp?.grades_verified_at != null,
      };
    },

    /** Step 6: sign up without a transcript (unverified, higher fee) — or undo that choice. */
    async setTranscriptSkipped(skipped: boolean): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('tutor_profiles')
        .upsert({ user_id: uid, transcript_skipped: skipped }, { onConflict: 'user_id' });
      if (error) throw error;
      notifyUserChanged();
    },

    /**
     * Step 7: sign the independent contractor agreement. The server stamps the time
     * (sign_tutor_agreement, 0038); `version` pins the exact text signed.
     */
    async signAgreement(signedName: string, version: string): Promise<string> {
      const { data, error } = await getSupabase().rpc('sign_tutor_agreement', {
        signed_name: signedName,
        version,
      });
      if (error) throw error;
      notifyUserChanged();
      return data as string;
    },

    /**
     * Step 9: submit for review. The server re-checks every requirement and refuses an
     * incomplete application ("application incomplete: photo, payouts") — see
     * submit_tutor_application in 0038. Moves the status from draft to in review.
     */
    async submitTutorApplication(): Promise<string> {
      const { data, error } = await getSupabase().rpc('submit_tutor_application');
      if (error) throw error;
      notifyUserChanged();
      return data as string;
    },

    /** Update just the tutor's base hourly rate (edit_rates). */
    async updateRates(hourlyRate: number): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('tutor_profiles')
        .update({ hourly_rate: hourlyRate })
        .eq('user_id', uid);
      if (error) throw error;
      notifyUserChanged();
    },

    /**
     * Save the tutor's per-course list in one transaction (set_tutor_courses, 0048): courses
     * left out are removed, the rest are added or updated in place, so a course keeps its
     * session count. Once an admin has verified the tutor's grades the server only accepts
     * rate changes and removals — a new course or a changed grade is refused (ERR-012).
     */
    async setTutorCourses(
      courses: { courseCode: string; grade?: string | null; hourlyRate?: number }[],
    ): Promise<void> {
      await requireUid();
      const { error } = await getSupabase().rpc('set_tutor_courses', {
        p_courses: courses.map((c) => ({
          course_code: c.courseCode,
          grade: c.grade ?? null,
          hourly_rate: c.hourlyRate ?? 0,
        })),
      });
      if (error) throw error;
      notifyUserChanged();
    },

    /** Replace the tutor's recurring weekly availability windows (edit_availability). */
    async updateAvailability(
      weekly: { dayOfWeek: number; startTime: string; endTime: string }[],
    ): Promise<void> {
      const uid = await requireUid();
      const sb = getSupabase();
      const { error: delErr } = await sb.from('tutor_availability').delete().eq('tutor_id', uid);
      if (delErr) throw delErr;
      if (weekly.length === 0) return notifyUserChanged();
      const rows = weekly.map((w) => ({
        tutor_id: uid,
        day_of_week: w.dayOfWeek,
        start_time: w.startTime,
        end_time: w.endTime,
      }));
      const { error } = await sb.from('tutor_availability').insert(rows);
      if (error) throw error;
      notifyUserChanged();
    },
  },

  // --- tutors (search / browse / saved) ---
  tutors: {
    /**
     * Approved tutors, optionally narrowed to those who teach an exact `course` (b1). Omit it
     * for everyone — the Search tab groups that one list into categories itself.
     */
    async search(opts: { course?: string } = {}): Promise<TutorSummary[]> {
      const sb = getSupabase();
      let ids: string[] | null = null;
      if (opts.course) {
        const { data, error } = await sb
          .from('tutor_courses')
          .select('tutor_id')
          .eq('course_code', opts.course);
        if (error) throw error;
        ids = [...new Set((data ?? []).map((r: { tutor_id: string }) => r.tutor_id))];
        if (ids.length === 0) return [];
      }
      // deleted_at: a tutor who deletes their account keeps an approved tutor_profiles row
      // (0026 retains the de-identified user for the financial history), so filtering on
      // approval alone would keep listing them as "Deleted account" — bookable and unreachable.
      let q = sb
        .from('users')
        .select(TUTOR_SELECT)
        .eq('tutor_profiles.approval_status', 'approved')
        .is('deleted_at', null);
      if (ids) q = q.in('id', ids);
      // Never list the signed-in user to themselves. A user can hold both roles, so an
      // approved tutor browsing as a student would otherwise find their own card, open it,
      // and be able to book a session with themselves. Excluded here rather than filtered in
      // each screen so every caller of search() gets it.
      const meId = await getSupabase()
        .auth.getSession()
        .then(({ data }) => data.session?.user.id ?? null)
        .catch(() => null);
      if (meId) q = q.neq('id', meId);
      // Blocking must remove them from search too, not only from chat — otherwise you keep
      // seeing and can still book someone you blocked.
      if (meId) {
        const { data: blocks } = await sb.from('user_blocks').select('blocked_id').eq('blocker_id', meId);
        const ids = (blocks ?? []).map((b) => b.blocked_id as string);
        if (ids.length) q = q.not('id', 'in', `(${ids.join(',')})`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapTutorSummary);
    },

    /** A tutor's recurring weekly availability. RLS allows any authenticated read. */
    async getAvailability(tutorId: string): Promise<TutorAvailability[]> {
      const { data, error } = await getSupabase()
        .from('tutor_availability')
        .select('*')
        .eq('tutor_id', tutorId)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapTutorAvailability);
    },

    /** Full tutor detail by user id (tutor profile page). */
    async getById(userId: string): Promise<TutorSummary | null> {
      const { data, error } = await getSupabase()
        .from('users')
        .select(TUTOR_SELECT)
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapTutorSummary(data) : null;
    },

    /** The signed-in student's saved tutors (b2). */
    async listSaved(): Promise<TutorSummary[]> {
      const uid = await requireUid();
      const sb = getSupabase();
      const { data, error } = await sb.from('saved_tutors').select('tutor_id').eq('student_id', uid);
      if (error) throw error;
      const ids = (data ?? []).map((r: { tutor_id: string }) => r.tutor_id);
      if (ids.length === 0) return [];
      const { data: tutors, error: tErr } = await sb.from('users').select(TUTOR_SELECT).in('id', ids);
      if (tErr) throw tErr;
      return (tutors ?? []).map(mapTutorSummary);
    },

    async save(tutorId: string): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('saved_tutors')
        .upsert({ student_id: uid, tutor_id: tutorId }, { onConflict: 'student_id,tutor_id' });
      if (error) throw error;
    },

    async unsave(tutorId: string): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('saved_tutors')
        .delete()
        .eq('student_id', uid)
        .eq('tutor_id', tutorId);
      if (error) throw error;
    },
  },

  // --- bookings ---
  /** Confirmed, future sessions for the signed-in user (as student OR tutor). */
  async listUpcoming(): Promise<Booking[]> {
    const uid = await requireUid();
    const nowIso = new Date().toISOString();
    const { data, error } = await getSupabase()
      .from('bookings')
      .select('*')
      .or(`student_id.eq.${uid},tutor_id.eq.${uid}`)
      .eq('status', 'confirmed')
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapBooking);
  },

  /**
   * Past sessions for the signed-in user (as student OR tutor): anything scheduled
   * before now that wasn't cancelled, newest first. RLS lets a user read their own
   * bookings (bookings_select), so this needs no new table. Note: resolving the
   * COUNTERPARTY's name still depends on users_select — a student can read the
   * (approved) tutor, but a tutor cannot read a student (RLS gap, see notes).
   */
  async listPast(): Promise<Booking[]> {
    const uid = await requireUid();
    const nowIso = new Date().toISOString();
    const { data, error } = await getSupabase()
      .from('bookings')
      .select('*')
      .or(`student_id.eq.${uid},tutor_id.eq.${uid}`)
      .in('status', ['confirmed', 'completed'])
      .lt('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapBooking);
  },

  /**
   * Names of the people the signed-in user shares a booking with, keyed by user id:
   * `{ [userId]: { firstName, lastName } }`. Backed by the `resolve-participants`
   * Edge Function (service role) because users_select RLS won't let a tutor read a
   * student's row directly — the function only returns genuine booking counterparties,
   * preserving that boundary.
   */
  resolveParticipantNames(): Promise<
    Record<string, { firstName: string; lastName: string; year: string | null; major: string | null }>
  > {
    return invokeFn('resolve-participants');
  },

  /**
   * Live dashboard stats for the signed-in tutor, derived from their real bookings
   * (as tutor). Money reflects the current simulated payouts. `avgRating` comes from
   * the denormalized profile average (null until they have approved reviews).
   */
  async tutorStats(): Promise<{
    sessionsTaught: number;
    hoursTaught: number;
    earnedThisWeek: number;
    earnedTotal: number;
    avgRating: number | null;
    cancelledCount: number;
    cancelRate: number;
  }> {
    const uid = await requireUid();
    const sb = getSupabase();
    const { data, error } = await sb
      .from('bookings')
      .select('status, scheduled_at, tutor_payout_amount, duration_minutes')
      .eq('tutor_id', uid);
    if (error) throw error;
    const rows = data ?? [];
    const completed = rows.filter((r) => r.status === 'completed');
    const cancelled = rows.filter((r) => r.status === 'cancelled');
    const weekAgo = Date.now() - 7 * 86_400_000;
    const earnedTotal = completed.reduce((s, r) => s + num(r.tutor_payout_amount), 0);
    const earnedThisWeek = completed
      .filter((r) => new Date(r.scheduled_at as string).getTime() >= weekAgo)
      .reduce((s, r) => s + num(r.tutor_payout_amount), 0);
    const hoursTaught = completed.reduce((s, r) => s + num(r.duration_minutes) / 60, 0);
    const { data: prof } = await sb.from('tutor_profiles').select('rating_avg').eq('user_id', uid).maybeSingle();
    const denom = completed.length + cancelled.length;
    return {
      sessionsTaught: completed.length,
      hoursTaught,
      earnedThisWeek,
      earnedTotal,
      avgRating: prof?.rating_avg != null ? Number(prof.rating_avg) : null,
      cancelledCount: cancelled.length,
      cancelRate: denom ? cancelled.length / denom : 0,
    };
  },

  /** Live study stats for the signed-in student, derived from their real bookings. */
  async studentStats(): Promise<{ sessionsCompleted: number; upcomingCount: number; hoursLearned: number }> {
    const uid = await requireUid();
    const nowMs = Date.now();
    const { data, error } = await getSupabase()
      .from('bookings')
      .select('status, scheduled_at, duration_minutes')
      .eq('student_id', uid);
    if (error) throw error;
    const rows = data ?? [];
    const isPast = (r: { scheduled_at: string }) => new Date(r.scheduled_at).getTime() < nowMs;
    const completed = rows.filter((r) => r.status === 'completed' || (r.status === 'confirmed' && isPast(r as { scheduled_at: string })));
    const upcoming = rows.filter((r) => r.status === 'confirmed' && !isPast(r as { scheduled_at: string }));
    const hoursLearned = completed.reduce((s, r) => s + num(r.duration_minutes) / 60, 0);
    return { sessionsCompleted: completed.length, upcomingCount: upcoming.length, hoursLearned };
  },

  // --- ambassador ---
  ambassador: {
    /**
     * Create (idempotently) the caller's ambassador profile with a unique, server-generated
     * referral code; returns the code. Backed by the create_my_ambassador_profile() DB
     * function so the code is never client-chosen.
     */
    async ensureProfile(): Promise<string> {
      const { data, error } = await getSupabase().rpc('create_my_ambassador_profile');
      if (error) throw error;
      return data as string;
    },

    /** The caller's ambassador profile, or null if they haven't become one. RLS: self-only. */
    async getProfile(): Promise<AmbassadorProfile | null> {
      const uid = await requireUid();
      const { data, error } = await getSupabase()
        .from('ambassador_profiles')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();
      if (error) throw error;
      return data ? mapAmbassadorProfile(data) : null;
    },

  },

  // --- Noot credits (0040). Every balance change is written server-side; these only read,
  //     plus the two caller-scoped actions (redeem a code, request a cash-out). ---
  credits: {
    /** The caller's invite code, generated on first use. Never client-chosen. */
    async myCode(): Promise<string> {
      const { data, error } = await getSupabase().rpc('my_invite_code');
      if (error) throw error;
      return data as string;
    },

    /**
     * Use a friend's invite code as the signed-in (new) account. The app calls this right
     * after first sign-in with the code typed at sign-up. Server rules: once, before any
     * booking, and only the code of someone who joined before you (claim_invite, 0040).
     */
    async claim(code: string): Promise<void> {
      const { error } = await getSupabase().rpc('claim_invite', { p_code: code });
      if (error) throw error;
    },

    /** Does this invite code exist? For the sign-up screen, so works signed out. */
    async checkCode(code: string): Promise<boolean> {
      const { data, error } = await getSupabase().rpc('check_invite_code', { p_code: code });
      if (error) throw error;
      return Boolean(data);
    },

    /** Current balance in cents. */
    async balance(): Promise<number> {
      const { data, error } = await getSupabase().rpc('my_credit_balance');
      if (error) throw error;
      return Number(data ?? 0);
    },

    /** People the caller invited, newest first, with whether they've completed a session. */
    async invites(): Promise<Invite[]> {
      const { data, error } = await getSupabase().rpc('my_invites');
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        referralId: r.referral_id as string,
        name: (r.display_name as string) || 'A classmate',
        joinedAt: r.joined_at as string,
        completed: Boolean(r.completed),
        reversed: Boolean(r.reversed),
        rewardCents: Number(r.reward_cents ?? 0),
      }));
    },

    /** Ambassador goals, smallest first. */
    async milestones(): Promise<Milestone[]> {
      const { data, error } = await getSupabase()
        .from('ambassador_milestones')
        .select('threshold, bonus_cents')
        .order('threshold');
      if (error) throw error;
      return (data ?? []).map((m) => ({ threshold: m.threshold as number, bonusCents: m.bonus_cents as number }));
    },

    /** The caller's credit history, newest first. RLS: own rows only. */
    async history(): Promise<CreditEntry[]> {
      const uid = await requireUid();
      const { data, error } = await getSupabase()
        .from('credit_ledger')
        .select('id, kind, amount_cents, milestone, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((e) => ({
        id: e.id as string,
        kind: e.kind as CreditKind,
        amountCents: e.amount_cents as number,
        milestone: (e.milestone as number | null) ?? null,
        createdAt: e.created_at as string,
      }));
    },

    /** Has the team approved the caller as an ambassador (unlocks cash-out and goal bonuses)? */
    async ambassadorApproved(): Promise<boolean> {
      const uid = await requireUid();
      const { data, error } = await getSupabase()
        .from('ambassador_approvals')
        .select('user_id')
        .eq('user_id', uid)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },

    /** Cents the caller could cash out now: 0 unless approved; excludes credit earned this week. */
    async cashable(): Promise<number> {
      const { data, error } = await getSupabase().rpc('my_cashable_credit');
      if (error) throw error;
      return Number(data ?? 0);
    },

    /** Approved ambassadors only: ask the team to pay out `cents` ($10 minimum). Debits immediately. */
    async requestCashout(cents: number): Promise<void> {
      const { error } = await getSupabase().rpc('request_credit_cashout', { p_cents: cents });
      if (error) throw error;
    },
  },

  // --- admin (RLS is_admin() already permits these reads; writes go through Edge Functions) ---
  admin: {
    /**
     * The live interview for each of these tutors, keyed by tutor id (ERR-005). RLS shows an
     * admin all of them; anyone else sees at most their own.
     */
    async listInterviews(tutorIds: string[]): Promise<Record<string, TutorInterview>> {
      if (tutorIds.length === 0) return {};
      const { data, error } = await getSupabase()
        .from('tutor_interviews')
        .select('id, tutor_id, scheduled_at, details')
        .in('tutor_id', tutorIds)
        .is('cancelled_at', null);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.tutor_id as string, mapTutorInterview(r)]));
    },

    /**
     * Set (or move) a tutor applicant's interview. The server checks the caller is an admin,
     * the tutor has applied and the time is ahead, then notifies the tutor
     * (schedule_tutor_interview, 0042). Returns the interview as saved.
     */
    async scheduleInterview(tutorId: string, scheduledAt: string, details = ''): Promise<TutorInterview> {
      const { data, error } = await getSupabase().rpc('schedule_tutor_interview', {
        p_tutor: tutorId,
        p_at: scheduledAt,
        p_details: details,
      });
      if (error) throw error;
      // As the server stored it (it trims the details and caps them at 500 characters).
      return { id: data as string, tutorId, scheduledAt, details: details.trim().slice(0, 500) };
    },

    /** Call off a tutor's interview and tell them (cancel_tutor_interview, 0042). */
    async cancelInterview(tutorId: string): Promise<void> {
      const { error } = await getSupabase().rpc('cancel_tutor_interview', { p_tutor: tutorId });
      if (error) throw error;
    },

    /** Tutors awaiting approval (oldest first). Admin-only via RLS. */
    async listPendingTutors(): Promise<PendingTutor[]> {
      const sb = getSupabase();
      const { data: profs, error } = await sb
        .from('tutor_profiles')
        .select('user_id, bio, subjects, hourly_rate, transcript_url, verified_grade, created_at, submitted_at, approval_status, grades_verified_at')
        // Two queues (0038): submitted applications (drafts stay out until the tutor
        // submits), and live tutors whose uploaded transcript hasn't been checked yet.
        .or(
          'and(approval_status.eq.pending,submitted_at.not.is.null),' +
            'and(approval_status.eq.approved,transcript_url.not.is.null,grades_verified_at.is.null)',
        )
        .order('submitted_at', { ascending: true });
      if (error) throw error;
      const rows = profs ?? [];
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.user_id);
      const { data: users, error: uErr } = await sb
        .from('users')
        .select('id, first_name, last_name, email, year, major')
        .in('id', ids);
      if (uErr) throw uErr;
      const byId = new Map((users ?? []).map((u) => [u.id, u]));
      // Resolve each transcript storage path to a short-lived signed URL (private bucket).
      return Promise.all(
        rows.map(async (r) => {
          let transcriptUrl: string | null = null;
          if (r.transcript_url) {
            const { data: signed } = await sb.storage.from('transcripts').createSignedUrl(r.transcript_url, 300);
            transcriptUrl = signed?.signedUrl ?? null;
          }
          const u = byId.get(r.user_id);
          return {
            userId: r.user_id,
            name: u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Tutor' : 'Tutor',
            email: u?.email ?? '',
            year: u?.year ?? null,
            major: u?.major ?? null,
            bio: r.bio ?? '',
            subjects: r.subjects ?? [],
            hourlyRate: num(r.hourly_rate),
            transcriptUrl,
            verifiedGrade: r.verified_grade ?? null,
            submittedAt: r.submitted_at ?? r.created_at,
            awaiting: r.approval_status === 'approved' ? 'grades' : 'application',
            hasTranscript: !!r.transcript_url,
          } satisfies PendingTutor;
        }),
      );
    },

    /** Approve or reject a tutor (approve-tutor Edge Function; re-verifies admin server-side). */
    approveTutor(
      tutorUserId: string,
      decision: 'approved' | 'rejected',
      opts: { verifyGrades?: boolean } = {},
    ): Promise<{ ok: true; approvalStatus: string; gradesVerified: boolean }> {
      return invokeFn('approve-tutor', { tutorUserId, decision, ...(opts.verifyGrades ? { verifyGrades: true } : {}) });
    },

    /** Mark a tutor's transcript as checked — the Verified badge and the lower fee (T6). */
    verifyTutorGrades(tutorUserId: string): Promise<{ ok: true; approvalStatus: string; gradesVerified: boolean }> {
      return invokeFn('approve-tutor', { tutorUserId, verifyGrades: true });
    },

    /**
     * One page of accounts, newest first, with how many match in all (admin_list_users,
     * 0046). Search and filters run on the server, so the list stays usable however many
     * accounts there are. The server refuses anyone who is not an admin.
     */
    async listUsers(query: AdminUserQuery = {}): Promise<{ users: AdminUser[]; total: number }> {
      const { data, error } = await getSupabase().rpc('admin_list_users', {
        p_search: query.search ?? '',
        p_role: query.role ?? null,
        p_status: query.status ?? null,
        p_limit: query.limit ?? 50,
        p_offset: query.offset ?? 0,
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[];
      return {
        total: Number(rows[0]?.total ?? 0),
        users: rows.map((u) => ({
          id: u.id,
          name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—',
          email: u.email,
          roles: u.roles ?? [],
          status: u.status,
          deletedAt: u.deleted_at ?? null,
          createdAt: u.created_at,
        })),
      };
    },

    /** Suspend / ban / reactivate an account (admin-set-user-status Edge Function). */
    setUserStatus(userId: string, status: 'active' | 'suspended' | 'banned'): Promise<{ ok: true; status: string }> {
      return invokeFn('admin-set-user-status', { userId, status });
    },

    /** Reviews awaiting moderation, with reviewer/subject names + course. */
    async listPendingReviews(): Promise<AdminReview[]> {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('reviews')
        .select('id, rating, comment, reviewer_id, subject_user_id, booking_id, created_at')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];
      const userIds = [...new Set(rows.flatMap((r) => [r.reviewer_id, r.subject_user_id]))];
      const bookingIds = [...new Set(rows.map((r) => r.booking_id))];
      const [{ data: users }, { data: bookings }] = await Promise.all([
        sb.from('users').select('id, first_name, last_name').in('id', userIds),
        sb.from('bookings').select('id, subject').in('id', bookingIds),
      ]);
      const nameById = new Map((users ?? []).map((u) => [u.id, `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—']));
      const courseById = new Map((bookings ?? []).map((b) => [b.id, b.subject]));
      return rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment ?? null,
        reviewerName: nameById.get(r.reviewer_id) ?? '—',
        subjectName: nameById.get(r.subject_user_id) ?? '—',
        course: courseById.get(r.booking_id) ?? '',
        createdAt: r.created_at,
      }));
    },

    /** Approve or reject a pending review (moderate-review Edge Function). */
    moderateReview(reviewId: string, decision: 'approved' | 'rejected'): Promise<{ ok: true }> {
      return invokeFn('moderate-review', { reviewId, decision });
    },

    /** Recent bookings across the platform with party names + dispute state (admin RLS). */
    /**
     * The open moderation queue (Guideline 1.2 — "timely response"). Admin-only by RLS, so a
     * non-admin gets an empty list rather than an error.
     */
    async listReports(): Promise<ContentReport[]> {
      const { data, error } = await getSupabase()
        .from('content_reports')
        .select('*, reporter:users!reporter_id(first_name,last_name), target:users!target_user_id(first_name,last_name), message:messages!target_message_id(content, sender:users!sender_id(first_name,last_name))')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      if (error) throw error;
      /* eslint-disable @typescript-eslint/no-explicit-any */
      return (data ?? []).map((r: any): ContentReport => ({
        id: r.id,
        reporterId: r.reporter_id ?? null,
        autoFlagged: r.auto_flagged === true,
        targetKind: r.target_kind,
        targetMessageId: r.target_message_id ?? null,
        targetUserId: r.target_user_id ?? null,
        targetReviewId: r.target_review_id ?? null,
        reason: r.reason,
        detail: r.detail ?? null,
        status: r.status,
        createdAt: r.created_at,
        reporterName: `${r.reporter?.first_name ?? ''} ${r.reporter?.last_name ?? ''}`.trim() || 'Someone',
        targetName: r.target ? `${r.target.first_name ?? ''} ${r.target.last_name ?? ''}`.trim() : undefined,
        messageContent: r.message?.content ?? null,
        messageSenderName: r.message?.sender
          ? `${r.message.sender.first_name ?? ''} ${r.message.sender.last_name ?? ''}`.trim() || undefined
          : undefined,
      }));
      /* eslint-enable @typescript-eslint/no-explicit-any */
    },

    /** Close a report. RLS restricts the update to admins. */
    async resolveReport(reportId: string, status: 'actioned' | 'dismissed'): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('content_reports')
        .update({ status, reviewed_by: uid, reviewed_at: new Date().toISOString() })
        .eq('id', reportId);
      if (error) throw error;
    },

    async listBookings(): Promise<AdminBooking[]> {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('bookings')
        .select('id, student_id, tutor_id, subject, scheduled_at, status, price, dispute_status, dispute_reason')
        .order('scheduled_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = data ?? [];
      const ids = [...new Set(rows.flatMap((b) => [b.student_id, b.tutor_id]))];
      const { data: users } = ids.length
        ? await sb.from('users').select('id, first_name, last_name').in('id', ids)
        : { data: [] };
      const nameById = new Map((users ?? []).map((u) => [u.id, `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—']));
      return rows.map((b) => ({
        id: b.id,
        studentName: nameById.get(b.student_id) ?? '—',
        tutorName: nameById.get(b.tutor_id) ?? '—',
        subject: b.subject,
        scheduledAt: b.scheduled_at,
        status: b.status,
        price: num(b.price),
        disputeStatus: b.dispute_status ?? 'none',
        disputeReason: b.dispute_reason ?? null,
      }));
    },

    /** Flag or resolve a booking dispute (resolve-dispute Edge Function). */
    resolveDispute(
      bookingId: string,
      action: 'flag' | 'resolve',
      opts?: { reason?: string; resolution?: string },
    ): Promise<{ ok: true; disputeStatus: string }> {
      return invokeFn('resolve-dispute', { bookingId, action, ...opts });
    },
  },

  /**
   * B4 → held (manual-capture) PaymentIntent via `create-payment-intent`. Returns the
   * params the client PaymentSheet needs, plus the server-computed amount; `simulated` is
   * true when no Stripe key is set (dev/web) so callers can skip presenting the sheet.
   * Capture happens in complete-session. The amount is the server's, never the caller's.
   */
  createPaymentIntent(
    input: CreatePaymentIntentInput,
  ): Promise<{
    paymentIntentClientSecret: string;
    ephemeralKeySecret: string | null;
    customerId: string | null;
    paymentIntentId: string;
    /** Authoritative, server-computed. Show this, don't recompute it. */
    amountCents: number;
    /** Noot credit taken off automatically (0040). */
    creditCents: number;
    /** What the card is charged: amountCents − creditCents. */
    chargeCents: number;
    price: number;
    simulated: boolean;
  }> {
    return invokeFn('create-payment-intent', input as unknown as Record<string, unknown>);
  },

  // --- bookings (trust-sensitive writes → Edge Functions, see ARCHITECTURE.md §5) ---
  bookings: {
    /** Create the booking + conversation with the held PaymentIntent (confirm-booking). */
    confirm(
      input: ConfirmBookingInput,
    ): Promise<{ bookingId: string; conversationId: string }> {
      return invokeFn('confirm-booking', input as unknown as Record<string, unknown>);
    },

    /** Cancel a booking; returns the resulting refund outcome (cancel-booking). */
    cancel(
      bookingId: string,
    ): Promise<{ status: string; refundPercent: number; refundStatus: string }> {
      return invokeFn('cancel-booking', { bookingId });
    },

    /** Propose/accept/decline a reschedule of a booking (reschedule-booking). */
    reschedule(input: RescheduleBookingInput): Promise<{ ok: true }> {
      return invokeFn('reschedule-booking', input as unknown as Record<string, unknown>);
    },

    /** Report that a party didn't show; returns refund outcome (report-no-show). */
    reportNoShow(
      input: ReportNoShowInput,
    ): Promise<{ status: string; refundPercent: number }> {
      return invokeFn('report-no-show', input as unknown as Record<string, unknown>);
    },

    /**
     * Tutor marks a confirmed session complete → captures the held payment and transfers
     * the tutor's payout to their connected account (complete-session). Idempotent.
     */
    complete(
      bookingId: string,
    ): Promise<{ status: string; captured: boolean; transferId: string | null }> {
      return invokeFn('complete-session', { bookingId });
    },
  },

  // --- Stripe Connect (tutor payouts, see ARCHITECTURE.md §8) ---
  connect: {
    /** Create/reuse the tutor's Express account and return a hosted onboarding URL. */
    onboardingLink(): Promise<{ url: string | null; accountId?: string; simulated?: boolean }> {
      return invokeFn('connect-onboarding-link');
    },
    /** The tutor's Connect readiness — drives the payout-setup UI. */
    status(): Promise<{ connected: boolean; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean }> {
      return invokeFn('connect-status');
    },
  },

  // --- chat ---
  chat: {
    /** Find (or create, as the student) the 1:1 conversation with a tutor. */
    async getOrCreateConversation(tutorId: string): Promise<Conversation> {
      const uid = await requireUid();
      const sb = getSupabase();
      const { data: existing, error } = await sb
        .from('conversations')
        .select('*')
        .eq('student_id', uid)
        .eq('tutor_id', tutorId)
        .maybeSingle();
      if (error) throw error;
      if (existing) return mapConversation(existing);
      const { data: created, error: insErr } = await sb
        .from('conversations')
        .insert({ student_id: uid, tutor_id: tutorId })
        .select('*')
        .single();
      if (insErr) throw insErr;
      return mapConversation(created);
    },

    /**
     * Tutor side: the conversation with one of your students. confirm-booking creates it
     * when the session is booked; tutors can't start one (conversations_insert, 0002).
     * getOrCreateConversation is the STUDENT's call — it matches student_id = me — which is
     * why the tutor chat never found the real conversation (tracker B2).
     */
    async getConversationWithStudent(studentId: string): Promise<Conversation> {
      const uid = await requireUid();
      const { data, error } = await getSupabase()
        .from('conversations')
        .select('*')
        .eq('tutor_id', uid)
        .eq('student_id', studentId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No conversation with this student yet.');
      return mapConversation(data);
    },

    /**
     * The single admin team room (0024). Membership is implicit — RLS returns this row only
     * to admins, and only admins can read or post in it. Throws for everyone else.
     */
    async getAdminRoom(): Promise<Conversation> {
      const { data, error } = await getSupabase()
        .from('conversations')
        .select('*')
        .eq('kind', 'admin')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Admin room unavailable.');
      return mapConversation(data);
    },

    /**
     * Sender name + avatar for a group thread, where the header can't imply who's talking.
     * Reads `users` directly: the users_select policy (0002) already lets an admin see any
     * row, so this returns nothing useful to a non-admin rather than leaking.
     */
    async listParticipants(userIds: string[]): Promise<Record<string, ChatParticipant>> {
      const ids = [...new Set(userIds)].filter(Boolean);
      if (!ids.length) return {};
      const { data, error } = await getSupabase()
        .from('users')
        .select('id, first_name, last_name, avatar_url')
        .in('id', ids);
      if (error) throw error;
      const out: Record<string, ChatParticipant> = {};
      for (const row of data ?? []) out[row.id] = mapParticipant(row);
      return out;
    },

    async listMessages(conversationId: string): Promise<Message[]> {
      const { data, error } = await getSupabase()
        .from('messages')
        .select(`${MESSAGE_SELECT}, message_attachments(*)`)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapMessage);
    },

    /**
     * Put one attachment in the private `chat-attachments` bucket, ready to hand to
     * sendMessage. Keyed `{conversationId}/{unique}-{filename}` — the leading folder is what
     * the Storage policies (0021) authorize against, so an upload only succeeds for a
     * conversation the caller is actually in.
     *
     * `data` must be bytes, not a React Native Blob (that writes a 0-byte object — see
     * putUserFile). Returns the descriptor, NOT a message: nothing is visible to the
     * counterpart until sendMessage commits.
     */
    async uploadAttachment(
      conversationId: string,
      data: Blob | ArrayBuffer | Uint8Array,
      filename: string,
      mimeType?: string | null,
    ): Promise<OutgoingAttachment> {
      const size = byteLength(data);
      if (!size) throw new Error('That file came through empty — please pick it again.');
      if (size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`Attachments are limited to ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`);
      }

      const safeName = (filename || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const storagePath = `${conversationId}/${unique}-${safeName}`;
      const ext = safeName.split('.').pop()?.toLowerCase() ?? '';
      const type =
        mimeType || (data instanceof Blob ? data.type : '') || MIME_BY_EXT[ext] || 'application/octet-stream';

      const { error } = await getSupabase()
        .storage.from('chat-attachments')
        .upload(storagePath, data, { contentType: type, upsert: false });
      if (error) throw error;

      return {
        storagePath,
        kind: type.startsWith('image/') ? 'image' : 'file',
        filename: filename || safeName,
        sizeBytes: size,
        mimeType: type,
      };
    },

    /**
     * Resolve storage paths to short-lived signed URLs for display. The bucket is private, so
     * every render of an attachment goes through here; URLs expire and are not shareable.
     * Returns a path→URL map, omitting any that failed rather than throwing the whole batch.
     */
    async attachmentUrls(storagePaths: string[], expiresInSeconds = 3600): Promise<Record<string, string>> {
      const paths = [...new Set(storagePaths)].filter(Boolean);
      if (!paths.length) return {};
      const { data, error } = await getSupabase()
        .storage.from('chat-attachments')
        .createSignedUrls(paths, expiresInSeconds);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const row of data ?? []) {
        if (row.signedUrl && row.path) out[row.path] = row.signedUrl;
      }
      return out;
    },

    /**
     * Send a message, optionally with attachments already uploaded via uploadAttachment.
     * Goes through the send_message_with_attachments RPC (0021) so the message row and its
     * attachment rows commit together — otherwise a subscriber can receive the message before
     * the attachments exist and render it with them missing.
     */
    async sendMessage(
      conversationId: string,
      content: string,
      attachments: OutgoingAttachment[] = [],
    ): Promise<Message> {
      if (!content.trim() && attachments.length === 0) {
        throw new Error('Nothing to send.');
      }
      const { data, error } = await getSupabase().rpc('send_message_with_attachments', {
        p_conversation_id: conversationId,
        p_content: content,
        p_attachments: attachments,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { ...mapMessage(row), attachments: attachments.map((a, i) => mapOutgoing(row.id, a, i)) };
    },

    /**
     * Live new-message subscription. Returns an unsubscribe fn.
     *
     * The realtime payload is the `messages` row only — it can't carry the child attachment
     * rows — so a message that has any triggers one follow-up read. `attachment_count` keeps
     * the common text-only case at zero extra queries.
     */
    subscribe(conversationId: string, onMessage: (m: Message) => void): () => void {
      const sb = getSupabase();
      const channel = sb
        .channel(`messages:${conversationId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
          (payload) => {
            const msg = mapMessage(payload.new);
            if (msg.attachmentCount === 0) {
              onMessage(msg);
              return;
            }
            void sb
              .from('message_attachments')
              .select('*')
              .eq('message_id', msg.id)
              .then(({ data }) => {
                onMessage({ ...msg, attachments: (data ?? []).map(mapAttachment) });
              });
          },
        )
        .subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },

    /** The signed-in user's conversations with counterpart + last message (chat list). */
    async listConversations(): Promise<ConversationSummary[]> {
      const uid = await requireUid();
      const sb = getSupabase();
      const { data: convos, error } = await sb
        .from('conversations')
        .select('*')
        .eq('kind', 'direct')
        .or(`student_id.eq.${uid},tutor_id.eq.${uid}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = convos ?? [];
      if (rows.length === 0) return [];

      // counterpart names
      const otherIds = [...new Set(rows.map((c) => (c.student_id === uid ? c.tutor_id : c.student_id)))];
      const { data: users, error: uErr } = await sb
        .from('users')
        .select('id, first_name, last_name')
        .in('id', otherIds);
      if (uErr) throw uErr;
      const byId = new Map((users ?? []).map((u) => [u.id, u]));

      // last message per conversation (fetch recent, pick newest per convo)
      const convoIds = rows.map((c) => c.id);
      const { data: msgs, error: mErr } = await sb
        .from('messages')
        .select('*')
        .in('conversation_id', convoIds)
        .order('created_at', { ascending: false });
      if (mErr) throw mErr;
      const lastByConvo = new Map<string, Record<string, unknown>>();
      for (const m of msgs ?? []) {
        if (!lastByConvo.has(m.conversation_id)) lastByConvo.set(m.conversation_id, m);
      }

      return rows.map((c): ConversationSummary => {
        const otherId = c.student_id === uid ? c.tutor_id : c.student_id;
        const u = byId.get(otherId);
        const last = lastByConvo.get(c.id);
        return {
          id: c.id,
          counterpart: {
            id: otherId,
            firstName: u?.first_name ?? '',
            lastName: u?.last_name ?? '',
          },
          lastMessage: last ? mapMessage(last) : null,
          createdAt: c.created_at,
        };
      });
    },
  },

  // --- moderation (App Store Guideline 1.2) ---
  //
  // Blocking is enforced in the DATABASE, not here: the messages_insert policy (0028) refuses
  // a write when either party has blocked the other, so a hostile client cannot bypass it by
  // skipping these helpers. The reads below additionally hide blocked people from the UI.
  moderation: {
    /** Report a chat message. */
    async reportMessage(messageId: string, reason: ReportReason, detail?: string): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase().from('content_reports').insert({
        reporter_id: uid, target_kind: 'message', target_message_id: messageId,
        reason, detail: detail?.trim() || null,
      });
      if (error) throw error;
    },

    /** Report a user (their conduct rather than one message). */
    async reportUser(userId: string, reason: ReportReason, detail?: string): Promise<void> {
      const uid = await requireUid();
      if (userId === uid) throw new Error('You cannot report yourself.');
      const { error } = await getSupabase().from('content_reports').insert({
        reporter_id: uid, target_kind: 'user', target_user_id: userId,
        reason, detail: detail?.trim() || null,
      });
      if (error) throw error;
    },

    /**
     * Block a user. Symmetric by design — neither of you can message the other afterwards, so
     * blocking someone doesn't leave you able to keep contacting them.
     */
    async blockUser(userId: string): Promise<void> {
      const uid = await requireUid();
      if (userId === uid) throw new Error('You cannot block yourself.');
      const { error } = await getSupabase()
        .from('user_blocks')
        .upsert({ blocker_id: uid, blocked_id: userId }, { onConflict: 'blocker_id,blocked_id' });
      if (error) throw error;
    },

    async unblockUser(userId: string): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('user_blocks').delete().eq('blocker_id', uid).eq('blocked_id', userId);
      if (error) throw error;
    },

    /** User ids the signed-in user has blocked. Used to hide them from lists. */
    async blockedIds(): Promise<string[]> {
      const uid = await requireUid();
      const { data, error } = await getSupabase()
        .from('user_blocks').select('blocked_id').eq('blocker_id', uid);
      if (error) throw error;
      return (data ?? []).map((r) => r.blocked_id as string);
    },

    /** The people you've blocked, with names, for the unblock screen. */
    async listBlocked(): Promise<ChatParticipant[]> {
      const ids = await this.blockedIds();
      if (!ids.length) return [];
      const map = await api.chat.listParticipants(ids);
      return ids.map((id) => map[id]).filter(Boolean) as ChatParticipant[];
    },

    /** True if either party has blocked the other — the composer disables on this. */
    async isBlocked(otherUserId: string): Promise<boolean> {
      const { data, error } = await getSupabase().rpc('is_blocked_between', {
        a: await requireUid(), b: otherUserId,
      });
      if (error) throw error;
      return !!data;
    },
  },

  // --- course catalog ---
  //
  // The real UA catalog (`courses`, ~3.9k rows, seeded out of band — see migrations 0020/0023).
  // Course codes used to be free-typed everywhere, so "MATH125", "Math 125" and "MTH 125" were
  // all storable and none of them matched each other or a tutor's list. These reads let the UI
  // offer the actual catalog and store a code that provably exists.
  courses: {
    /**
     * Catalog search for a picker. Courses whose CODE starts with the query come first
     * ("math" → MATH 005, MATH 100…; "math 2" → the 200-level ones), then matches on title or
     * subject name fill the rest, so "calc" and "mathematics" still find the right rows
     * (courseSearch.ts). Capped because a bare prefix like "M" matches hundreds.
     */
    async search(query: string, limit = 25): Promise<CatalogCourse[]> {
      const q = normalizeCourseQuery(query);
      const active = () => getSupabase().from('courses').select(CATALOG_SELECT).eq('is_active', true);
      if (!q) {
        const { data, error } = await active().order('course_code').limit(limit);
        if (error) throw error;
        return (data ?? []).map(mapCatalogCourse);
      }
      const byCode = await active().ilike('course_code', `${q}%`).order('course_code').limit(limit);
      if (byCode.error) throw byCode.error;
      const first = (byCode.data ?? []).map(mapCatalogCourse);
      if (first.length >= limit) return first;
      const anywhere = await active()
        .or(`course_code.ilike.%${q}%,course_title.ilike.%${q}%,subject_name.ilike.%${q}%`)
        .order('course_code')
        .limit(limit);
      if (anywhere.error) throw anywhere.error;
      return rankCourseMatches(first, (anywhere.data ?? []).map(mapCatalogCourse), limit);
    },

    /**
     * Distinct subject names, for the Major picker. Small and static enough to fetch once and
     * filter on the client.
     *
     * Reads the `course_subjects` VIEW (0025), not `courses`: de-duplicating ~3.9k course rows
     * client-side hits PostgREST's 1000-row cap, which on production silently returned 31 of
     * 132 subjects with no error. The view is one row per subject, so there's nothing to cap.
     */
    async listSubjects(): Promise<string[]> {
      const { data, error } = await getSupabase()
        .from('course_subjects')
        .select('subject_name')
        .order('subject_name');
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => r.subject_name).filter(Boolean))] as string[];
    },

    /** Look up exact codes — used to render a saved course with its real title. */
    async byCodes(codes: string[]): Promise<Record<string, CatalogCourse>> {
      const list = [...new Set(codes.map((c) => c.trim().toUpperCase()))].filter(Boolean);
      if (!list.length) return {};
      const { data, error } = await getSupabase()
        .from('courses')
        .select(CATALOG_SELECT)
        .in('course_code', list);
      if (error) throw error;
      const out: Record<string, CatalogCourse> = {};
      for (const row of data ?? []) out[row.course_code] = mapCatalogCourse(row);
      return out;
    },
  },

  // --- reviews ---
  reviews: {
    /** Approved reviews for a tutor, with reviewer name + course (RLS hides unapproved). */
    async listForTutor(tutorId: string): Promise<ReviewSummary[]> {
      const { data, error } = await getSupabase()
        .from('reviews')
        .select('id, rating, comment, created_at, reviewer:users!reviewer_id(first_name, last_name), booking:bookings!booking_id(subject)')
        .eq('subject_user_id', tutorId)
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false });
      if (error) throw error;
      /* eslint-disable @typescript-eslint/no-explicit-any */
      return (data ?? []).map((r: any): ReviewSummary => {
        const first = r.reviewer?.first_name ?? '';
        const lastInitial = r.reviewer?.last_name ? `${r.reviewer.last_name[0]}.` : '';
        return {
          id: r.id,
          rating: r.rating,
          comment: r.comment ?? null,
          reviewerName: [first, lastInitial].filter(Boolean).join(' '),
          course: r.booking?.subject ?? '',
          createdAt: r.created_at,
        };
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */
    },

    /** Submit a rating/review for a completed booking (submit-rating). */
    submit(input: SubmitRatingInput): Promise<{ reviewId: string }> {
      return invokeFn('submit-rating', input as unknown as Record<string, unknown>);
    },
  },

  // --- analytics (append-only event log) ---
  analytics: {
    /**
     * Append an analytics event for the signed-in user. Fire-and-forget by contract:
     * it never throws, so callers invoke it without awaiting and it can never block or
     * fail the action that produced it (e.g. a role switch). No session / offline / RLS
     * denial → silent no-op. Persisted to `analytics_events` (0012).
     */
    async track(event: string, props: Record<string, unknown> = {}): Promise<void> {
      try {
        const uid = await requireUid();
        await getSupabase().from('analytics_events').insert({ user_id: uid, event, props });
      } catch {
        /* analytics must never surface to the user */
      }
    },
  },

  // --- notifications (in-app feed; rows created by DB triggers — 0014) ---
  notifications: {
    /** The signed-in user's notifications, newest first (capped). RLS: own only. */
    async list(): Promise<Notification[]> {
      const uid = await requireUid();
      const { data, error } = await getSupabase()
        .from('notifications')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map(mapNotification);
    },

    /** Count of unread notifications — drives the bell badge. */
    async unreadCount(): Promise<number> {
      const uid = await requireUid();
      const { count, error } = await getSupabase()
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },

    /** Mark all of the user's unread notifications read (opening the center). */
    async markAllRead(): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', uid)
        .is('read_at', null);
      if (error) throw error;
    },

    /**
     * Register this device's Expo push token, so notifications reach the phone (0045). Safe
     * to repeat. A token another account registered on the same phone is taken over
     * server-side — a device has one account.
     */
    async registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('push_tokens')
        .upsert({ user_id: uid, token, platform }, { onConflict: 'user_id,token' });
      if (error) throw error;
    },

    /** Stop sending this account's notifications to a device (sign-out). RLS: own only. */
    async unregisterPushToken(token: string): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase().from('push_tokens').delete().eq('user_id', uid).eq('token', token);
      if (error) throw error;
    },
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any -- untyped Supabase row, like the mappers above */
function mapNotification(row: any): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body ?? '',
    data: row.data ?? {},
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
