import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts']
  },
  resolve: {
    alias: [
      { find: /^@spark-view\/spark-ai$/, replacement: resolve(__dirname, '../spark-ai/src/index.ts') },
      { find: /^@spark-view\/spark-ai\/schema$/, replacement: resolve(__dirname, '../spark-ai/src/schema/index.ts') },
      { find: /^@spark-view\/spark-ai\/host$/, replacement: resolve(__dirname, '../spark-ai/src/host/index.ts') },
      { find: /^@spark-view\/spark-ai\/module-semantic$/, replacement: resolve(__dirname, '../spark-ai/src/module-semantic/index.ts') },
      { find: /^@spark-view\/spark-data$/, replacement: resolve(__dirname, '../spark-data/src/index.ts') },
      { find: /^@spark-view\/spark-utils$/, replacement: resolve(__dirname, '../spark-utils/src/index.ts') },
      { find: /^@spark-view\/spark-page-config$/, replacement: resolve(__dirname, './src/index.ts') },
      { find: /^@spark-view\/spark-page-config\/config$/, replacement: resolve(__dirname, './src/config/index.ts') },
      { find: /^@spark-view\/spark-page-config\/node-tree$/, replacement: resolve(__dirname, './src/node-tree/index.ts') },
      { find: /^@spark-view\/spark-page-config\/navigation$/, replacement: resolve(__dirname, './src/navigation/index.ts') },
      { find: /^@spark-view\/spark-page-config\/runtime$/, replacement: resolve(__dirname, './src/runtime/index.ts') },
      { find: /^@spark-view\/spark-page-config\/json-document$/, replacement: resolve(__dirname, './src/json-document/index.ts') },
      { find: /^@spark-view\/spark-page-config\/design$/, replacement: resolve(__dirname, './src/design/index.ts') },
      { find: /^@spark-view\/spark-page-config\/ai$/, replacement: resolve(__dirname, './src/ai/index.ts') },
      { find: /^@spark-view\/spark-page-config\/ai\/payloads\/component-catalog\.json$/, replacement: resolve(__dirname, './src/ai/payloads/component-catalog.json') },
    ]
  }
})
