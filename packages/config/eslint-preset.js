// Shared ESLint preset for the noot monorepo.
//
// GUARDRAIL (ARCHITECTURE.md §9 — Phase 2 impact):
// Only `packages/core` and `supabase/functions` may import the Supabase client
// or the Stripe SDK. Everything else must go through `@noot/core`. This keeps the
// UI migration-agnostic so the AWS migration is a swap, not a rewrite.
//
// The restriction below is applied everywhere; the two allowed locations override
// it back off in their own eslint.config (see packages/core/eslint.config.cjs).

const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const globals = require('globals');

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

module.exports = [
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      '**/node_modules/**',
      '**/*.config.js',
      '**/eslint.config.*',
    ],
  },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.es2022,
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-useless-assignment': 'off',
      'no-restricted-imports': ['error', { patterns: BACKEND_ONLY_IMPORTS }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
