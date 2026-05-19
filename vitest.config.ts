import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'packages/**/src/tests/**/*.test.ts'],
    setupFiles: ['./tests/vitest-setup.ts']
  },
  resolve: {
    alias: {
      '@': resolve(root, './src'),
      'virtual:spark-skill-catalog': resolve(root, './tests/mocks/virtual-spark-skill-catalog.ts'),
      'virtual:spark-components': resolve(root, './tests/mocks/virtual-spark-components.ts'),
      // 所有包 → 源码解析（测试不应依赖构建产物）
      '@spark-view/spark-component': resolve(root, './packages/spark-component/src/index.ts'),
      '@spark-view/spark-utils': resolve(root, './packages/spark-utils/src/index.ts'),
      '@spark-view/spark-data': resolve(root, './packages/spark-data/src/index.ts'),
      '@spark-view/spark-page-config': resolve(root, './packages/spark-page-config/src/index.ts'),
      '@spark-view/spark-app': resolve(root, './packages/spark-app/src/index.ts'),
      '@spark-view/spark-ai/services/page-design': resolve(root, './packages/spark-ai/src/services/page-design/index.ts'),
      '@spark-view/spark-ai/services': resolve(root, './packages/spark-ai/src/services/index.ts'),
      '@spark-view/spark-ai/registrations/page-design/payloads': resolve(root, './packages/spark-ai/src/registrations/page-design/payloads/index.ts'),
      '@spark-view/spark-ai/registrations': resolve(root, './packages/spark-ai/src/registrations/index.ts'),
      '@spark-view/spark-ai/host': resolve(root, './packages/spark-ai/src/core/host/index.ts'),
      '@spark-view/spark-ai': resolve(root, './packages/spark-ai/src/index.ts'),
      '@spark-view/vite-plugin-spark-catalog': resolve(root, './packages/vite-plugin-spark-catalog/src/index.ts')
    }
  },
  esbuild: {
    target: 'node14'
  }
})
