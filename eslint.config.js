import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/build/**', '**/generated/**', '**/node_modules/**', '**/out/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Type-aware linting for application/library source. Scoped to `src` (the
    // only path each workspace's tsconfig includes) so config files such as
    // vite.config.ts aren't pulled into the type-checked program. `projectService`
    // finds the nearest tsconfig.json per file, covering the whole monorepo.
    files: ['**/src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // TypeScript handles undefined-symbol checking; the core rule misfires on
    // ambient globals and type-only names.
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    files: ['apps/client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // eslint-plugin-react-hooks v7 added these React-Compiler-oriented rules to
      // its recommended set. They flag legitimate, deliberate patterns we rely on
      // (syncing incoming server/prop state into local state via effects, and the
      // stepped-animation ref). Keep the core hooks rules, opt out of these two.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },
  {
    files: ['apps/server/**/*.ts', 'packages/shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['apps/desktop/**/*.cjs', 'apps/desktop/scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
