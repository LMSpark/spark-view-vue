import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/spark-ai/src/tests/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@spark-view/spark-ai/schema': resolve(root, './packages/spark-ai/src/schema/index.ts'),
      '@spark-view/spark-ai/host': resolve(root, './packages/spark-ai/src/host/index.ts'),
      '@spark-view/spark-ai/module-semantic': resolve(root, './packages/spark-ai/src/module-semantic/index.ts'),
      '@spark-view/spark-ai': resolve(root, './packages/spark-ai/src/index.ts'),
      '@spark-view/spark-data': resolve(root, './packages/spark-data/src/index.ts'),
      '@spark-view/spark-utils/internal': resolve(root, './packages/spark-utils/src/internal/index.ts'),
      '@spark-view/spark-utils': resolve(root, './packages/spark-utils/src/index.ts'),
    },
  },
})
