// ESLint flat config. Run with `npm run lint`; not yet a CI gate, because the
// existing code has not been cleaned up against it.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/', 'overlay-site/', 'node_modules/', 'public/head-tracking/', '.venv/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'site/**/*.js', 'overlay/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // JSX element names count as use, so React components are not reported unused.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}', 'tests/**/*.mjs', 'test-js/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  },
];
