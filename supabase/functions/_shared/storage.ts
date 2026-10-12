import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Remove every object under a user-owned folder in `bucket`. Best-effort. */
export async function purgeFolder(db: SupabaseClient, bucket: string, folder: string) {
  try {
    const { data } = await db.storage.from(bucket).list(folder);
    const paths = (data ?? []).map((o) => `${folder}/${o.name}`);
    if (paths.length) await db.storage.from(bucket).remove(paths);
  } catch {
    /* a missing folder is not a failure */
  }
}
