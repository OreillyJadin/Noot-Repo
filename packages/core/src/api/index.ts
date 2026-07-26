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
import type {
  AmbassadorProfile,
  Booking,
  ChatParticipant,
  Conversation,
  ConversationSummary,
  Message,
  MessageAttachment,
  OutgoingAttachment,
  Notification,
  ReviewSummary,
  TutorAvailability,
  TutorCourse,
  TutorSummary,
  User,
} from '../models';

/** A referral row for the ambassador dashboard (from the list-referrals Edge Function). */
export interface AmbassadorReferralRow {
  referralId: string;
  name: string;
  referredRole: 'student' | 'tutor';
  status: 'signed_up' | 'bonus_pending' | 'bonus_paid';
  bonusAmount: number;
  createdAt: string;
}
export interface AmbassadorReferrals {
  referrals: AmbassadorReferralRow[];
  totals: { referrals: number; bonusesEarned: number; totalEarned: number };
}

/** A user row for the admin user-management list. */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: string;
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
  tutor_profiles!user_id!inner ( bio, subjects, hourly_rate, rating_avg, total_sessions, verified_grade, approval_status ),
  tutor_courses ( id, tutor_id, course_code, grade, hourly_rate, sessions, created_at )
`;

/** Invoke a Supabase Edge Function (server-only logic — see ARCHITECTURE.md §5). */
async function invokeFn<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T>(name, { body });
  if (error) throw error;
  return data as T;
}

// ---------------------------------------------------------------------------
// write-method inputs (Edge Function bodies)
// ---------------------------------------------------------------------------

export interface ConfirmBookingInput {
  tutorId: string;
  subject: string;
  scheduledAt: string;
  durationMinutes: number;
  sessionType: 'video' | 'in_person';
  location?: string;
  meetingLink?: string;
  price: number;
  message?: string;
  paymentIntentId?: string;
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
    },

    /** Set the student's enrolled course codes (edit_courses). */
    async setCourses(courses: string[]): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase().from('users').update({ courses }).eq('id', uid);
      if (error) throw error;
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
    },

    /** Add a role the user can hold (e.g. "Become a tutor/ambassador"). RLS blocks 'admin'. */
    async addRole(role: 'tutor' | 'ambassador'): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('user_roles')
        .upsert({ user_id: uid, role }, { onConflict: 'user_id,role' });
      if (error) throw error;
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
      return url;
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
    },

    /** Update just the tutor's base hourly rate (edit_rates). */
    async updateRates(hourlyRate: number): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('tutor_profiles')
        .update({ hourly_rate: hourlyRate })
        .eq('user_id', uid);
      if (error) throw error;
    },

    /**
     * Replace the tutor's per-course list (edit_courses for tutors). Not transactional:
     * clears then re-inserts. Fine at launch scale; move to an RPC if it grows.
     */
    async setTutorCourses(
      courses: { courseCode: string; grade?: string | null; hourlyRate?: number; sessions?: number }[],
    ): Promise<void> {
      const uid = await requireUid();
      const sb = getSupabase();
      const { error: delErr } = await sb.from('tutor_courses').delete().eq('tutor_id', uid);
      if (delErr) throw delErr;
      if (courses.length === 0) return;
      const rows = courses.map((c) => ({
        tutor_id: uid,
        course_code: c.courseCode,
        grade: c.grade ?? null,
        hourly_rate: c.hourlyRate ?? 0,
        sessions: c.sessions ?? 0,
      }));
      const { error } = await sb.from('tutor_courses').insert(rows);
      if (error) throw error;
    },

    /** Replace the tutor's recurring weekly availability windows (edit_availability). */
    async updateAvailability(
      weekly: { dayOfWeek: number; startTime: string; endTime: string }[],
    ): Promise<void> {
      const uid = await requireUid();
      const sb = getSupabase();
      const { error: delErr } = await sb.from('tutor_availability').delete().eq('tutor_id', uid);
      if (delErr) throw delErr;
      if (weekly.length === 0) return;
      const rows = weekly.map((w) => ({
        tutor_id: uid,
        day_of_week: w.dayOfWeek,
        start_time: w.startTime,
        end_time: w.endTime,
      }));
      const { error } = await sb.from('tutor_availability').insert(rows);
      if (error) throw error;
    },
  },

  // --- tutors (search / browse / saved) ---
  tutors: {
    /**
     * Approved tutors. Narrow by an exact `course` (b1), or by `categoryPrefixes` —
     * department code prefixes like ['MGT','FI'] — so the browse tabs (Business/STEM/…)
     * actually filter instead of all showing the same list. Prefixes are matched
     * against tutor_courses.course_code with ILIKE `<prefix>*`; they're app-provided
     * (a fixed category map), not user free-text. Omit both for "everyone".
     */
    async search(opts: { course?: string; categoryPrefixes?: string[] } = {}): Promise<TutorSummary[]> {
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
      } else if (opts.categoryPrefixes && opts.categoryPrefixes.length > 0) {
        // Keep only clean alnum prefixes, then OR together course_code.ilike.<p>*
        const orExpr = opts.categoryPrefixes
          .filter((p) => /^[A-Za-z]{1,6}$/.test(p))
          .map((p) => `course_code.ilike.${p}*`)
          .join(',');
        if (orExpr) {
          const { data, error } = await sb.from('tutor_courses').select('tutor_id').or(orExpr);
          if (error) throw error;
          ids = [...new Set((data ?? []).map((r: { tutor_id: string }) => r.tutor_id))];
          if (ids.length === 0) return [];
        }
      }
      let q = sb.from('users').select(TUTOR_SELECT).eq('tutor_profiles.approval_status', 'approved');
      if (ids) q = q.in('id', ids);
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

    /** Referred users + bonus pipeline status + running totals (list-referrals Edge Function). */
    listReferrals(): Promise<AmbassadorReferrals> {
      return invokeFn('list-referrals');
    },
  },

  // --- admin (RLS is_admin() already permits these reads; writes go through Edge Functions) ---
  admin: {
    /** Tutors awaiting approval (oldest first). Admin-only via RLS. */
    async listPendingTutors(): Promise<PendingTutor[]> {
      const sb = getSupabase();
      const { data: profs, error } = await sb
        .from('tutor_profiles')
        .select('user_id, bio, subjects, hourly_rate, transcript_url, verified_grade, created_at')
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: true });
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
            submittedAt: r.created_at,
          };
        }),
      );
    },

    /** Approve or reject a tutor (approve-tutor Edge Function; re-verifies admin server-side). */
    approveTutor(tutorUserId: string, decision: 'approved' | 'rejected'): Promise<{ ok: true; approvalStatus: string }> {
      return invokeFn('approve-tutor', { tutorUserId, decision });
    },

    /** All accounts with their roles + status (admin RLS). */
    async listUsers(): Promise<AdminUser[]> {
      const { data, error } = await getSupabase()
        .from('users')
        .select('id, first_name, last_name, email, status, user_roles(role)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((u: any) => ({
        id: u.id,
        name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—',
        email: u.email,
        roles: (u.user_roles ?? []).map((r: any) => r.role),
        status: u.status,
      }));
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
        : { data: [] as any[] };
      const nameById = new Map((users ?? []).map((u: any) => [u.id, `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || '—']));
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
   * params the client PaymentSheet needs; `simulated` is true when no Stripe key is set
   * (dev/web) so callers can skip presenting the sheet. Capture happens in complete-session.
   */
  createPaymentIntent(
    amountCents: number,
  ): Promise<{
    paymentIntentClientSecret: string;
    ephemeralKeySecret: string | null;
    customerId: string | null;
    paymentIntentId: string;
    simulated: boolean;
  }> {
    return invokeFn('create-payment-intent', { amountCents });
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
      const otherIds = [...new Set(rows.map((c: any) => (c.student_id === uid ? c.tutor_id : c.student_id)))];
      const { data: users, error: uErr } = await sb
        .from('users')
        .select('id, first_name, last_name')
        .in('id', otherIds);
      if (uErr) throw uErr;
      const byId = new Map((users ?? []).map((u: any) => [u.id, u]));

      // last message per conversation (fetch recent, pick newest per convo)
      const convoIds = rows.map((c: any) => c.id);
      const { data: msgs, error: mErr } = await sb
        .from('messages')
        .select('*')
        .in('conversation_id', convoIds)
        .order('created_at', { ascending: false });
      if (mErr) throw mErr;
      const lastByConvo = new Map<string, any>();
      for (const m of msgs ?? []) {
        if (!lastByConvo.has(m.conversation_id)) lastByConvo.set(m.conversation_id, m);
      }

      return rows.map((c: any): ConversationSummary => {
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

    /** Register an Expo push token for this device (upsert on user_id,token). */
    async registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
      const uid = await requireUid();
      const { error } = await getSupabase()
        .from('push_tokens')
        .upsert({ user_id: uid, token, platform }, { onConflict: 'user_id,token' });
      if (error) throw error;
    },
  },
};

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
