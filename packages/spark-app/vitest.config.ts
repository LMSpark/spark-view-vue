import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts']
  },
  resolve: {
    alias: [
      { find: /^@spark-view\/spark-ai\/core$/, replacement: resolve(__dirname, '../spark-ai/src/core/index.ts') },
      { find: /^@spark-view\/spark-ai\/host$/, replacement: resolve(__dirname, '../spark-ai/src/core/host/index.ts') },
      { find: /^@spark-view\/spark-ai$/, replacement: resolve(__dirname, '../spark-ai/src/index.ts') },
      { find: /^@spark-view\/spark-utils$/, replacement: resolve(__dirname, '../spark-utils/src/index.ts') },
      { find: /^@spark-view\/spark-data$/, replacement: resolve(__dirname, '../spark-data/src/index.ts') },
      { find: /^@spark-view\/spark-page-config$/, replacement: resolve(__dirname, '../spark-page-config/src/index.ts') },
      { find: /^@spark-view\/spark-app$/, replacement: resolve(__dirname, './src/index.ts') },
      { find: /^@spark-view\/spark-app\/(.*)$/, replacement: resolve(__dirname, './src/$1') },
    ]
  }
})
