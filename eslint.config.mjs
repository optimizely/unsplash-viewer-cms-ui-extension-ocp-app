import tsParser from '@typescript-eslint/parser';
import uiExtensionsRules from '@zaiusinc/eslint-config-presets/ocp-cms-ui-extensions.mjs';

export default [
  {ignores: ['.pnp.cjs', '.pnp.loader.mjs', '.yarn/**', 'dist/**', 'node_modules/**']},
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    }
  },
  ...uiExtensionsRules
];
