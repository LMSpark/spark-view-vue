import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: [
      { find: /^@spark-appworks\/spark-data$/, replacement: resolve(__dirname, '../spark-data/src/index.ts') },
      { find: /^@spark-appworks\/spark-utils$/, replacement: resolve(__dirname, '../spark-utils/src/index.ts') },
      { find: /^@spark-appworks\/spark-utils\/internal$/, replacement: resolve(__dirname, '../spark-utils/dist/internal/index.js') },
      { find: /^@spark-appworks\/spark-project-model$/, replacement: resolve(__dirname, './src/index.ts') },
      { find: /^@spark-appworks\/spark-project-model\/project$/, replacement: resolve(__dirname, './src/project.ts') },
      { find: /^@spark-appworks\/spark-component\/runtime$/, replacement: resolve(__dirname, '../spark-component/src/runtime/index.ts') },
    ],
  },
})
