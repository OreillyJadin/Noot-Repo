// @noot/core — the app's data + auth boundary. UI imports from here; only this
// package (and supabase/functions) may touch Supabase/Stripe directly.
export * from './models';
export * as auth from './auth';
export { api } from './api';
export { initSupabase, getSupabase, type SupabaseConfig } from './supabase';
