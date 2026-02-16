import vuePlugin from 'eslint-plugin-vue'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'

export default [
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      'src/**/*.d.ts',
      'packages/**/*.d.ts',
      'packages/**/dist/**',  // 排除所有dist目录
      'API_SIMPLIFICATION_EXAMPLE.ts',
      'packages/spark-component/tests/**',
      'packages/**/tests/**',  // 排除所有包的测试文件
      'tests/**',  // 排除根目录测试文件
      'tools/**',  // 排除工具文件
      'examples/**',  // 排除示例文件
      '**/*.example.ts',  // 排除所有示例文件
      'docs/examples/**',  // 排除文档示例文件
      'dist/**',
      'node_modules/**',
      'vite.config.ts',
      'vitest.config.ts',
      'packages/**/vitest.config.ts'
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
    plugins: { 
      vue: vuePlugin,
      '@typescript-eslint': tsPlugin
    },
    rules: {
      'vue/html-self-closing': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  // Core package restriction: prevent importing concrete UI components into core
  {
    files: ['packages/spark-component/**'],
    rules: {
      'no-restricted-imports': ['error', { 'patterns': ['**/*.vue', '**/features/**'] }]
    }
  },
  // Allow stories to import Vue components
  {
    files: ['packages/spark-component/stories/**'],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  // Storybook config files - skip TypeScript parsing
  {
    files: ['.storybook/**/*'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off'
    }
  },
  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.typecheck.json',
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 2020,
        sourceType: 'module'
      },
      globals: {
        node: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
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
