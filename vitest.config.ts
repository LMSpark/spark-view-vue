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
      '@spark-view/spark-core': resolve(__dirname, './packages/spark-core/src/index.ts'),
      '@spark-view/spark-core/*': resolve(__dirname, './packages/spark-core/src/*')
    }
  }
})