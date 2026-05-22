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
      '@spark-view/spark-page-config/page': resolve(__dirname, '../spark-page-config/src/page'),
      '@spark-view/spark-page-config/page/model': resolve(__dirname, '../spark-page-config/src/page/model.ts'),
      '@spark-view/spark-page-config/page/loading': resolve(__dirname, '../spark-page-config/src/page/loading.ts'),
      '@spark-view/spark-page-config/capabilities': resolve(__dirname, '../spark-page-config/src/capabilities'),
      '@spark-view/spark-page-config/page/navigation': resolve(__dirname, '../spark-page-config/src/page/navigation.ts'),
      '@spark-view/spark-page-config/page/script-context-types': resolve(__dirname, '../spark-page-config/src/page/script-context-types.ts'),
      '@spark-view/spark-page-config/page/app-services': resolve(__dirname, '../spark-page-config/src/page/app-services.ts'),
      '@spark-view/spark-page-config/registrations': resolve(__dirname, '../spark-page-config/src/registrations/index.ts'),
      '@spark-view/spark-page-config': resolve(__dirname, '../spark-page-config/src/index.ts')
    }
  }
})
