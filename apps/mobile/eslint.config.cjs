const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
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
];
