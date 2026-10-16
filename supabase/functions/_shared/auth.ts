import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * 403 unless public.is_admin() is true for the caller's own JWT. The admin rule (role +
 * MFA, migration 0059) lives only in SQL, so call it with the caller's client, never the service role.
 */
export async function requireAdmin(
  userClient: SupabaseClient,
  headers: Record<string, string>,
): Promise<Response | null> {
  const { data, error } = await userClient.rpc('is_admin');
  if (error || data !== true) return Response.json({ error: 'Forbidden' }, { status: 403, headers });
  return null;
}

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
