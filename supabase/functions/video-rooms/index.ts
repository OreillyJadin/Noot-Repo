import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deleteVideoRoom, ensureVideoRoom, newRoomName } from '../_shared/daily.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

serveWithErrorReporting('video-rooms', async (req: Request) => {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || req.headers.get('Authorization') !== `Bearer ${key}`) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, key);
  const now = Date.now();
  let posted = 0;
  let deleted = 0;
  let failed = 0;
  const { data: bookings, error } = await db.from('bookings')
    .select('id, scheduled_at, duration_minutes, daily_room_name, meeting_link')
    .eq('session_type', 'video').eq('status', 'confirmed').is('video_link_sent_at', null)
    .is('extends_booking_id', null)
    .is('daily_room_deleted_at', null)
    .or('stripe_payment_intent_id.not.is.null,and(price.eq.0,student_fee.eq.0)')
    .lte('scheduled_at', new Date(now + 3_600_000).toISOString())
    .gt('scheduled_end', new Date(now).toISOString()).order('scheduled_at').limit(100);
  if (error) return Response.json({ error: 'Could not load video sessions' }, { status: 500 });
  for (const booking of bookings ?? []) {
    try {
      let name = booking.daily_room_name as string | null;
      if (!name) {
        const { data: reserved, error } = await db.from('bookings').update({ daily_room_name: newRoomName() })
          .eq('id', booking.id).eq('status', 'confirmed').eq('scheduled_at', booking.scheduled_at)
          .is('daily_room_name', null).select('daily_room_name').maybeSingle();
        if (error) throw error;
        if (!reserved) continue;
        name = reserved.daily_room_name as string;
      }
      const roomUrl = await ensureVideoRoom(name, booking.scheduled_at, booking.duration_minutes, !!booking.meeting_link);
      const { data: claimed, error } = await db.rpc('publish_video_room', {
        p_booking: booking.id, p_scheduled_at: booking.scheduled_at, p_room: name, p_url: roomUrl,
      });
      if (error) throw error;
      if (claimed) posted++;
    } catch { failed++; console.error('video-rooms: room publication failed', booking.id); }
  }
  const { data: terminal, error: cleanupError } = await db.from('bookings').select('id, daily_room_name')
    .eq('session_type', 'video').in('status', ['cancelled', 'completed', 'no_show'])
    .is('extends_booking_id', null)
    .not('daily_room_name', 'is', null).is('daily_room_deleted_at', null).limit(100);
  if (cleanupError) return Response.json({ error: 'Could not load video cleanup' }, { status: 500 });
  for (const booking of terminal ?? []) {
    try {
      await deleteVideoRoom(booking.daily_room_name);
      const { error } = await db.from('bookings').update({ daily_room_deleted_at: new Date().toISOString() })
        .eq('id', booking.id).is('daily_room_deleted_at', null);
      if (error) throw error;
      deleted++;
    } catch { failed++; console.error('video-rooms: room cleanup failed', booking.id); }
  }
  return Response.json({ posted, deleted, failed });
});
