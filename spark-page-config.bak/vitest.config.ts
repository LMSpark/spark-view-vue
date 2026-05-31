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
      { find: /^@spark-view\/spark-ai\/json$/, replacement: resolve(__dirname, '../spark-ai/src/json/index.ts') },
      { find: /^@spark-view\/spark-ai\/agent$/, replacement: resolve(__dirname, '../spark-ai/src/agent/index.ts') },
      { find: /^@spark-view\/spark-ai\/modules$/, replacement: resolve(__dirname, '../spark-ai/src/modules/index.ts') },
      { find: /^@spark-view\/spark-data$/, replacement: resolve(__dirname, '../spark-data/src/index.ts') },
      { find: /^@spark-view\/spark-utils$/, replacement: resolve(__dirname, '../spark-utils/src/index.ts') },
      { find: /^@spark-view\/spark-page-config$/, replacement: resolve(__dirname, './src/index.ts') },
      { find: /^@spark-view\/spark-page-config\/project$/, replacement: resolve(__dirname, './src/project.ts') },
      { find: /^@spark-view\/spark-page-config\/json-document$/, replacement: resolve(__dirname, './src/json-document-public.ts') },
      { find: /^@spark-view\/spark-component\/runtime$/, replacement: resolve(__dirname, '../spark-component/src/runtime/index.ts') },
      { find: /^@spark-view\/spark-page-config\/ai$/, replacement: resolve(__dirname, './src/ai.ts') },
      { find: /^@spark-view\/spark-page-config\/leave-request$/, replacement: resolve(__dirname, './src/leave-request/index.ts') },
    ]
  }
})
