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
      { find: /^@spark-view\/spark-page-config\/editor$/, replacement: resolve(__dirname, './src/editor/page-editor.ts') },
      { find: /^@spark-view\/spark-page-config\/json-document$/, replacement: resolve(__dirname, './src/json-document-public.ts') },
      { find: /^@spark-view\/spark-component\/runtime$/, replacement: resolve(__dirname, '../spark-component/src/runtime/index.ts') },
      { find: /^@spark-view\/spark-page-config\/design$/, replacement: resolve(__dirname, './src/design/index.ts') },
      { find: /^@spark-view\/spark-page-config\/ai$/, replacement: resolve(__dirname, './src/ai/index.ts') },
      { find: /^@spark-view\/spark-page-config\/ai\/payloads\/component-catalog\.json$/, replacement: resolve(__dirname, './src/ai/payloads/component-catalog.json') },
    ]
  }
})
