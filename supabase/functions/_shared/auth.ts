import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function requireActiveUser(
  db: SupabaseClient,
  userId: string,
  headers: Record<string, string>,
): Promise<Response | null> {
  const { data, error } = await db.from('users').select('status').eq('id', userId).maybeSingle();
  if (error || !data || data.status !== 'active') {
    return Response.json({ error: 'Account is not active' }, { status: 403, headers });
  }
  return null;
}
