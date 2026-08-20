import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['.git/**', 'node_modules/**', 'tmp/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none' }]
    }
  }
];
