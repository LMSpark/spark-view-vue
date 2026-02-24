import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@spark-view/spark-page-config': resolve(__dirname, './src/index.ts'),
      '@spark-view/spark-page-config/*': resolve(__dirname, './src/*')
    }
  }
})