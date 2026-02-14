import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts']
  },
  resolve: {
    alias: {
      '@spark-view/spark-app': resolve(__dirname, './src/index.ts'),
      '@spark-view/spark-app/*': resolve(__dirname, './src/*'),
      '@spark-view/spark-component': resolve(__dirname, '../spark-component/src/index.ts'),
      '@spark-view/spark-component/*': resolve(__dirname, '../spark-component/src/*'),
      '@spark-view/spark-utils': resolve(__dirname, '../spark-utils/src/index.ts'),
      '@spark-view/spark-utils/*': resolve(__dirname, '../spark-utils/src/*')
    }
  }
})