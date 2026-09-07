import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.wrangler', 'coverage', 'worker-configuration.d.ts']),
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    extends: [js.configs.recommended],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      // strictTypeChecked's default config on this codebase: ~390 errors, dominated by
      // two rules that fire on established, deliberate patterns rather than bugs,
      // `no-confusing-void-expression` on `onClick={() => setX(y)}`-style handlers
      // (68 hits) and `no-unnecessary-condition` on defensive `if (data)` guards ahead
      // of a loading/degraded state that the current prop types don't yet encode as
      // optional (36 hits, repeated across nearly every panel component). Downgraded
      // to warn rather than disabled so real regressions still surface; a follow-up
      // pass should either fix the flagged call sites or tighten the prop types they
      // guard against, then promote both back to 'error'.
      '@typescript-eslint/no-confusing-void-expression': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
    },
  },
  {
    files: ['**/*.tsx'],
    extends: [jsxA11y.flatConfigs.recommended],
  },
  {
    // Pages Functions run in the Workers runtime, using serviceworker-flavored
    // globals, not the browser. react-refresh's export-shape rule doesn't apply here.
    files: ['functions/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        caches: 'readonly',
        KVNamespace: 'readonly',
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Build/test tooling and one-off Node scripts, not shipped to the browser.
    files: ['*.config.{js,ts,mjs}', 'tests/**', 'scripts/**'],
    languageOptions: { globals: globals.node },
    rules: {
      // Tests import untyped `.mjs` scripts and build deliberately loose mocks
      // (fake KV, fake caches.default, partial EventContext objects). The
      // no-unsafe-* family cannot see through those, so it fires on ordinary,
      // correct test code. Production code under src/ and functions/ keeps the
      // rules at error. require-await is off because async producer callbacks
      // are required by the cachedJson contract even when a stub needs no await.
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
])
