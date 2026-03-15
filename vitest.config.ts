import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/vitest-setup.ts']
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/features/spark-ej2': resolve(__dirname, './src/features/spark-ej2'),
      // spark-component → 源码解析（含 Vue SFC，dist 不适合测试直接引用组件源码）
      '@spark-view/spark-component': resolve(__dirname, './packages/spark-component/src/index.ts'),
      // 纯 TS 包 → dist 解析
      '@spark-view/spark-utils': resolve(__dirname, './packages/spark-utils/dist/index.js'),
      '@spark-view/spark-data': resolve(__dirname, './packages/spark-data/dist/index.js'),
      '@spark-view/spark-page-config': resolve(__dirname, './packages/spark-page-config/dist/index.js'),
      '@spark-view/spark-app': resolve(__dirname, './packages/spark-app/dist/index.js'),
      '@spark-view/spark-ai': resolve(__dirname, './packages/spark-ai/src/index.ts')
    }
  },
  esbuild: {
    target: 'node14'
  }
})