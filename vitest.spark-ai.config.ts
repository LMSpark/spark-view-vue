import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(root, './src'),
      '@spark-view/spark-ai/services/page-design': resolve(root, './packages/spark-ai/src/services/page-design/index.ts'),
      '@spark-view/spark-ai/services': resolve(root, './packages/spark-ai/src/services/index.ts'),
      '@spark-view/spark-ai/registrations/page-design/payloads': resolve(root, './packages/spark-ai/src/registrations/page-design/payloads/index.ts'),
      '@spark-view/spark-ai': resolve(root, './packages/spark-ai/src/index.ts'),
      '@spark-view/spark-component': resolve(root, './packages/spark-component/src/index.ts'),
      '@spark-view/spark-data': resolve(root, './packages/spark-data/src/index.ts'),
      '@spark-view/spark-utils': resolve(root, './packages/spark-utils/src/index.ts'),
      '@spark-view/spark-page-config': resolve(root, './packages/spark-page-config/src/index.ts'),
      '@spark-view/spark-app': resolve(root, './packages/spark-app/src/index.ts'),
    },
  },
})
