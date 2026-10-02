// Shared ESLint preset for the noot monorepo.
//
// GUARDRAIL (ARCHITECTURE.md §9 — Phase 2 impact):
// Only `packages/core` and `supabase/functions` may import the Supabase client
// or the Stripe SDK. Everything else must go through `@noot/core`. This keeps the
// UI migration-agnostic so the AWS migration is a swap, not a rewrite.
//
// The restriction below is applied everywhere; the two allowed locations override
// it back off in their own .eslintrc (see packages/core/.eslintrc.cjs).

const BACKEND_ONLY_IMPORTS = [
  {
    group: ['@supabase/*', '@supabase/supabase-js'],
    message:
      'Import Supabase only inside packages/core or supabase/functions. Elsewhere, use @noot/core.',
  },
  {
    // The native PaymentSheet SDK is the exception: it's on-device UI that only holds the
    // publishable key, it can't live in packages/core, and it doesn't change with the backend.
    group: ['stripe', 'stripe/*', '@stripe/stripe-js', '@stripe/*', '!@stripe/stripe-react-native'],
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
  // ESLint 8 only lints .js when given a directory (`eslint src`); a files override is what
  // makes it pick up the TypeScript too. Without this the lint run checked almost nothing.
  overrides: [{ files: ['*.ts', '*.tsx'] }],
};
