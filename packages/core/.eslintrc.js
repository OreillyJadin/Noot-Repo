// packages/core is the ONE place (besides supabase/functions) allowed to import
// the Supabase client and Stripe SDK directly. Turn the backend-only-import
// guardrail off here. See packages/config/eslint-preset.js (ARCHITECTURE.md §9).
module.exports = {
  extends: ['@noot/config'],
  rules: {
    'no-restricted-imports': 'off',
  },
};
