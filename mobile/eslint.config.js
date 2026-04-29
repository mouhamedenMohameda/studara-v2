const path = require('path');
const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

module.exports = [
  // Keep parity with existing `.eslintrc.js` via compat.
  ...compat.extends(
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ),
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
        tsconfigRootDir: __dirname,
        project: [path.join(__dirname, 'tsconfig.json')],
      },
    },
    rules: {
      // React 17+ — no need to import React in scope
      'react/react-in-jsx-scope': 'off',
      // Common in RN components / HOCs
      'react/display-name': 'off',
      // Warn on `any`, don't block CI
      '@typescript-eslint/no-explicit-any': 'warn',
      // Unused vars — ignore args prefixed with _
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Hooks rules — errors not warnings
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Newer react-hooks rules can be noisy in existing code
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Keep non-blocking; fix gradually
      'no-irregular-whitespace': 'warn',
      'prefer-const': 'warn',
      // Allow empty catch blocks
      'no-empty': ['warn', { allowEmptyCatch: false }],
      // No console.log in production code
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', '.expo/**', 'babel.config.js', 'api/**', 'admin/**'],
  },
];

