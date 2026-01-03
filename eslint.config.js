import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import vuePlugin from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettierConfig from 'eslint-config-prettier';

export default [
  // 全局忽略配置
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
    ],
  },

  // JavaScript/TypeScript 文件配置
  {
    files: ['**/*.js', '**/*.ts', '**/*.mjs'],
    plugins: {
      '@typescript-eslint': tseslint,
    },
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js 全局变量
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'writable',
        // ES2022 全局变量
        globalThis: 'readonly',
        Promise: 'readonly',
        // Browser 全局变量
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        alert: 'readonly',
        fetch: 'readonly',
        IntersectionObserver: 'readonly',
        HTMLElement: 'readonly',
        CustomEvent: 'readonly',
        requestIdleCallback: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...(tseslint.configs?.recommended?.rules || {}),
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Vue 文件配置
  {
    files: ['**/*.vue'],
    plugins: {
      vue: vuePlugin,
      '@typescript-eslint': tseslint,
    },
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsparser,
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        alert: 'readonly',
        fetch: 'readonly',
        IntersectionObserver: 'readonly',
        HTMLElement: 'readonly',
        CustomEvent: 'readonly',
        requestIdleCallback: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      ...(vuePlugin.configs?.['vue3-recommended']?.rules || {}),
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Prettier 配置（禁用冲突规则）
  prettierConfig,
];
