// Noot credits (0040). Acts as fresh students holding only the anon key and their own JWT —
// i.e. a modified client, not the app — and tries to mint, move or read credit they
// shouldn't. Then drives the server-side paths (as the Edge Functions would, with the
// service role) and checks the money adds up:
//   • invite codes: one per user, never client-chosen; claimed by the new account after it
//     signs in, only an older account's code, never from the sign-up request's metadata
//   • the ledger: no client writes, no reading anyone else's rows
//   • earning: $5 to the inviter when the invitee completes a session, once
//   • no reward for a session with your own inviter; one invite per email, ever
//   • ambassador milestones: once each, only once the team approves the ambassador
//   • spending / returning on a booking; cash-out for approved ambassadors, 7-day hold
// Local stack only; doesn't need Edge Functions.
//   pnpm dlx tsx scripts/verify_credits.mts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'password123';
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
}
const blocked = (r: { error: { message: string } | null }, name: string) =>
  check(name, !!r.error, r.error?.message ?? 'ALLOWED');
const allowed = (r: { error: { message: string } | null }, name: string) =>
  check(name, !r.error, r.error?.message ?? '');
/** Client writes to an RLS table with no write policy: an error, or zero rows touched. */
const noRows = (r: { error: { message: string } | null; data: unknown[] | null }, name: string) =>
  check(name, !!r.error || (r.data ?? []).length === 0, r.error?.message ?? `${(r.data ?? []).length} rows`);

const created: string[] = [];
/** A new account; `referralCode` is what they typed on the sign-up screen, which the app
 *  claims right after their first sign-in (lib/pendingInvite). */
