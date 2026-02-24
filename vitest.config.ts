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
      '@/features/spark-ej2': resolve(__dirname, './features/spark-ej2'),
      // 安装方式：根测试环境通过 dist 解析 @spark-view/*（不引用 src/）
      '@spark-view/spark-utils': resolve(__dirname, './packages/spark-utils/dist/index.js'),
      '@spark-view/spark-data': resolve(__dirname, './packages/spark-data/dist/index.js'),
      '@spark-view/spark-component': resolve(__dirname, './packages/spark-component/dist/index.js'),
      '@spark-view/spark-page-config': resolve(__dirname, './packages/spark-page-config/dist/index.js'),
      '@spark-view/spark-app': resolve(__dirname, './packages/spark-app/dist/index.js')
    }
  },
  esbuild: {
    target: 'node14'
  }
})