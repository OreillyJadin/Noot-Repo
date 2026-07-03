// Shared ESLint preset for the noot monorepo.
//
// GUARDRAIL (ARCHITECTURE.md §9 — Phase 2 impact):
// Only `packages/core` and `supabase/functions` may import the Supabase client
// or the Stripe SDK. Everything else must go through `@noot/core`. This keeps the
// UI migration-agnostic so the AWS migration is a swap, not a rewrite.
//
// The restriction below is applied everywhere; the two allowed locations override
// it back off in their own .eslintrc (see packages/core/.eslintrc.js).

const BACKEND_ONLY_IMPORTS = [
  {
    group: ['@supabase/*', '@supabase/supabase-js'],
    message:
      'Import Supabase only inside packages/core or supabase/functions. Elsewhere, use @noot/core.',
  },
  {
    group: ['stripe', 'stripe/*', '@stripe/stripe-js', '@stripe/*'],
    message:
      'Import Stripe only inside packages/core or supabase/functions. Elsewhere, use @noot/core.',
  },
];

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { es2022: true, node: true, browser: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  ignorePatterns: ['dist/', '.next/', '.expo/', 'node_modules/', '*.config.js'],
  rules: {
    'no-restricted-imports': ['error', { patterns: BACKEND_ONLY_IMPORTS }],
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  // Re-export so packages/core can turn the guardrail off for itself.
  overrides: [],
};

module.exports.BACKEND_ONLY_IMPORTS = BACKEND_ONLY_IMPORTS;
