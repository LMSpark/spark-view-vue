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
      'virtual:spark-skill-catalog': resolve(__dirname, './tests/mocks/virtual-spark-skill-catalog.ts'),
      'virtual:spark-components': resolve(__dirname, './tests/mocks/virtual-spark-components.ts'),
      // 所有包 → 源码解析（测试不应依赖构建产物）
      '@spark-view/spark-component': resolve(__dirname, './packages/spark-component/src/index.ts'),
      '@spark-view/spark-utils': resolve(__dirname, './packages/spark-utils/src/index.ts'),
      '@spark-view/spark-data': resolve(__dirname, './packages/spark-data/src/index.ts'),
      '@spark-view/spark-page-config': resolve(__dirname, './packages/spark-page-config/src/index.ts'),
      '@spark-view/spark-app': resolve(__dirname, './packages/spark-app/src/index.ts'),
      '@spark-view/spark-ai': resolve(__dirname, './packages/spark-ai/src/index.ts'),
      '@spark-view/vite-plugin-spark-catalog': resolve(__dirname, './packages/vite-plugin-spark-catalog/src/index.ts')
    }
  },
  esbuild: {
    target: 'node14'
  }
})