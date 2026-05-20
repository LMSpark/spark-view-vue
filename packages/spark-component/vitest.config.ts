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
      '@spark-view/spark-utils': resolve(__dirname, '../spark-utils/src/index.ts'),
      '@spark-view/spark-utils/*': resolve(__dirname, '../spark-utils/src/*'),
      '@spark-view/spark-data': resolve(__dirname, '../spark-data/src/index.ts'),
      '@spark-view/spark-page-config/page/model': resolve(__dirname, '../spark-page-config/src/page/model/index.ts'),
      '@spark-view/spark-page-config/page/loading': resolve(__dirname, '../spark-page-config/src/page/loading/index.ts'),
      '@spark-view/spark-page-config/page/workspace': resolve(__dirname, '../spark-page-config/src/page/workspace/index.ts'),
      '@spark-view/spark-page-config/page/navigation': resolve(__dirname, '../spark-page-config/src/page/navigation/index.ts'),
      '@spark-view/spark-page-config/page/sandbox': resolve(__dirname, '../spark-page-config/src/page/sandbox/index.ts'),
      '@spark-view/spark-page-config/page/services': resolve(__dirname, '../spark-page-config/src/page/services/index.ts'),
      '@spark-view/spark-page-config/assistant/registrations': resolve(__dirname, '../spark-page-config/src/assistant/registrations/index.ts'),
      '@spark-view/spark-page-config': resolve(__dirname, '../spark-page-config/src/index.ts')
    }
  }
})
