// DB-only migration smoke check; no Edge Functions are required.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
if (!['127.0.0.1', 'localhost'].includes(new globalThis.URL(URL).hostname)) {
  throw new Error('verify_booking_request_note_db only runs against local Supabase');
}
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const { data, error } = await admin.from('bookings').select('id,request_note').limit(1);
if (error) throw error;
if (data?.some((booking) => booking.request_note !== null && typeof booking.request_note !== 'string')) {
  throw new Error('bookings.request_note must be nullable text');
}

console.log('✅ bookings.request_note is queryable as nullable text');
