import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function clearTutorDiscovery(db: SupabaseClient, tutorId: string) {
  const { error } = await db.from('tutor_profiles')
    .update({ approval_status: 'pending', submitted_at: null })
    .eq('user_id', tutorId);
  if (error) throw error;

  const results = await Promise.all([
    db.from('tutor_courses').delete().eq('tutor_id', tutorId),
    db.from('tutor_availability').delete().eq('tutor_id', tutorId),
    db.from('availability_overrides').delete().eq('tutor_id', tutorId),
  ]);
  for (const result of results) {
    if (result.error) throw result.error;
  }
}