async function newUser(tag: string, referralCode?: string, email?: string): Promise<{ c: SupabaseClient; uid: string }> {
  email ??= `credits-${tag.toLowerCase()}-${Date.now()}${Math.floor(Math.random() * 1e4)}@crimson.ua.edu`;
  const { data: u, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  created.push(u.user!.id);
  await svc.from('users').update({ first_name: tag, last_name: 'Tester' }).eq('id', u.user!.id);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw sErr;
  if (referralCode) await c.rpc('claim_invite', { p_code: referralCode }); // refusals are checked by the caller
  return { c, uid: u.user!.id };
}

const { data: sara } = await svc.from('users').select('id').eq('email', 'sara@crimson.ua.edu').single();
const tutorId = sara!.id as string;

async function completedBooking(studentId: string, status = 'completed'): Promise<string> {
  const { data, error } = await svc.from('bookings').insert({
    student_id: studentId, tutor_id: tutorId, subject: 'MGT 300',
    scheduled_at: new Date(Date.now() - 864e5).toISOString(),
    duration_minutes: 60, price: 28, platform_fee: 4.9, tutor_payout_amount: 23.1,
    status, session_type: 'in_person',
    cancellation_deadline: new Date(Date.now() - 2 * 864e5).toISOString(),
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}
const balance = async (c: SupabaseClient) => (await c.rpc('my_credit_balance')).data as number;

try {
  const inviter = await newUser('Inviter');
  const stranger = await newUser('Stranger');
  const referredBy = async (uid: string) =>
    (await svc.from('referrals').select('ambassador_id').eq('referred_user_id', uid).maybeSingle()).data?.ambassador_id ?? null;

  console.log('— invite codes —');
  const code1 = await inviter.c.rpc('my_invite_code');
  const code2 = await inviter.c.rpc('my_invite_code');
  check('my_invite_code returns a NOOT- code', !code1.error && /^NOOT-[0-9A-F]{6}$/.test(code1.data), String(code1.data ?? code1.error?.message));
  check('…and the same one every time', code1.data === code2.data);
  const code = code1.data as string;
  noRows(await stranger.c.from('invite_codes').insert({ user_id: stranger.uid, code: 'NOOT-CHOSEN' }).select(), 'student cannot choose their own code');
  noRows(await inviter.c.from('invite_codes').update({ code: 'NOOT-VANITY' }).eq('user_id', inviter.uid).select(), 'student cannot change their code');
  const peek = await stranger.c.from('invite_codes').select('code').eq('user_id', inviter.uid);
  check("student cannot read someone else's code row", (peek.data ?? []).length === 0);

  console.log('\n— joining with a code (sign-up only) —');
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  check('signed out, the sign-up screen can check a real code', (await anon.rpc('check_invite_code', { p_code: code.toLowerCase() })).data === true);
  check('…and a made-up one', (await anon.rpc('check_invite_code', { p_code: 'NOOT-NOPE00' })).data === false);
  const friend = await newUser('Friend', ` ${code.toLowerCase()} `);
  check('signing up with a code records the referral (case/space-insensitive)', (await referredBy(friend.uid)) === inviter.uid);
  const typo = await newUser('Typo', 'NOOT-NOPE00');
  check('signing up with an unknown code records nothing', (await referredBy(typo.uid)) === null);
  blocked(await friend.c.rpc('claim_invite', { p_code: code }), 'a second claim is refused');
  blocked(await inviter.c.rpc('claim_invite', { p_code: (await friend.c.rpc('my_invite_code')).data }), 'claiming the code of someone who joined after you is refused (no loops)');
  blocked(await inviter.c.rpc('claim_invite', { p_code: code }), 'your own code is refused');
  const booked = await newUser('Booked');
  await completedBooking(booked.uid);
  blocked(await booked.c.rpc('claim_invite', { p_code: code }), 'a code can\'t be claimed after your first session');
  blocked(await anon.rpc('claim_invite', { p_code: code }), 'signed out, nothing can be claimed');
  noRows(await stranger.c.from('referrals').insert({ ambassador_id: inviter.uid, referred_user_id: stranger.uid, referred_role: 'student', referral_code_used: code }).select(), 'student cannot insert a referral row directly');

  console.log('\n— the ledger is server-only —');
  noRows(await inviter.c.from('credit_ledger').insert({ user_id: inviter.uid, amount_cents: 100000, kind: 'adjustment' }).select(), 'student cannot insert credit');
  for (const fn of ['award_invite_rewards', 'spend_credit', 'return_booking_credit', 'credit_balance_cents', 'credit_lock'] as const) {
    const args: Record<string, unknown> =
      fn === 'award_invite_rewards' ? { p_booking: crypto.randomUUID() }
      : fn === 'spend_credit' ? { p_user: inviter.uid, p_cents: -100000, p_payment_intent: 'pi_x' }
      : fn === 'return_booking_credit' ? { p_booking: crypto.randomUUID(), p_percent: 100 }
      : { p_user: inviter.uid };
    blocked(await inviter.c.rpc(fn, args), `student cannot call ${fn}`);
  }
  noRows(await inviter.c.from('ambassador_milestones').update({ bonus_cents: 9999999 }).eq('threshold', 5).select(), 'student cannot edit milestone amounts');
  noRows(await inviter.c.from('bookings').update({ credit_applied: 28 }).eq('student_id', inviter.uid).select(), 'student cannot set credit_applied on a booking');

  console.log('\n— earning —');
  const pendingB = await completedBooking(friend.uid, 'confirmed');
  check('a booking that is not completed earns nothing', (await svc.rpc('award_invite_rewards', { p_booking: pendingB })).data === 0);
  check('balance starts at $0', (await balance(inviter.c)) === 0);
  const doneB = await completedBooking(friend.uid);
  check("friend's completed session awards 1 reward", (await svc.rpc('award_invite_rewards', { p_booking: doneB })).data === 1);
  check('…and the inviter has $5', (await balance(inviter.c)) === 500, String(await balance(inviter.c)));
  const doneB2 = await completedBooking(friend.uid);
  check('a second session by the same friend earns nothing more', (await svc.rpc('award_invite_rewards', { p_booking: doneB2 })).data === 0 && (await balance(inviter.c)) === 500);
  check('the friend earns nothing for being invited', (await balance(friend.c)) === 0);
  const theirs = await stranger.c.from('credit_ledger').select('id').eq('user_id', inviter.uid);
  check("student cannot read someone else's ledger", (theirs.data ?? []).length === 0);
  const invites = await inviter.c.rpc('my_invites');
  const row = (invites.data ?? [])[0];
  check('my_invites shows the friend as completed, first name + initial', row?.completed === true && row?.display_name === 'Friend T.' && row?.reward_cents === 500, JSON.stringify(row ?? invites.error?.message));
  check("my_invites shows nothing to someone who invited no one", ((await stranger.c.rpc('my_invites')).data ?? []).length === 0);

  console.log('\n— self-dealing, re-signups, legacy —');
  const tutorInviter = await newUser('TutorInv');
  const tiCode = (await tutorInviter.c.rpc('my_invite_code')).data as string;
  const buddy = await newUser('Buddy', tiCode);
  const { data: selfDeal } = await svc.from('bookings').insert({
    student_id: buddy.uid, tutor_id: tutorInviter.uid, subject: 'MGT 300',
    scheduled_at: new Date(Date.now() - 864e5).toISOString(), duration_minutes: 60, price: 28, platform_fee: 4.9,
    tutor_payout_amount: 23.1, status: 'completed', session_type: 'in_person', cancellation_deadline: new Date(Date.now() - 2 * 864e5).toISOString(),
  }).select('id').single();
  check('a session with the person who invited you earns them nothing', (await svc.rpc('award_invite_rewards', { p_booking: selfDeal!.id })).data === 0);

  const again = await newUser('Again', code);
  const { data: againUser } = await svc.from('users').select('email').eq('id', again.uid).single();
  check('a new user joins with the code', (await referredBy(again.uid)) === inviter.uid);
  // As delete-account does: scrub the users row (it's kept), revoke the code, drop the login.
  await svc.from('users').update({ email: `deleted+${again.uid}@removed.invalid`, first_name: '', last_name: '' }).eq('id', again.uid);
  await svc.from('invite_codes').delete().eq('user_id', again.uid);
  const del = await svc.auth.admin.deleteUser(again.uid);
  if (del.error) throw del.error;
  const tagged = againUser!.email.replace('@', '+2@');
  for (const addr of [againUser!.email, tagged]) {
    const reborn = await newUser('Reborn', code, addr);
    check(`a new account as ${addr === tagged ? 'a +tag of the same email' : 'the same email'} can't use a code again`, (await referredBy(reborn.uid)) === null);
  }

  const legacy = await newUser('Legacy', code);
  const { data: lref } = await svc.from('referrals').select('id').eq('referred_user_id', legacy.uid).single();
  await svc.from('referral_bonuses').insert({ ambassador_id: inviter.uid, referral_id: lref!.id, status: 'paid' });
  check('a referral already paid under the old cash bonus earns nothing more', (await svc.rpc('award_invite_rewards', { p_booking: await completedBooking(legacy.uid) })).data === 0);
  await svc.from('referral_bonuses').delete().eq('referral_id', lref!.id);

  console.log('\n— ambassador milestones need team approval —');
  const amb = await newUser('Amb');
  allowed(await amb.c.from('user_roles').insert({ user_id: amb.uid, role: 'ambassador' }), 'opt in as ambassador');
  const ambCode = (await amb.c.rpc('create_my_ambassador_profile')).data as string;
  check('ambassador code is the same as their invite code', ambCode === (await amb.c.rpc('my_invite_code')).data);
  for (let i = 0; i < 5; i++) {
    const f = await newUser(`Pal${i}`, ambCode);
    await svc.rpc('award_invite_rewards', { p_booking: await completedBooking(f.uid) });
  }
  check('unapproved: 5 completed invites earn 5×$5 and no milestone', (await balance(amb.c)) === 2500, String(await balance(amb.c)));
  blocked(await amb.c.rpc('request_credit_cashout', { p_cents: 1000 }), 'unapproved ambassador cannot cash out');
  check('…and has nothing cashable', (await amb.c.rpc('my_cashable_credit')).data === 0);
  noRows(await amb.c.from('ambassador_approvals').insert({ user_id: amb.uid }).select(), 'ambassador cannot approve themselves');
  allowed(await svc.from('ambassador_approvals').insert({ user_id: amb.uid }), 'team approves the ambassador');
  const { data: m5 } = await svc.from('ambassador_milestones').select('bonus_cents').eq('threshold', 5).single();
  check('approval pays the goal they already reached', (await balance(amb.c)) === 2500 + m5!.bonus_cents, String(await balance(amb.c)));
  await svc.rpc('award_invite_rewards', { p_booking: await completedBooking((await newUser('Pal5', ambCode)).uid) });
  const bonuses = await amb.c.from('credit_ledger').select('milestone').eq('kind', 'milestone_bonus');
  check('the milestone is paid exactly once', (bonuses.data ?? []).length === 1);
  check('a non-ambassador inviter gets no milestone', ((await inviter.c.from('credit_ledger').select('id').eq('kind', 'milestone_bonus')).data ?? []).length === 0);

  // Approved first, role second (or role dropped and re-added): goals still get paid.
  const roleLate = await newUser('LateRole');
  const lateCode = (await roleLate.c.rpc('my_invite_code')).data as string;
  for (let i = 0; i < 5; i++) {
    const f = await newUser(`LPal${i}`, lateCode);
    await svc.rpc('award_invite_rewards', { p_booking: await completedBooking(f.uid) });
  }
  await svc.from('ambassador_approvals').insert({ user_id: roleLate.uid });
  check('approval without the role pays no goal yet', (await balance(roleLate.c)) === 2500);
  await roleLate.c.from('user_roles').insert({ user_id: roleLate.uid, role: 'ambassador' });
  check('…adding the role then pays it', (await balance(roleLate.c)) === 2500 + m5!.bonus_cents, String(await balance(roleLate.c)));

  console.log('\n— spending and returning —');
  blocked(await svc.rpc('spend_credit', { p_user: inviter.uid, p_cents: 600, p_payment_intent: 'pi_over' }), 'cannot spend more than the balance');
  allowed(await svc.rpc('spend_credit', { p_user: inviter.uid, p_cents: 500, p_payment_intent: 'pi_spend_1' }), 'spend $5');
  check('balance is $0 after spending', (await balance(inviter.c)) === 0);
  blocked(await svc.rpc('spend_credit', { p_user: inviter.uid, p_cents: 1, p_payment_intent: 'pi_spend_2' }), 'cannot spend into the negative');
  const spentB = await completedBooking(inviter.uid, 'cancelled');
  await svc.from('credit_ledger').update({ booking_id: spentB }).eq('payment_intent_id', 'pi_spend_1');
  check('a 50% refund returns $2.50', (await svc.rpc('return_booking_credit', { p_booking: spentB, p_percent: 50 })).data === 250);
  check('…repeating it changes nothing', (await svc.rpc('return_booking_credit', { p_booking: spentB, p_percent: 50 })).data === 0 && (await balance(inviter.c)) === 250);
  check('a later full refund tops it up to 100%', (await svc.rpc('return_booking_credit', { p_booking: spentB, p_percent: 100 })).data === 250 && (await balance(inviter.c)) === 500, String(await balance(inviter.c)));
  await svc.rpc('return_booking_credit', { p_booking: spentB, p_percent: 100 });
  check('…and never past it', (await balance(inviter.c)) === 500);
  blocked(await svc.rpc('spend_credit', { p_user: inviter.uid, p_cents: 100, p_payment_intent: 'pi_spend_1' }), 'the same PaymentIntent cannot spend twice');
  // A spend that never got linked to its booking is still found through the PaymentIntent.
  await svc.from('credit_ledger').insert({ user_id: inviter.uid, amount_cents: 300, kind: 'adjustment' });
  await svc.rpc('spend_credit', { p_user: inviter.uid, p_cents: 300, p_payment_intent: 'pi_unlinked' });
  const { data: unlinked } = await svc.from('bookings').insert({
    student_id: inviter.uid, tutor_id: tutorId, subject: 'MGT 300', scheduled_at: new Date(Date.now() + 864e5).toISOString(),
    duration_minutes: 60, price: 28, platform_fee: 4.9, tutor_payout_amount: 23.1, credit_applied: 3, status: 'cancelled',
    session_type: 'in_person', cancellation_deadline: new Date().toISOString(), stripe_payment_intent_id: 'pi_unlinked',
  }).select('id').single();
  check('an unlinked spend is still returned on cancel', (await svc.rpc('return_booking_credit', { p_booking: unlinked!.id, p_percent: 100 })).data === 300);

  console.log('\n— a refunded or disputed session is reversed —');
  const revInv = await newUser('RevInv');
  const revCode = (await revInv.c.rpc('my_invite_code')).data as string;
  const revFriend = await newUser('RevFriend', revCode);
  const revB = await completedBooking(revFriend.uid);
  await svc.rpc('award_invite_rewards', { p_booking: revB });
  check('the inviter has the $5', (await balance(revInv.c)) === 500);
  allowed(await svc.rpc('reverse_invite_rewards', { p_booking: revB }), 'reverse the refunded session');
  check('…the $5 is taken back', (await balance(revInv.c)) === 0);
  await svc.from('credit_ledger').insert({ user_id: revInv.uid, amount_cents: 700, kind: 'adjustment' });
  await svc.rpc('reverse_invite_rewards', { p_booking: revB });
  check('…only once, even with new credit since', (await balance(revInv.c)) === 700, String(await balance(revInv.c)));
  const revRow = ((await revInv.c.rpc('my_invites')).data ?? [])[0];
  check('…and my_invites marks it reversed at $0', revRow?.reversed === true && revRow?.reward_cents === 0, JSON.stringify(revRow));

  const partInv = await newUser('PartInv');
  const partFriend = await newUser('PartFriend', (await partInv.c.rpc('my_invite_code')).data as string);
  const partB = await completedBooking(partFriend.uid);
  await svc.rpc('award_invite_rewards', { p_booking: partB });
  await svc.rpc('spend_credit', { p_user: partInv.uid, p_cents: 200, p_payment_intent: `pi_part_${partInv.uid}` });
  await svc.rpc('reverse_invite_rewards', { p_booking: partB });
  check('only the unspent part is taken back ($3 of $5), never below $0', (await balance(partInv.c)) === 0, String(await balance(partInv.c)));

  const lateInv = await newUser('LateInv');
  const lateFriend = await newUser('LateFriend', (await lateInv.c.rpc('my_invite_code')).data as string);
  const lateB = await completedBooking(lateFriend.uid);
  await svc.rpc('reverse_invite_rewards', { p_booking: lateB }); // refunded before the award ran
  check('a session refunded before the award earns nothing later', (await svc.rpc('award_invite_rewards', { p_booking: lateB })).data === 0);
  blocked(await revInv.c.rpc('reverse_invite_rewards', { p_booking: revB }), 'student cannot call reverse_invite_rewards');

  console.log('\n— a code in the sign-up request is ignored (anyone can request for any address) —');
  const planted = `planted${Date.now()}@crimson.ua.edu`;
  const otp = createClient(URL, ANON, { auth: { persistSession: false } });
  allowed(await otp.auth.signInWithOtp({ email: planted, options: { shouldCreateUser: true, data: { referral_code: revCode } } }), 'someone requests a link for that address with their code');
  const { data: plantedUser } = await svc.from('users').select('id').eq('email', planted).single();
  created.push(plantedUser!.id);
  await svc.auth.admin.updateUserById(plantedUser!.id, { email_confirm: true, password: PASSWORD });
  await createClient(URL, ANON, { auth: { persistSession: false } }).auth.signInWithPassword({ email: planted, password: PASSWORD });
  check('…and when the real owner signs in, no referral was attached', (await referredBy(plantedUser!.id)) === null);

  console.log('\n— cash-out —');
  blocked(await inviter.c.rpc('request_credit_cashout', { p_cents: 1000 }), 'non-ambassadors cannot cash out');
  blocked(await amb.c.rpc('request_credit_cashout', { p_cents: 500 }), 'under $10 is rejected');
  blocked(await amb.c.rpc('request_credit_cashout', { p_cents: 999999 }), 'more than the balance is rejected');
  blocked(await amb.c.rpc('request_credit_cashout', { p_cents: 2000 }), 'credit earned this week cannot be cashed out yet');
  await svc.from('credit_ledger').update({ created_at: new Date(Date.now() - 8 * 864e5).toISOString() }).eq('user_id', amb.uid);
  check('after 7 days it is cashable', ((await amb.c.rpc('my_cashable_credit')).data as number) === (await balance(amb.c)));
  const before = await balance(amb.c);
  allowed(await amb.c.rpc('request_credit_cashout', { p_cents: 2000 }), 'ambassador cashes out $20');
  check('balance drops by $20', (await balance(amb.c)) === before - 2000);
  noRows(await amb.c.from('credit_cashouts').update({ status: 'paid' }).eq('user_id', amb.uid).select(), 'ambassador cannot mark their own cash-out paid');
} finally {
  for (const id of created) {
    await svc.from('credit_ledger').delete().eq('user_id', id);
    await svc.from('bookings').delete().eq('student_id', id);
    await svc.auth.admin.deleteUser(id);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
