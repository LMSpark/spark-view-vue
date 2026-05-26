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
      '@spark-view/spark-page-config/config': resolve(__dirname, '../spark-page-config/src/config/index.ts'),
      '@spark-view/spark-page-config/node-tree': resolve(__dirname, '../spark-page-config/src/node-tree/index.ts'),
      '@spark-view/spark-page-config/navigation': resolve(__dirname, '../spark-page-config/src/navigation/index.ts'),
      '@spark-view/spark-page-config/runtime': resolve(__dirname, '../spark-page-config/src/runtime/index.ts'),
      '@spark-view/spark-page-config/json-document': resolve(__dirname, '../spark-page-config/src/json-document/index.ts'),
      '@spark-view/spark-page-config/design': resolve(__dirname, '../spark-page-config/src/design/index.ts'),
      '@spark-view/spark-page-config/ai': resolve(__dirname, '../spark-page-config/src/ai/index.ts'),
      '@spark-view/spark-page-config/ai/payloads/component-catalog.json': resolve(__dirname, '../spark-page-config/src/ai/payloads/component-catalog.json'),
      '@spark-view/spark-page-config': resolve(__dirname, '../spark-page-config/src/index.ts')
    }
  }
})

