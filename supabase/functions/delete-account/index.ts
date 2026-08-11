// Edge Function: delete-account.
//
// App Store Guideline 5.1.1(v) — the user must be able to delete their account from inside
// the app. This is that route. It acts ONLY on the caller's own account: the target is taken
// from the verified JWT and never from the request body, so there is no id to tamper with.
//
// "Delete" here means: revoke the identity, de-identify the record.
//   • auth.users row is deleted        -> they can never sign in again
//   • public.users row is kept, stripped of every identifying field
//   • bookings and payouts survive, joined to an anonymous row
//
// The retention is deliberate and is disclosed in the privacy policy: we must keep financial
// records for tax, accounting and chargeback handling. Migration 0026 dropped the
// users -> auth.users FK so the two can happen independently; before that, deleting the auth
// identity cascaded through users -> bookings and destroyed the payment history.
//
// Storage and messages are cleared explicitly — SQL cascades don't reach object storage.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Remove every object under a user-owned folder in `bucket`. Best-effort. */
async function purgeFolder(db: ReturnType<typeof createClient>, bucket: string, folder: string) {
  try {
    const { data } = await db.storage.from(bucket).list(folder);
    const paths = (data ?? []).map((o) => `${folder}/${o.name}`);
    if (paths.length) await db.storage.from(bucket).remove(paths);
  } catch {
    /* a missing folder is not a failure */
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const uid = user.id;
    const db = createClient(url, service);

    // Refuse if they still owe or are owed money on a live session — deleting mid-booking
    // would strand the counterparty with a session they can't complete or be paid for.
    const { data: live } = await db
      .from('bookings')
      .select('id')
      .in('status', ['pending', 'confirmed'])
      .or(`student_id.eq.${uid},tutor_id.eq.${uid}`)
      .limit(1);
    if (live?.length) {
      return Response.json(
        { error: 'You have an upcoming session. Cancel it before deleting your account.' },
        { status: 409, headers: cors },
      );
    }

    // 1. Files. Avatars and transcripts are keyed {uid}/…; chat attachments are keyed by
    //    conversation, so they're removed per message below.
    await purgeFolder(db, 'avatars', uid);
    await purgeFolder(db, 'transcripts', uid);

    const { data: sent } = await db.from('messages').select('id').eq('sender_id', uid);
    const messageIds = (sent ?? []).map((m) => m.id);
    if (messageIds.length) {
      const { data: atts } = await db
        .from('message_attachments')
        .select('storage_path')
        .in('message_id', messageIds);
      const paths = (atts ?? []).map((a) => a.storage_path).filter(Boolean);
      if (paths.length) {
        try {
          await db.storage.from('chat-attachments').remove(paths);
        } catch {
          /* orphaned objects are unreachable anyway once the rows go */
        }
      }
      // Deletes the attachment rows too (message_attachments cascades from messages).
      await db.from('messages').delete().eq('sender_id', uid);
    }

    // 2. Personal data that isn't financial. tutor_profiles carries a bio and a transcript
    //    pointer; push tokens would keep notifying a deleted account.
    await db.from('push_tokens').delete().eq('user_id', uid);
    await db.from('saved_tutors').delete().or(`student_id.eq.${uid},tutor_id.eq.${uid}`);
    await db.from('tutor_profiles').update({ bio: '', transcript_url: null }).eq('user_id', uid);

    // 3. De-identify the retained row. The email must stay unique and NOT NULL, and .invalid
    //    is a reserved TLD so the address can never be routed or re-registered.
    const { error: anonErr } = await db
      .from('users')
      .update({
        email: `deleted+${uid}@removed.invalid`,
        first_name: 'Deleted',
        last_name: 'account',
        year: null,
        major: null,
        gender: null,
        courses: [],
        avatar_url: null,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', uid);
    if (anonErr) return Response.json({ error: anonErr.message }, { status: 400, headers: cors });

    // 4. Revoke the identity. Last, and only after de-identification succeeded — if this
    //    ordering were reversed a failure would leave a signed-in account with its data gone.
    //    Safe to cascade-delete now only because 0026 detached users from auth.users.
    const { error: authErr } = await db.auth.admin.deleteUser(uid);
    if (authErr) return Response.json({ error: authErr.message }, { status: 400, headers: cors });

    return Response.json({ ok: true }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
