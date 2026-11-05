const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  { ignores: ['e2e/report/**', 'e2e/results/**'] },
  ...require('@noot/config'),
  reactHooks.configs.flat.recommended,
  {
    rules: {
      // React Compiler rules from react-hooks 7, warn until the flagged code is fixed.
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // The web stand-in for the native PaymentSheet SDK: Stripe.js is its web equivalent
    // (on-device UI holding only the publishable key), so the same exception applies.
    files: ['web/stripe-react-native.tsx'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{
        group: ['@supabase/*'],
        message: 'Import Supabase only inside packages/core or supabase/functions. Elsewhere, use @noot/core.',
      }] }],
    },
  },
];
