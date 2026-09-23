// Edge Function: approve-tutor.
// ⚠️ SECURITY: the ONLY writer of tutor_profiles.approval_status (the 0009 trigger blocks
// every non-service-role write). Re-verifies the caller is an admin SERVER-SIDE — the app's
// client-side admin gate is UI-only and never trusted here. Sets approval_status +
// reviewed_by (the admin) + reviewed_at. Mirrors the submit-rating auth pattern.
//
// Two independent actions (tracker T6), either or both per call:
//   • decision: 'approved' | 'rejected' — the application. Only a SUBMITTED application
//     (submitted_at set, 0038) can be decided; a draft is still being filled in.
//   • verifyGrades: true — an admin checked the transcript. Sets grades_verified_at/_by,
//     which is the Verified badge and the 17.5% (vs 32.5%) fee. Needs an uploaded transcript.
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
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401, headers: cors });

    const db = createClient(url, service);

    // Re-verify admin server-side (do NOT trust the client).
    const { data: adminRow } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!adminRow) return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });

    const { tutorUserId, decision, verifyGrades } = await req.json().catch(() => ({}));
    const deciding = decision === 'approved' || decision === 'rejected';
    if (!tutorUserId || (decision !== undefined && !deciding) || (!deciding && verifyGrades !== true)) {
      return Response.json(
        { error: 'tutorUserId plus decision (approved|rejected) and/or verifyGrades: true required' },
        { status: 400, headers: cors },
      );
    }

    const { data: current } = await db
      .from('tutor_profiles')
      .select('submitted_at, transcript_url')
      .eq('user_id', tutorUserId)
      .maybeSingle();
    if (!current) return Response.json({ error: 'tutor profile not found' }, { status: 404, headers: cors });
    if (deciding && !current.submitted_at) {
      return Response.json({ error: 'This application has not been submitted yet' }, { status: 409, headers: cors });
    }
    if (verifyGrades === true && !current.transcript_url) {
      return Response.json({ error: 'No transcript uploaded to verify' }, { status: 409, headers: cors });
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (deciding) Object.assign(patch, { approval_status: decision, reviewed_by: user.id, reviewed_at: now });
    if (verifyGrades === true) Object.assign(patch, { grades_verified_at: now, grades_verified_by: user.id });

    const { data: updated, error } = await db
      .from('tutor_profiles')
      .update(patch)
      .eq('user_id', tutorUserId)
      .select('user_id, approval_status, grades_verified_at')
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 400, headers: cors });
    if (!updated) return Response.json({ error: 'tutor profile not found' }, { status: 404, headers: cors });
    if (!deciding) {
      return Response.json(
        { ok: true, approvalStatus: updated.approval_status, gradesVerified: updated.grades_verified_at != null },
        { headers: cors },
      );
    }

    // Grant (or withdraw) the tutor ROLE alongside the approval status. Until this existed,
    // nothing in the system ever wrote user_roles.tutor — the only accounts that had it were
    // seeded — so an approved tutor still held no tutor role. That broke two things:
    // enforce_active_role (0007) rejected active_role='tutor', so they could never stay in
    // tutor mode; and every client `roles.includes('tutor')` check read false forever.
    // user_roles is service-role-only from here, which is why it belongs in this function.
    if (decision === 'approved') {
      const { error: grantErr } = await db
        .from('user_roles')
        .upsert({ user_id: tutorUserId, role: 'tutor' }, { onConflict: 'user_id,role' });
      if (grantErr) return Response.json({ error: grantErr.message }, { status: 400, headers: cors });
    } else {
      // Rejected: withdraw the role so they can't act as a tutor, and reset active_role if
      // they were sitting in tutor mode — otherwise the 0007 trigger would block their next
      // profile write and they'd be stuck in a mode they no longer hold.
      const { error: revokeErr } = await db
        .from('user_roles')
        .delete()
        .eq('user_id', tutorUserId)
        .eq('role', 'tutor');
      if (revokeErr) return Response.json({ error: revokeErr.message }, { status: 400, headers: cors });
      await db.from('users').update({ active_role: 'student' }).eq('id', tutorUserId).eq('active_role', 'tutor');
    }

    return Response.json(
      { ok: true, approvalStatus: updated.approval_status, gradesVerified: updated.grades_verified_at != null },
      { headers: cors },
    );
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400, headers: cors });
  }
});
