import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { applyRoomAccess, videoJoinUrl, videoWindow } from '../_shared/daily.ts';
import { effectiveDurationMinutes } from '../_shared/extensions.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
serveWithErrorReporting('join-video-session', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const inactive = await requireActiveUser(db, user.id, cors);
    if (inactive) return inactive;
    const { bookingId, device } = await req.json().catch(() => ({}));
    if (device !== undefined && device !== 'phone' && device !== 'computer') {
      return Response.json({ error: "device must be 'phone' or 'computer'" }, { status: 400, headers: cors });
    }
    if (typeof bookingId !== 'string' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(bookingId)) {
      return Response.json({ error: 'A valid bookingId is required' }, { status: 400, headers: cors });
    }
    const { data: b, error } = await db.from('bookings').select('*').eq('id', bookingId).maybeSingle();
    if (error) throw error;
    if (!b || (b.student_id !== user.id && b.tutor_id !== user.id)) {
      return Response.json({ error: 'Only session participants can join' }, { status: 403, headers: cors });
    }
    if (b.extends_booking_id) {
      return Response.json({ error: 'Join from the main session' }, { status: 400, headers: cors });
    }
    const effectiveDuration = await effectiveDurationMinutes(db, b.id, Number(b.duration_minutes));
    const window = videoWindow(b.scheduled_at, effectiveDuration);
    const tokenWindow = videoWindow(b.scheduled_at, Number(b.duration_minutes) + 60);
    const now = Date.now() / 1000;
    if (b.session_type !== 'video' || b.status !== 'confirmed' || !b.daily_room_name || !b.meeting_link ||
      !b.video_link_sent_at || b.daily_room_deleted_at || now < window.nbf || now > window.exp) {
      return Response.json({ error: "Your video link isn't ready yet" }, { status: 409, headers: cors });
    }
    const { data: profile, error: profileError } = await db.from('users').select('first_name').eq('id', user.id).single();
    if (profileError) throw profileError;
    try {
      await applyRoomAccess(b.daily_room_name);
    } catch (error) {
      console.error('join-video-session: could not apply room access', String(error));
    }
    const joinUrl = await videoJoinUrl(
      b.meeting_link,
      b.daily_room_name,
      user.id,
      profile.first_name || 'Noot participant',
      tokenWindow.exp,
      device,
    );
    return Response.json({ url: joinUrl }, { headers: cors });
  } catch {
    return Response.json({ error: 'Unable to open your video session. Please try again.' }, { status: 503, headers: cors });
  }
});
