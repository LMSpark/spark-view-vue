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
    include: ['tests/**/*.test.ts', 'packages/**/src/tests/**/*.test.ts', 'packages/**/tests/**/*.test.ts'],
    setupFiles: ['./tests/vitest-setup.ts']
  },
  resolve: {
    alias: {
      '@': resolve(root, './src'),
      'virtual:spark-components': resolve(root, './tests/mocks/virtual-spark-components.ts'),
      // 所有包 → 源码解析（测试不应依赖构建产物）
      '@spark-view/spark-component': resolve(root, './packages/spark-component/src/index.ts'),
      '@spark-view/spark-utils': resolve(root, './packages/spark-utils/src/index.ts'),
      '@spark-view/spark-data': resolve(root, './packages/spark-data/src/index.ts'),
      '@spark-view/spark-page-config/page/model': resolve(root, './packages/spark-page-config/src/page/model.ts'),
      '@spark-view/spark-page-config/page/loading': resolve(root, './packages/spark-page-config/src/page/loading.ts'),
      '@spark-view/spark-page-config/capabilities/': resolve(root, './packages/spark-page-config/src/capabilities') + '/',
      '@spark-view/spark-page-config/page/navigation': resolve(root, './packages/spark-page-config/src/page/navigation.ts'),
      '@spark-view/spark-page-config/page/sandbox': resolve(root, './packages/spark-page-config/src/page/sandbox.ts'),
      '@spark-view/spark-page-config/page/app-services': resolve(root, './packages/spark-page-config/src/page/app-services.ts'),
      '@spark-view/spark-page-config/registrations/payloads/component-catalog.json': resolve(root, './packages/spark-page-config/src/registrations/payloads/component-catalog.json'),
      '@spark-view/spark-page-config/registrations': resolve(root, './packages/spark-page-config/src/registrations/index.ts'),
      '@spark-view/spark-page-config': resolve(root, './packages/spark-page-config/src/index.ts'),
      '@spark-view/spark-app': resolve(root, './packages/spark-app/src/index.ts'),
      '@spark-view/spark-ai/schema': resolve(root, './packages/spark-ai/src/schema/index.ts'),
      '@spark-view/spark-ai/host': resolve(root, './packages/spark-ai/src/host/index.ts'),
      '@spark-view/spark-ai/module-semantic': resolve(root, './packages/spark-ai/src/module-semantic/index.ts'),
      '@spark-view/spark-ai': resolve(root, './packages/spark-ai/src/index.ts'),
      '@spark-view/vite-plugin-spark-catalog': resolve(root, './packages/vite-plugin-spark-catalog/src/index.ts')
    }
  },
  esbuild: {
    target: 'node14'
  }
})
