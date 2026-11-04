import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { autoCompleteBookings } from '../_shared/autoCompleteBookings.ts';
import { serveWithErrorReporting } from '../_shared/observability.ts';

serveWithErrorReporting('auto-complete-sessions', async (req: Request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey || req.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) {
    return Response.json({ error: 'Not authorized' }, { status: 401 });
  }
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, serviceRoleKey);
  const result = await autoCompleteBookings(db, url);
  return Response.json(result.body, { status: result.status });
});
