import globals from 'globals';

export default [
  { ignores: ['dist/', 'node_modules/', '.icon-cache/'] },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }]
    }
  },
  {
    files: ['scripts/**', 'vite.config.js', 'eslint.config.js', 'test/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['scripts/sw-template.js'],
    languageOptions: { globals: { ...globals.serviceworker, __FILES__: 'readonly' } }
  }
];
