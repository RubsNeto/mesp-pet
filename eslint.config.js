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
      '**/*.cjs',
      'gen-icons.cjs',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Scripts CommonJS rodados pelo Node diretamente (sem transpilação): permitem require().
  {
    files: ['scripts/**/*.{cjs,js}', 'tests/**/*.cjs', '**/*.cjs', 'gen-icons.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  // Userscript Tampermonkey + content script de extensão de browser: rodam no
  // navegador (não no app Electron). Habilita globals de browser/greasemonkey.
  {
    files: ['21st-dev-scroll.user.js', '21st-scroll-extension/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        GM_addStyle: 'readonly',
        GM: 'readonly',
      },
    },
  },
  // `landing/` é um projeto Next.js separado, com tooling/lint próprios; o lint
  // da raiz não deve descer nele (especialmente em artefatos de build .next).
  { ignores: ['dist', 'dist-electron', 'release', 'node_modules', 'sprites_extracted', 'landing'] },
);
