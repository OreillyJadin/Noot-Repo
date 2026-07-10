// Edge Function: resolve-participants.
// Returns the display names of the people the caller shares a booking with, as
// { [userId]: { firstName, lastName } }. This exists because users_select RLS is
// `self OR approved-tutor OR admin` (migration 0002), so a tutor cannot read a
// STUDENT's row directly. Rather than weaken RLS, we resolve names here with the
// service role — but ONLY for genuine booking counterparties of the caller, so the
// privacy boundary is preserved (you can only learn the name of someone you have a
// booking with).
//
// Deno runtime. Self-contained (no _shared import), mirrors cancel-booking.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    // service role: bypasses RLS
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Every booking the caller is a party to → collect the OTHER party's id.
    const { data: bookings, error: bErr } = await db
      .from('bookings')
      .select('student_id, tutor_id')
      .or(`student_id.eq.${user.id},tutor_id.eq.${user.id}`);
    if (bErr) return Response.json({ error: bErr.message }, { status: 400, headers: cors });

    const counterpartyIds = new Set<string>();
    for (const b of bookings ?? []) {
      const other = b.student_id === user.id ? b.tutor_id : b.student_id;
      if (other && other !== user.id) counterpartyIds.add(other);
    }

    const names: Record<string, { firstName: string; lastName: string }> = {};
    if (counterpartyIds.size > 0) {
      const { data: users, error: uErr } = await db
        .from('users')
        .select('id, first_name, last_name')
        .in('id', [...counterpartyIds]);
      if (uErr) return Response.json({ error: uErr.message }, { status: 400, headers: cors });
      for (const u of users ?? []) {
        names[u.id] = { firstName: u.first_name ?? '', lastName: u.last_name ?? '' };
      }
    }

    return Response.json(names, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
