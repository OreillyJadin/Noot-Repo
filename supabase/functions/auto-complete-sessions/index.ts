import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { completeBooking } from '../_shared/completeBooking.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

serveWithErrorReporting('auto-complete-sessions', async (req: Request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey || req.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, serviceRoleKey);
  const now = new Date().toISOString();
  const ended48HoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const created6DaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const { data: bookings, error: loadError } = await db
    .from('bookings')
    .select('id, tutor_id, status, scheduled_at, scheduled_end, duration_minutes, stripe_payment_intent_id, tutor_payout_amount, price, created_at')
    .eq('status', 'confirmed')
    .eq('dispute_status', 'none')
    .is('no_show_party', null)
    .lte('scheduled_end', now)
    .or(`scheduled_end.lte.${ended48HoursAgo},created_at.lte.${created6DaysAgo}`)
    .order('scheduled_end', { ascending: true })
    .limit(25);
  if (loadError) {
    console.error('auto-complete-sessions: booking lookup failed');
    return Response.json({ error: 'Could not load sessions' }, { status: 500 });
  }

  let completed = 0;
  let holdExpired = 0;
  let failed = 0;
  for (const booking of bookings ?? []) {
    try {
      const result = await completeBooking(db, url, booking);
      if (result.body.holdExpired === true) {
        holdExpired += 1;
      } else if (result.status === 200 && result.body.status === 'completed') {
        completed += 1;
      } else {
        failed += 1;
        console.error('auto-complete-sessions: booking was not completed', booking.id);
      }
    } catch {
      failed += 1;
      console.error('auto-complete-sessions: booking failed', booking.id);
    }
  }

  return Response.json({ completed, holdExpired, failed });
});
