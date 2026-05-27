import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  // Arquivos que rodam em Node (testes, scripts utilitários, config do
  // electron-main): habilita os globals do node (process, __dirname, ...).
  {
    files: [
      'tests/**/*.{js,mjs,cjs}',
      'scripts/**/*.{js,mjs,cjs}',
      'electron/**/*.{ts,js}',
      '*.config.{js,cjs,mjs,ts}',
      'eslint.config.js',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  { ignores: ['dist', 'dist-electron', 'release', 'node_modules', 'sprites_extracted'] },
);
