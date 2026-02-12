import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@spark-view/spark-component': resolve(__dirname, './packages/spark-component/src/index.ts'),
      '@spark-view/spark-component/*': resolve(__dirname, './packages/spark-component/src/*'),
      '@spark-view/spark-utils': resolve(__dirname, './packages/spark-utils/src/index.ts'),
      '@spark-view/spark-utils/*': resolve(__dirname, './packages/spark-utils/src/*'),
      '@spark-view/spark-data': resolve(__dirname, './packages/spark-data/src/index.ts'),
      '@spark-view/spark-data/*': resolve(__dirname, './packages/spark-data/src/*')
    }
  },
  esbuild: {
    target: 'node14'
  }
})