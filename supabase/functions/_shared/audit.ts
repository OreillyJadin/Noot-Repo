import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Append one row to public.admin_actions (0060). Call with the service-role client AFTER
// the admin action succeeded. Never throws: the action already happened — a missing audit
// row must not turn a successful suspension or approval into a client-visible failure.
export async function logAdminAction(
  db: SupabaseClient,
  entry: {
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const { error } = await db.from('admin_actions').insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      details: entry.details ?? {},
    });
    if (error) console.error('admin audit log failed', entry.action, error.message);
  } catch (e) {
    console.error('admin audit log failed', entry.action, e instanceof Error ? e.message : String(e));
  }
}
