// Exercise the admin TOTP rollout (migration 0059) against the LOCAL Supabase stack.
// Needs: supabase start, supabase functions serve, db reset, and the demo seed.
//   pnpm dlx tsx scripts/verify_admin_mfa.mts
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { auth, getSupabase, initSupabase } from '../packages/core/src/index.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

type Probe = { isAdmin: boolean; sawStudentRow: boolean; fn: number };

let passed = 0;
let failed = 0;
let number = 0;
const step = async (name: string, action: () => Promise<void>) => {
  const current = ++number;
  console.log(`${current}) RUN — ${name}`);
  try {
    await action();
    passed++;
    console.log(`${current}) PASS ✅ — ${name}`);
  } catch (error) {
    failed++;
    console.error(`${current}) FAIL ❌ — ${name}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

initSupabase({ url: URL, anonKey: ANON });
const service = createClient(URL, SERVICE, { auth: { persistSession: false } });
const clients = [createClient(URL, ANON, { auth: { persistSession: false } })];
const anon = clients[0]!;
const tag = `mfa${Date.now()}`;
const createdIds: string[] = [];
const emailFor = (name: string) => `${tag}_${name}@crimson.ua.edu`;

const makeUser = async (name: string) => {
  const result = await service.auth.admin.createUser({
    email: emailFor(name),
    password: 'password123',
    email_confirm: true,
    user_metadata: { first_name: `Mfa${name}`, last_name: tag },
  });
  if (result.error) throw result.error;
  const user = result.data.user;
  if (!user) throw new Error(`Could not create ${name}`);
  createdIds.push(user.id);
  return { id: user.id, email: emailFor(name) };
};

const rawClient = () => {
  const client = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  clients.push(client);
  return client;
};

const signInRaw = async (client: ReturnType<typeof createClient>, email: string) => {
  const { error } = await client.auth.signInWithPassword({ email, password: 'password123' });
  if (error) throw error;
};

const setSwitch = async (required: boolean) => {
  const { error } = await service
    .from('app_settings')
    .update({ value: required, updated_at: new Date().toISOString() })
    .eq('key', 'require_admin_mfa');
  if (error) throw error;
  const { data, error: readError } = await service
    .from('app_settings')
    .select('value')
    .eq('key', 'require_admin_mfa')
    .single();
  if (readError) throw readError;
  if (data.value !== required) throw new Error(`require_admin_mfa did not become ${required}`);
};

const probe = async (client: ReturnType<typeof createClient>, studentId: string): Promise<Probe> => {
  const { data: isAdmin, error: adminError } = await client.rpc('is_admin' as never);
  if (adminError) throw adminError;
  const { data: studentRows, error: studentError } = await client
    .from('users')
    .select('id')
    .eq('id', studentId);
  const { data: sessionData } = await client.auth.getSession();
  const response = await fetch(`${URL}/functions/v1/moderate-review`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      authorization: `Bearer ${sessionData.session?.access_token ?? ANON}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  return {
    isAdmin: isAdmin === true,
    sawStudentRow: !studentError && (studentRows?.length ?? 0) === 1,
    fn: response.status,
  };
};

const assertAllowed = (result: Probe) =>
  expect(result.isAdmin && result.sawStudentRow && result.fn === 400, `expected true/true/400, received ${JSON.stringify(result)}`);
const assertDenied = (result: Probe) =>
  expect(!result.isAdmin && !result.sawStudentRow && result.fn === 403, `expected false/false/403, received ${JSON.stringify(result)}`);

const decodeBase32 = (secret: string): Buffer => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of secret.toUpperCase().replace(/=+$/, '')) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const totp = (secret: string): string => {
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
};

const waitForNextTotpWindow = async () => {
  const delay = 30_000 - (Date.now() % 30_000) + 50;
  await new Promise((resolve) => setTimeout(resolve, delay));
};

let fatalError: unknown;
try {
  const admin1 = await makeUser('admin1');
  const admin2 = await makeUser('admin2');
  const student = await makeUser('student');
  for (const user of [admin1, admin2]) {
    const { error } = await service.from('user_roles').insert({ user_id: user.id, role: 'admin' });
    if (error) throw error;
  }
  const { data: demoStudent, error: demoStudentError } = await service
    .from('users')
    .select('id')
    .eq('email', 'student@crimson.ua.edu')
    .single();
  if (demoStudentError) throw demoStudentError;
  await setSwitch(false);

  await step('switch off permits an admin without a factor and asks them to enroll', async () => {
    const signedIn = await auth.signInWithPassword(admin1.email, 'password123');
    expect(signedIn.ok, signedIn.error ?? 'Could not sign in admin1');
    const status = await auth.mfa.status();
    expect(status.state === 'enroll', `expected enroll state, received ${status.state}`);
    assertAllowed(await probe(getSupabase(), demoStudent.id));
  });

  let enrollment!: Awaited<ReturnType<typeof auth.mfa.enrollTotp>>;
  await step('enrollment supplies an SVG, secret and authenticator URI; repeat enrollment cleans up', async () => {
    const first = await auth.mfa.enrollTotp();
    expect(first.qrSvg.startsWith('<svg'), 'QR data was not decoded to SVG');
    expect(first.secret.length > 0, 'TOTP secret was empty');
    expect(first.uri.startsWith('otpauth://totp/'), 'authenticator URI was invalid');
    enrollment = await auth.mfa.enrollTotp();
    const factors = await auth.mfa.listFactors();
    expect(factors.filter((factor) => factor.type === 'totp').length === 1, 'repeat enrollment left extra TOTP factors');
    const wrongCode = totp(enrollment.secret) === '000000' ? '000001' : '000000';
    const wrong = await auth.mfa.verifyCode(enrollment.factorId, wrongCode);
    expect(!wrong.ok, 'an incorrect authenticator code was accepted');
    const verified = await auth.mfa.verifyCode(enrollment.factorId, totp(enrollment.secret));
    expect(verified.ok, verified.error ?? 'valid authenticator code was refused');
    expect((await auth.mfa.status()).state === 'verified', 'verified enrollment did not produce verified status');
  });

  const admin1PasswordClient = rawClient();
  await step('a fresh password-only session is denied, and core reports a challenge', async () => {
    await signInRaw(admin1PasswordClient, admin1.email);
    assertDenied(await probe(admin1PasswordClient, demoStudent.id));
    const signedIn = await auth.signInWithPassword(admin1.email, 'password123');
    expect(signedIn.ok, signedIn.error ?? 'Could not sign in admin1 again');
    const status = await auth.mfa.status();
    expect(status.state === 'challenge' && status.factorId === enrollment.factorId, `expected challenge for enrolled factor, received ${status.state}`);
  });

  await step('a verified challenge restores admin access', async () => {
    let result = await auth.mfa.verifyCode(enrollment.factorId, totp(enrollment.secret));
    if (!result.ok) {
      await waitForNextTotpWindow();
      result = await auth.mfa.verifyCode(enrollment.factorId, totp(enrollment.secret));
    }
    expect(result.ok, result.error ?? 'challenge was not verified');
    assertAllowed(await probe(getSupabase(), demoStudent.id));
  });

  const admin2Client = rawClient();
  await signInRaw(admin2Client, admin2.email);
  await step('the rollout switch requires every admin and preserves an aal2 session', async () => {
    await setSwitch(true);
    assertDenied(await probe(admin2Client, demoStudent.id));
    assertAllowed(await probe(getSupabase(), demoStudent.id));
    await setSwitch(false);
    assertAllowed(await probe(admin2Client, demoStudent.id));
  });

  const studentClient = rawClient();
  await signInRaw(studentClient, student.email);
  await step('a student is denied with the switch both off and on', async () => {
    await setSwitch(false);
    assertDenied(await probe(studentClient, demoStudent.id));
    await setSwitch(true);
    assertDenied(await probe(studentClient, demoStudent.id));
    await setSwitch(false);
  });

  await step('student and anonymous clients cannot read or update app_settings', async () => {
    for (const [name, client] of [['student', studentClient], ['anonymous', anon]] as const) {
      const { data: rows, error: readError } = await client
        .from('app_settings')
        .select('value')
        .eq('key', 'require_admin_mfa');
      expect(!!readError || (rows?.length ?? 0) === 0, `${name} could read app_settings`);
      const { data: updated, error: updateError } = await client
        .from('app_settings')
        .update({ value: true })
        .eq('key', 'require_admin_mfa')
        .select('key');
      expect(!!updateError || (updated?.length ?? 0) === 0, `${name} changed app_settings`);
    }
    const { data: unchanged, error } = await service
      .from('app_settings')
      .select('value')
      .eq('key', 'require_admin_mfa')
      .single();
    if (error) throw error;
    expect(unchanged.value === false, 'client update changed require_admin_mfa');
  });
} catch (error) {
  fatalError = error;
} finally {
  try {
    await setSwitch(false);
  } catch (error) {
    failed++;
    console.error(`Cleanup FAIL ❌ — could not reset require_admin_mfa: ${error instanceof Error ? error.message : String(error)}`);
  }
  await auth.signOut().catch(() => {});
  for (const client of clients.slice(1)) await client.auth.signOut().catch(() => {});
  for (const id of createdIds) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) {
      failed++;
      console.error(`Cleanup FAIL ❌ — could not delete auth user ${id}: ${error.message}`);
    }
  }
  if (createdIds.length) {
    const { error } = await service.from('users').delete().in('id', createdIds);
    if (error) {
      failed++;
      console.error(`Cleanup FAIL ❌ — could not delete public user rows: ${error.message}`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (fatalError !== undefined || failed > 0) process.exitCode = 1;
