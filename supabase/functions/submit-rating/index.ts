// Edge Function: submit-rating.
// A party to a completed booking (student or tutor) rates the OTHER party.
// Two-sided ratings: reviews UNIQUE(booking_id, reviewer_id) — one review per
// reviewer per booking, so a repeat submission upserts the existing row.
//
// Double-blind: reviews land as approval_status='pending' and are NOT public
// until approved. TODO(moderation): a later function handles moderation and the
// double-blind reveal (both sides revealed together / after a window).
//
// Money movement (Stripe charge/refund/payout) is OUT OF SCOPE here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!); // service role: bypasses RLS
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    const body = await req.json().catch(() => ({}));

    const bookingId: string | undefined = body?.bookingId;
    const rating: number | undefined = body?.rating;
    const comment: string | null = body?.comment ?? null;
    const happened: boolean = body?.happened ?? true;

    if (!bookingId) return Response.json({ error: 'bookingId is required' }, { status: 400, headers: cors });
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return Response.json({ error: 'rating must be an integer 1-5' }, { status: 400, headers: cors });
    }

    // Load the booking.
    const { data: booking, error: bookingErr } = await db
      .from('bookings')
      .select('id, student_id, tutor_id')
      .eq('id', bookingId)
      .single();
    if (bookingErr || !booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404, headers: cors });
    }

    // Verify the caller is a party to the booking.
    const isStudent = booking.student_id === user.id;
    const isTutor = booking.tutor_id === user.id;
    if (!isStudent && !isTutor) {
      return Response.json({ error: 'Not a party to this booking' }, { status: 403, headers: cors });
    }

    // The subject is the OTHER party.
    const subjectUserId = isStudent ? booking.tutor_id : booking.student_id;

    if (happened === false) {
      // TODO(dispute): pause payout for this booking + open a dispute record so
      // an admin can review the "did not happen" claim before any money moves.
    }

    // Upsert on the UNIQUE(booking_id, reviewer_id) constraint: a resubmission by
    // the same reviewer updates their existing review rather than erroring.
    const { data: review, error: upsertErr } = await db
      .from('reviews')
      .upsert(
        {
          booking_id: bookingId,
          reviewer_id: user.id,
          subject_user_id: subjectUserId,
          rating,
          comment,
          approval_status: 'pending', // TODO(moderation): double-blind reveal in a later function
        },
        { onConflict: 'booking_id,reviewer_id' },
      )
      .select('id')
      .single();

    if (upsertErr || !review) {
      return Response.json({ error: upsertErr ? upsertErr.message : 'Failed to save review' }, { status: 400, headers: cors });
    }

    return Response.json({ reviewId: review.id }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
