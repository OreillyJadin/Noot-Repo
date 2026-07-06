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
  Booking,
  Conversation,
  ConversationSummary,
  Message,
  ReviewSummary,
  TutorCourse,
  TutorSummary,
  User,
} from '../models';

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
    studentId: row.student_id,
    tutorId: row.tutor_id,
    createdAt: row.created_at,
  };
}

function mapMessage(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    content: row.content,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
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
    /** Approved tutors, optionally filtered to those who teach `course` (b1, student_home). */
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
      let q = sb.from('users').select(TUTOR_SELECT).eq('tutor_profiles.approval_status', 'approved');
      if (ids) q = q.in('id', ids);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapTutorSummary);
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

  /** B4 → held PaymentIntent via the `create-payment-intent` Edge Function. */
  createPaymentIntent(
    amountCents: number,
  ): Promise<{ clientSecret: string; paymentIntentId: string; simulated: boolean }> {
    return invokeFn('create-payment-intent', { amountCents });
  },

  // --- bookings (trust-sensitive writes → Edge Functions, see ARCHITECTURE.md §5) ---
  bookings: {
    /** Capture the held payment and create the booking + conversation (confirm-booking). */
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

    async listMessages(conversationId: string): Promise<Message[]> {
      const { data, error } = await getSupabase()
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapMessage);
    },

    async sendMessage(conversationId: string, content: string): Promise<Message> {
      const uid = await requireUid();
      const { data, error } = await getSupabase()
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: uid, content })
        .select('*')
        .single();
      if (error) throw error;
      return mapMessage(data);
    },

    /** Live new-message subscription. Returns an unsubscribe fn. */
    subscribe(conversationId: string, onMessage: (m: Message) => void): () => void {
      const sb = getSupabase();
      const channel = sb
        .channel(`messages:${conversationId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
          (payload) => onMessage(mapMessage(payload.new)),
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
};
