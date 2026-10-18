// 0088: ambassador program administration + cash-outs paid by Stripe transfer.
// Local stack only; needs no Edge Functions (the Stripe transfer itself lives in
// admin-pay-cashout and is exercised by hand in test mode — this script drives the same
// claim/mark-paid writes with the service role). Creates its own users, including the admin.
//   pnpm dlx tsx scripts/verify_ambassador_cashouts.mts
// Checks, as a plain student / the ambassador / an admin:
//   • payout-ready account required before request_credit_cashout; min $10 and balance rules hold
//   • RLS: ambassadors read only their own cash-outs, nobody writes them from the client
//   • admin RPCs refuse non-admins; approve/reject each leave exactly one admin_actions row
//   • reject returns the credit exactly once, even under concurrent taps; paid/rejected can't flip
//   • the pay function's claim (paying_at) is exclusive and goes stale after 10 min; a claimed
//     or unresolved (pay_unknown_at) row can't be rejected — only Pay can settle it
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'Cashout-Verify-2026!';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const START = new Date().toISOString();

let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '✅' : '❌'} ${n}${d ? ` — ${d}` : ''}`);
  ok ? pass++ : fail++;
};
type R = { error: { message: string } | null; data?: unknown };
const blocked = (r: R, n: string) => check(n, !!r.error, r.error?.message ?? 'ALLOWED');
const allowed = (r: R, n: string) => check(n, !r.error, r.error?.message ?? '');
const noRows = (r: { error: { message: string } | null; data: unknown[] | null }, n: string) =>
  check(n, !!r.error || (r.data ?? []).length === 0, r.error?.message ?? `${(r.data ?? []).length} rows`);

const created: string[] = [];
async function newUser(tag: string, roles: string[] = []): Promise<{ c: SupabaseClient; uid: string }> {
  const email = `cashouts-${tag.toLowerCase()}-${Date.now()}${Math.floor(Math.random() * 1e4)}@crimson.ua.edu`;
  const { data: u, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const uid = u.user!.id;
  created.push(uid);
  await svc.from('users').update({ first_name: tag, last_name: 'Tester' }).eq('id', uid);
  for (const role of roles) await svc.from('user_roles').upsert({ user_id: uid, role });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw sErr;
  return { c, uid };
}
const balance = async (c: SupabaseClient) => Number((await c.rpc('my_credit_balance')).data ?? 0);
const audit = async (action: string, targetId: string) =>
  (await svc.from('admin_actions').select('actor_id').eq('action', action).eq('target_id', targetId).gte('created_at', START)).data ?? [];
const returns = async (cid: string) =>
  ((await svc.from('credit_ledger').select('id').eq('cashout_id', cid).eq('kind', 'adjustment')).data ?? []).length;

// is_admin() needs aal2 when require_admin_mfa is on; our throwaway admin has no factor, so
// turn it off for this run (and put it back).
const { data: mfaSetting } = await svc.from('app_settings').select('value').eq('key', 'require_admin_mfa').maybeSingle();
if (mfaSetting) await svc.from('app_settings').update({ value: false }).eq('key', 'require_admin_mfa');

try {
  const admin = await newUser('Admin', ['admin']);
  const amb = await newUser('Amb', ['ambassador']);
  const other = await newUser('Other');
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  allowed(await amb.c.rpc('create_my_ambassador_profile'), 'ambassador gets a profile row');

  console.log('\n— walls: admin RPCs refuse everyone but admins —');
  blocked(await other.c.rpc('admin_approve_ambassador', { p_user: amb.uid }), 'student cannot approve an ambassador');
  blocked(await amb.c.rpc('admin_approve_ambassador', { p_user: amb.uid }), 'ambassador cannot approve themselves');
  blocked(await other.c.rpc('admin_reject_cashout', { p_cashout: amb.uid }), 'student cannot reject a cash-out');
  for (const fn of ['admin_ambassador_queue', 'admin_list_cashouts', 'admin_ambassador_history', 'admin_ambassador_counts']) {
    const r = await other.c.rpc(fn);
    check(`student sees nothing from ${fn}`, !!r.error || ((r.data ?? []) as unknown[]).length === 0, r.error?.message ?? `${((r.data ?? []) as unknown[]).length} rows`);
  }
  blocked(await anon.rpc('admin_ambassador_counts'), 'anon cannot call admin_ambassador_counts');
  blocked(await anon.rpc('payout_account_ready', { p_user: amb.uid }), 'anon cannot call payout_account_ready');

  console.log('\n— approve —');
  const queueRes = await admin.c.rpc('admin_ambassador_queue');
  if (queueRes.error) console.log('queue error', JSON.stringify(queueRes.error));
  const queue = (queueRes.data ?? []) as { user_id: string; name: string; payout_ready: boolean }[];
  const inQueue = queue.find((q) => q.user_id === amb.uid);
  check('admin sees the unapproved ambassador in the queue', !!inQueue && inQueue.name === 'Amb Tester' && inQueue.payout_ready === false, JSON.stringify(inQueue));
  const counts0 = ((await admin.c.rpc('admin_ambassador_counts')).data as { applications: number }[])[0];
  check('counts.applications includes them', (counts0?.applications ?? 0) >= 1, JSON.stringify(counts0));
  blocked(await admin.c.rpc('admin_approve_ambassador', { p_user: other.uid }), 'cannot approve someone without the ambassador role');
  const ap = await admin.c.rpc('admin_approve_ambassador', { p_user: amb.uid });
  check('admin approves → true', !ap.error && ap.data === true, ap.error?.message ?? String(ap.data));
  const ap2 = await admin.c.rpc('admin_approve_ambassador', { p_user: amb.uid });
  check('approving again → false, no error', !ap2.error && ap2.data === false, ap2.error?.message ?? String(ap2.data));
  const apRows = await audit('ambassador.approve', amb.uid);
  check('exactly one ambassador.approve audit row, by the admin', apRows.length === 1 && apRows[0].actor_id === admin.uid, `${apRows.length} rows`);
  const { data: approval } = await svc.from('ambassador_approvals').select('approved_by').eq('user_id', amb.uid).single();
  check('approved_by is the admin', approval?.approved_by === admin.uid);
  check('…and they left the queue', !((await admin.c.rpc('admin_ambassador_queue')).data as { user_id: string }[]).some((q) => q.user_id === amb.uid));
  const { data: notes } = await svc.from('notifications').select('*').eq('user_id', amb.uid).gte('created_at', START);
  check('ambassador got an approval notification', (notes ?? []).some((n) => JSON.stringify(n).includes('approved')), `${(notes ?? []).length} notifications`);

  console.log('\n— request: payout account required —');
  await svc.from('credit_ledger').insert({ user_id: amb.uid, amount_cents: 4000, kind: 'adjustment' });
  check('ambassador holds $40 credit', (await balance(amb.c)) === 4000);
  blocked(await amb.c.rpc('request_credit_cashout', { p_cents: 1500 }), 'no payout account → refused');
  noRows(await amb.c.from('ambassador_profiles').update({ stripe_connect_account_id: 'acct_fake', stripe_transfers_enabled: true }).eq('user_id', amb.uid).select(), 'ambassador cannot mark their own account payout-ready');
  await svc.from('ambassador_profiles').update({ stripe_connect_account_id: 'acct_verify', stripe_transfers_enabled: true }).eq('user_id', amb.uid);
  check('payout_account_ready now true', (await admin.c.rpc('payout_account_ready', { p_user: amb.uid })).data === true);
  blocked(await amb.c.rpc('request_credit_cashout', { p_cents: 999 }), 'under $10 refused');
  blocked(await amb.c.rpc('request_credit_cashout', { p_cents: 4001 }), 'more than the balance refused');
  await svc.from('users').update({ status: 'suspended' }).eq('id', amb.uid);
  blocked(await amb.c.rpc('request_credit_cashout', { p_cents: 1500 }), 'suspended ambassador refused (is_active_user)');
  await svc.from('users').update({ status: 'active' }).eq('id', amb.uid);
  const r1 = await amb.c.rpc('request_credit_cashout', { p_cents: 1500 });
  allowed(r1, 'requests $15');
  const cid1 = r1.data as string;
  const cid2 = (await amb.c.rpc('request_credit_cashout', { p_cents: 1000 })).data as string;
  const cid3 = (await amb.c.rpc('request_credit_cashout', { p_cents: 1000 })).data as string;
  check('three pending requests; balance is $5', !!cid2 && !!cid3 && (await balance(amb.c)) === 500, String(await balance(amb.c)));

  console.log('\n— RLS on credit_cashouts —');
  check('ambassador reads only their own (3 rows)', ((await amb.c.from('credit_cashouts').select('id')).data ?? []).length === 3);
  check('another student reads none of them', ((await other.c.from('credit_cashouts').select('id')).data ?? []).length === 0);
  check('admin reads them via RLS', ((await admin.c.from('credit_cashouts').select('id').eq('user_id', amb.uid)).data ?? []).length === 3);
  noRows(await amb.c.from('credit_cashouts').update({ status: 'paid' }).eq('id', cid1).select(), 'ambassador cannot mark their own paid');
  noRows(await amb.c.from('credit_cashouts').insert({ user_id: amb.uid, amount_cents: 1000 }).select(), 'ambassador cannot insert a cash-out directly');
  noRows(await amb.c.from('credit_cashouts').delete().eq('id', cid1).select(), 'ambassador cannot delete a cash-out');
  noRows(await admin.c.from('credit_cashouts').update({ status: 'paid' }).eq('id', cid1).select(), 'even an admin cannot flip status from the client (RPC/Edge only)');

  console.log('\n— admin list + reject —');
  const list = (await admin.c.rpc('admin_list_cashouts', { p_statuses: ['pending'], p_limit: 50 })).data as { id: string; name: string; payout_ready: boolean; amount_cents: number }[];
  const l1 = list.find((x) => x.id === cid1);
  check('admin list shows the pending $15 with name + payout_ready', !!l1 && l1.amount_cents === 1500 && l1.name === 'Amb Tester' && l1.payout_ready === true, JSON.stringify(l1));
  check('counts.cashouts ≥ 3', (((await admin.c.rpc('admin_ambassador_counts')).data as { cashouts: number }[])[0]?.cashouts ?? 0) >= 3);
  allowed(await admin.c.rpc('admin_reject_cashout', { p_cashout: cid2 }), 'admin rejects the $10');
  const { data: rej } = await svc.from('credit_cashouts').select('status, rejected_by, rejected_at').eq('id', cid2).single();
  check('row is rejected, by the admin, timestamped', rej?.status === 'rejected' && rej?.rejected_by === admin.uid && !!rej?.rejected_at, JSON.stringify(rej));
  check('credit came back: balance $15', (await balance(amb.c)) === 1500, String(await balance(amb.c)));
  check('exactly one return ledger row', (await returns(cid2)) === 1);
  check('exactly one cashout.reject audit row', (await audit('cashout.reject', cid2)).length === 1);
  blocked(await admin.c.rpc('admin_reject_cashout', { p_cashout: cid2 }), 'rejecting again is refused');
  check('…still one return row, still $15', (await returns(cid2)) === 1 && (await balance(amb.c)) === 1500);
  blocked(await admin.c.rpc('admin_reject_cashout', { p_cashout: '00000000-0000-4000-8000-000000000000' }), 'unknown cash-out refused');
  const race = await Promise.all(Array.from({ length: 6 }, () => admin.c.rpc('admin_reject_cashout', { p_cashout: cid3 })));
  check('6 concurrent rejects → exactly one succeeds', race.filter((r) => !r.error).length === 1, `${race.filter((r) => !r.error).length} ok`);
  check('…one return row, one audit row, balance $25', (await returns(cid3)) === 1 && (await audit('cashout.reject', cid3)).length === 1 && (await balance(amb.c)) === 2500);

  console.log('\n— pay: claim is exclusive (what admin-pay-cashout does before Stripe) —');
  const claim = () => svc.from('credit_cashouts').update({ paying_at: new Date().toISOString() })
    .eq('id', cid1).eq('status', 'pending')
    .or(`paying_at.is.null,paying_at.lt.${new Date(Date.now() - 10 * 60 * 1000).toISOString()}`)
    .select('id');
  check('first claim wins', ((await claim()).data ?? []).length === 1);
  check('second claim gets nothing', ((await claim()).data ?? []).length === 0);
  blocked(await admin.c.rpc('admin_reject_cashout', { p_cashout: cid1 }), 'cannot reject while it is being paid');
  await svc.from('credit_cashouts').update({ paying_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() }).eq('id', cid1);
  blocked(await admin.c.rpc('admin_reject_cashout', { p_cashout: cid1 }), 'cannot reject a stale claim either (Pay must settle it)');
  check('a stale claim (>10 min) can be taken over by Pay', ((await claim()).data ?? []).length === 1);
  await svc.from('credit_cashouts').update({ paying_at: null, pay_unknown_at: new Date().toISOString() }).eq('id', cid1);
  blocked(await admin.c.rpc('admin_reject_cashout', { p_cashout: cid1 }), 'cannot reject while a Stripe attempt is unresolved (pay_unknown_at)');
  check('Pay can retry an unresolved attempt right away', ((await claim()).data ?? []).length === 1);
  const paid = await svc.from('credit_cashouts')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: admin.uid, stripe_transfer_id: `tr_verify_${Date.now()}`, paying_at: null, pay_unknown_at: null })
    .eq('id', cid1).eq('status', 'pending').select('id');
  check('marked paid once', (paid.data ?? []).length === 1);
  blocked(await admin.c.rpc('admin_reject_cashout', { p_cashout: cid1 }), 'a paid cash-out cannot be rejected');
  const dup = await svc.from('credit_cashouts').insert({ user_id: amb.uid, amount_cents: 1000, status: 'paid', stripe_transfer_id: (await svc.from('credit_cashouts').select('stripe_transfer_id').eq('id', cid1).single()).data!.stripe_transfer_id });
  blocked(dup, 'the same transfer id cannot be recorded twice');
  const mine = (await amb.c.from('credit_cashouts').select('id, status').order('created_at')).data as { id: string; status: string }[];
  check('ambassador sees paid / rejected / rejected', mine.map((m) => m.status).sort().join(',') === 'paid,rejected,rejected', mine.map((m) => m.status).join(','));
  const hist = (await admin.c.rpc('admin_ambassador_history', { p_limit: 50 })).data as { kind: string; id: string; status: string }[];
  check('history has the approval and the settled cash-outs', hist.some((h) => h.kind === 'approval' && h.id === amb.uid) && hist.some((h) => h.id === cid1 && h.status === 'paid') && hist.some((h) => h.id === cid2 && h.status === 'rejected'));
  check('history has no pending rows', !hist.some((h) => h.status === 'pending'));
} finally {
  if (mfaSetting) await svc.from('app_settings').update({ value: mfaSetting.value }).eq('key', 'require_admin_mfa');
  for (const id of created) {
    await svc.from('credit_ledger').delete().eq('user_id', id);
    await svc.from('credit_cashouts').delete().eq('user_id', id);
    await svc.auth.admin.deleteUser(id);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
