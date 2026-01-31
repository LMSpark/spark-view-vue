import vuePlugin from 'eslint-plugin-vue'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'

export default [
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      '**/*.vue',
      'src/**/*.d.ts',
      'packages/**/*.d.ts',
      'API_SIMPLIFICATION_EXAMPLE.ts',
      'packages/spark-core/tests/**',
      'dist/**',
      'node_modules/**',
      'vitest.config.ts'
    ]
  },
  // Vue SFC files
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.vue'],
        ecmaVersion: 2020,
        sourceType: 'module'
      },
      globals: {
        window: 'readonly',
        document: 'readonly'
      }
    },
    plugins: { vue: vuePlugin },
    rules: {
      'vue/html-self-closing': 'off'
    }
  },
  // Core package restriction: prevent importing concrete UI components into core
  {
    files: ['packages/spark-core/**'],
    rules: {
      'no-restricted-imports': ['error', { 'patterns': ['**/*.vue', '**/features/**'] }]
    }
  },
  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json', './packages/spark-core/tsconfig.json'],
        ecmaVersion: 2020,
        sourceType: 'module'
      },
      globals: {
        node: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      // Disallow direct use of core singletons in consumer code; prefer DI/factories
      'no-restricted-imports': ['error', {
        'paths': [
          { name: '@spark-view/spark-core', importNames: ['componentManager', 'componentRegistry'], message: 'Use createComponentManager/createComponentRegistry or inject the manager via app.provide("sparkManager") instead of importing singletons.' }
        ]
      }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn', // Warn about any types but allow in core library
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
      'prefer-const': 'warn',
      'no-var': 'error'
    }
  },
  // JS files
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module'
    }
  }
]
