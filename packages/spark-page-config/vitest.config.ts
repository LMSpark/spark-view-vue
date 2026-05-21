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
      { find: /^@spark-view\/spark-ai\/protocol$/, replacement: resolve(__dirname, '../spark-ai/src/protocol/index.ts') },
      { find: /^@spark-view\/spark-ai\/core$/, replacement: resolve(__dirname, '../spark-ai/src/index.ts') },
      { find: /^@spark-view\/spark-ai\/host$/, replacement: resolve(__dirname, '../spark-ai/src/host/index.ts') },
      { find: /^@spark-view\/spark-ai\/module-semantic$/, replacement: resolve(__dirname, '../spark-ai/src/module-semantic/index.ts') },
      { find: /^@spark-view\/spark-data$/, replacement: resolve(__dirname, '../spark-data/src/index.ts') },
      { find: /^@spark-view\/spark-utils$/, replacement: resolve(__dirname, '../spark-utils/src/index.ts') },
      { find: /^@spark-view\/spark-page-config$/, replacement: resolve(__dirname, './src/index.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/model$/, replacement: resolve(__dirname, './src/page/model/index.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/loading$/, replacement: resolve(__dirname, './src/page/loading/index.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/workspace$/, replacement: resolve(__dirname, './src/page/workspace/index.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/navigation$/, replacement: resolve(__dirname, './src/page/navigation/index.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/sandbox$/, replacement: resolve(__dirname, './src/page/sandbox/index.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/services$/, replacement: resolve(__dirname, './src/page/services/index.ts') },
      { find: /^@spark-view\/spark-page-config\/assistant\/registrations$/, replacement: resolve(__dirname, './src/assistant/registrations/index.ts') },
    ]
  }
})
