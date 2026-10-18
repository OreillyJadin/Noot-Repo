// The one password for every local dev/test account: seed_demo.mjs and the other seeds,
// scripts/verify_*.mts and the e2e helpers. It meets the password rules in
// supabase/config.toml (8+ characters, a lowercase and an uppercase letter, a number and a
// symbol), so the seed and the scripts work on a stack with the committed, strict rules.
// Local/dev only; never use it for a real account.
export const DEV_PASSWORD = 'Noot-dev-2026';
