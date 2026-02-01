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
      'vitest.config.ts',
      'mocks/**'  // Mock 数据不参与 lint 检查
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
      '@typescript-eslint/no-explicit-any': 'warn', // 警告 any，但允许（核心库需要）
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn', // 警告非空断言
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off', // 关闭，TypeScript 推断足够
      '@typescript-eslint/explicit-module-boundary-types': 'off', // 关闭，TypeScript 推断足够
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
      'no-throw-literal': 'error'
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
