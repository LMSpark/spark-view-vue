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
      { find: /^@spark-view\/spark-ai\/json$/, replacement: resolve(__dirname, '../spark-ai/src/json/index.ts') },
      { find: /^@spark-view\/spark-ai\/agent$/, replacement: resolve(__dirname, '../spark-ai/src/agent/index.ts') },
      { find: /^@spark-view\/spark-ai\/modules$/, replacement: resolve(__dirname, '../spark-ai/src/modules/index.ts') },
      { find: /^@spark-view\/spark-ai$/, replacement: resolve(__dirname, '../spark-ai/src/index.ts') },
      { find: /^@spark-view\/spark-utils$/, replacement: resolve(__dirname, '../spark-utils/src/index.ts') },
      { find: /^@spark-view\/spark-data$/, replacement: resolve(__dirname, '../spark-data/src/index.ts') },
      { find: /^@spark-view\/spark-project-model$/, replacement: resolve(__dirname, '../spark-project-model/src/index.ts') },
      { find: /^@spark-view\/spark-project-model\/project$/, replacement: resolve(__dirname, '../spark-project-model/src/project.ts') },
      { find: /^@spark-view\/spark-project-model\/ai$/, replacement: resolve(__dirname, '../spark-project-model/src/ai.ts') },
      { find: /^@spark-view\/spark-json-document$/, replacement: resolve(__dirname, '../spark-json-document/src/index.ts') },
      { find: /^@spark-view\/spark-app$/, replacement: resolve(__dirname, './src/index.ts') },
      { find: /^@spark-view\/spark-app\/(.*)$/, replacement: resolve(__dirname, './src/$1') },
    ]
  }
})
