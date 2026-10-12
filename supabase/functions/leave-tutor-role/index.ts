import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireActiveUser } from '../_shared/auth.ts';
import { purgeFolder } from '../_shared/storage.ts';

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
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const inactiveResponse = await requireActiveUser(db, user.id, cors);
    if (inactiveResponse) return inactiveResponse;

    const [{ data: role, error: roleErr }, { data: profile, error: profileErr }] = await Promise.all([
      db.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'tutor').maybeSingle(),
      db.from('tutor_profiles').select('approval_status, submitted_at').eq('user_id', user.id).maybeSingle(),
    ]);
    if (roleErr) throw roleErr;
    if (profileErr) throw profileErr;
    const hasTutorRole = !!role;
    const hasApplication = !!profile && (
      profile.submitted_at !== null || profile.approval_status !== 'pending'
    );
    if (!hasTutorRole && !hasApplication) {
      return Response.json({ error: "You don't have a tutor profile." }, { status: 400, headers: cors });
    }
    if (!profile) {
      return Response.json({ error: "You don't have a tutor profile." }, { status: 400, headers: cors });
    }

    const { data: live, error: liveErr } = await db
      .from('bookings')
      .select('id')
      .eq('tutor_id', user.id)
      .in('status', ['pending', 'confirmed'])
      .limit(1);
    if (liveErr) throw liveErr;
    if (live?.length) {
      return Response.json(
        { error: 'You have an upcoming session as a tutor. Cancel it before deleting your tutor profile.' },
        { status: 409, headers: cors },
      );
    }

    const { error: interviewErr } = await db
      .from('tutor_interviews')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('tutor_id', user.id)
      .is('cancelled_at', null);
    if (interviewErr) throw interviewErr;

    const { error: activeRoleErr } = await db
      .from('users')
      .update({ active_role: 'student' })
      .eq('id', user.id)
      .eq('active_role', 'tutor');
    if (activeRoleErr) throw activeRoleErr;

    const { error: deleteRoleErr } = await db
      .from('user_roles')
      .delete()
      .eq('user_id', user.id)
      .eq('role', 'tutor');
    if (deleteRoleErr) throw deleteRoleErr;

    const { data: updated, error: profileErrUpdate } = await db
      .from('tutor_profiles')
      .update({
        approval_status: 'pending',
        submitted_at: null,
        reviewed_by: null,
        reviewed_at: null,
        grades_verified_at: null,
        grades_verified_by: null,
        verified_grade: null,
        agreement_signed_at: null,
        agreement_signed_name: null,
        agreement_version: null,
        transcript_url: null,
        transcript_skipped: false,
      })
      .eq('user_id', user.id)
      .select('user_id')
      .maybeSingle();
    if (profileErrUpdate) throw profileErrUpdate;
    if (!updated) throw new Error('Tutor profile could not be reset.');

    await purgeFolder(db, 'transcripts', user.id);
    return Response.json({ ok: true }, { headers: cors });
  } catch (err) {
    console.error('leave-tutor-role failed', err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400, headers: cors });
  }
});
