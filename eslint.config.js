import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Interdit (voir docs/REGLES.md).',
        },
      ],
    },
  },
  {
    // The engine and the pedagogical logic are pure and deterministic (docs/REGLES.md).
    files: ['src/engine/**/*.ts', 'src/learn/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'setTimeout', 'setInterval', 'window', 'document'],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Utiliser l’ordonnanceur virtuel.' },
        { object: 'Math', property: 'random', message: 'Utiliser un générateur injecté.' },
      ],
    },
  },
  { files: ['**/*.js'], extends: [js.configs.recommended], languageOptions: { globals: globals.node } },
);
