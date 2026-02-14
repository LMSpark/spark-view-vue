import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts']
  },
  resolve: {
    alias: {
      '@spark-view/spark-renderer': resolve(__dirname, './src/index.ts'),
      '@spark-view/spark-renderer/*': resolve(__dirname, './src/*'),
      '@spark-view/spark-data': resolve(__dirname, '../spark-data/src/index.ts'),
      '@spark-view/spark-data/*': resolve(__dirname, '../spark-data/src/*'),
      '@spark-view/spark-page-config': resolve(__dirname, '../spark-page-config/src/index.ts'),
      '@spark-view/spark-page-config/*': resolve(__dirname, '../spark-page-config/src/*'),
      '@spark-view/spark-utils': resolve(__dirname, '../spark-utils/src/index.ts'),
      '@spark-view/spark-utils/*': resolve(__dirname, '../spark-utils/src/*')
    }
  }
})