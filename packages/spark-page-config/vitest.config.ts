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
      { find: /^@spark-view\/spark-page-config\/page\/model$/, replacement: resolve(__dirname, './src/page/model.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/loading$/, replacement: resolve(__dirname, './src/page/loading.ts') },
      { find: /^@spark-view\/spark-page-config\/capabilities\/(.+)$/, replacement: resolve(__dirname, './src/capabilities/$1') },
      { find: /^@spark-view\/spark-page-config\/page\/navigation$/, replacement: resolve(__dirname, './src/page/navigation.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/sandbox$/, replacement: resolve(__dirname, './src/page/sandbox.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/services$/, replacement: resolve(__dirname, './src/page/app-services.ts') },
      { find: /^@spark-view\/spark-page-config\/registrations$/, replacement: resolve(__dirname, './src/registrations/index.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/(.+)$/, replacement: resolve(__dirname, './src/page/$1') },
    ]
  }
})
