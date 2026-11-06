// Playwright global setup: get the seeded tutor bookable on the LOCAL stack. A fresh seed
// leaves Sara without Stripe payouts, and booking refuses a tutor whose
// stripe_charges_enabled isn't true (supabase/functions/_shared/booking.ts). With no Stripe key
// on the functions, payment is simulated, so flipping the flag is all a booking needs.
const API = 'http://127.0.0.1:54321';
// The local stack's published service_role JWT (same constant as scripts/e2e_users.mts).
const SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const TUTOR_EMAIL = 'sara@crimson.ua.edu';

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res;
}

export default async function globalSetup() {
  const users = (await (await rest(`users?select=id&email=eq.${encodeURIComponent(TUTOR_EMAIL)}`)).json()) as { id: string }[];
  if (!users[0]) throw new Error(`${TUTOR_EMAIL} not found; run node supabase/seed_demo.mjs first`);
  await rest(`tutor_profiles?user_id=eq.${users[0].id}`, {
    method: 'PATCH',
    body: JSON.stringify({ stripe_charges_enabled: true }),
  });
}
