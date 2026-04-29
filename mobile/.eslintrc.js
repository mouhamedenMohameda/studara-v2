/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  rules: {
    // React 17+ — no need to import React in scope
    'react/react-in-jsx-scope': 'off',
    // Warn on `any`, don't block CI
    '@typescript-eslint/no-explicit-any': 'warn',
    // Unused vars — ignore args prefixed with _
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Hooks rules — errors not warnings
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // Allow empty catch blocks
    'no-empty': ['warn', { allowEmptyCatch: false }],
    // No console.log in production code
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  settings: {
    react: { version: 'detect' },
  },
  env: {
    browser: false,
    es2021: true,
    'react-native/react-native': true,
  },
  ignorePatterns: ['node_modules/', 'dist/', '.expo/', 'babel.config.js'],
};
