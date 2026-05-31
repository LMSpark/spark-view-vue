import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    setupFiles: ['./src/tests/vitest-setup.ts']
  },
  resolve: {
    alias: {
      '@spark-view/spark-component': resolve(__dirname, './src/index.ts'),
      '@spark-view/spark-component/*': resolve(__dirname, './src/*'),
      '@spark-view/spark-utils/internal': resolve(__dirname, '../spark-utils/src/internal/index.ts'),
      '@spark-view/spark-utils': resolve(__dirname, '../spark-utils/src/index.ts'),
      '@spark-view/spark-utils/*': resolve(__dirname, '../spark-utils/src/*'),
      '@spark-view/spark-data': resolve(__dirname, '../spark-data/src/index.ts'),
      '@spark-view/spark-project-model/project': resolve(__dirname, '../spark-project-model/src/project.ts'),
      '@spark-view/spark-project-model/json-document': resolve(__dirname, '../spark-project-model/src/json-document-public.ts'),
      '@spark-view/spark-project-model': resolve(__dirname, '../spark-project-model/src/index.ts'),
      '@spark-view/spark-ai/agent': resolve(__dirname, '../spark-ai/src/agent/index.ts'),
      '@spark-view/spark-ai': resolve(__dirname, '../spark-ai/src/index.ts')
    }
  }
})
