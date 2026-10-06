/**
 * Push the cloud project's auth email settings from source.
 *
 * The Dashboard's email templates and URL configuration are the one part of the backend
 * that isn't covered by migrations, and they had drifted badly: site_url was still
 * http://localhost:3000 and the "Confirm sign up" body was the literal text
 * "Testing Testing Test". This makes supabase/templates/*.html and the constants below
 * the source of truth, so a reviewer never sees localhost in an email again.
 *
 * Reads bodies from supabase/templates/*.html (the same files config.toml points the
 * local stack at, so local and cloud can't drift).
 *
 *   pnpm dlx tsx scripts/push_auth_templates.mts            # show the diff, change nothing
 *   pnpm dlx tsx scripts/push_auth_templates.mts --apply    # write it
 *
 * Needs SUPABASE_ACCESS_TOKEN — `source scripts/dev-env.sh`.
 * The Resend API key is deliberately NOT touched here; it lives only in the Dashboard,
 * so this script can never print or overwrite it.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_REF = readFileSync(resolve(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim();
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const APPLY = process.argv.includes('--apply');

const SITE_URL = 'https://trynoot.com';

/**
 * Two different addresses on purpose:
 * - `smtp_admin_email` is the envelope *sender*, and must be an address Resend has
 *   verified for the trynoot.com domain. Auth mail goes out as support@.
 * - the address users are pointed at for help is admin@ — it's what the in-app
 *   Help & support screen opens (apps/mobile/lib/legal.ts) and what the email
 *   footers in supabase/templates/*.html link to. Changing that one does NOT mean
 *   changing who sends the mail.
 */
const SENDER_EMAIL = 'support@trynoot.com';

/**
 * `noot://**` is the critical entry. The app passes the expo deep link as
 * emailRedirectTo; when it isn't allow-listed GoTrue silently rewrites the link to
 * site_url, which is how confirmation mails ended up pointing at localhost.
 */
const REDIRECT_URLS = [
  'noot://',
  'noot://**',
  'https://trynoot.com',
  'https://trynoot.com/**',
  'http://localhost:8081',
  'http://localhost:8081/**',
];

const TEMPLATES = {
  confirmation: 'Confirm your email address',
  magic_link: 'Your Noot sign-in link',
  recovery: 'Reset your Noot password',
  invite: "You've been invited to Noot",
  email_change: 'Confirm your new email address',
} as const;

const body = (name: string) =>
  readFileSync(resolve(ROOT, `supabase/templates/${name}.html`), 'utf8');

/**
 * The password rule (ERR-014), mirroring `minimum_password_length` and
 * `password_requirements = "lower_upper_letters_digits_symbols"` in supabase/config.toml.
 * The cloud API takes one of a fixed set of strings: the character classes spelled out and
 * colon-separated, with the colon inside the symbol class escaped as `\\:` — so the value
 * sent has two backslashes there, and this literal needs four.
 */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REQUIRED_CHARACTERS =
  'abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:!@#$%^&*()_+-=[]{};\'\\\\:"|<>?,./`~';

const payload: Record<string, string | number> = {
  site_url: SITE_URL,
  uri_allow_list: REDIRECT_URLS.join(','),
  smtp_admin_email: SENDER_EMAIL,
  smtp_sender_name: 'Noot',
  password_min_length: PASSWORD_MIN_LENGTH,
  password_required_characters: PASSWORD_REQUIRED_CHARACTERS,
};
for (const [name, subject] of Object.entries(TEMPLATES)) {
  payload[`mailer_subjects_${name}`] = subject;
  payload[`mailer_templates_${name}_content`] = body(name);
}

const api = async (method: string, init?: RequestInit) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${method} auth config → ${res.status} ${await res.text()}`);
  return res.json() as Promise<Record<string, unknown>>;
};

if (!TOKEN) {
  console.error('SUPABASE_ACCESS_TOKEN is not set — run `source scripts/dev-env.sh` first.');
  process.exit(1);
}

const before = await api('GET');
console.log(`project ${PROJECT_REF}\n`);
let changed = 0;
for (const [key, next] of Object.entries(payload)) {
  const prev = String(before[key] ?? '');
  if (prev === String(next)) continue;
  changed++;
  const short = (s: string) => (s.length > 70 ? `${s.slice(0, 70).replace(/\n/g, ' ')}…` : s);
  console.log(`~ ${key}\n    from: ${short(prev) || '(empty)'}\n      to: ${short(String(next))}`);
}
if (!changed) {
  console.log('already in sync — nothing to do.');
} else if (!APPLY) {
  console.log(`\n${changed} field(s) would change. Re-run with --apply to write.`);
} else {
  await api('PATCH', { body: JSON.stringify(payload) });
  console.log(`\napplied ${changed} field(s).`);
}
