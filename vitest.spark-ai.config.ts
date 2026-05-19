import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'tests/app-ai-entry-removal.test.ts',
      'tests/app-ai-runtime.test.ts',
      'tests/ai-chat-widget-persistence.test.ts',
      'tests/ai-panel-store.test.ts',
      'tests/ai-runtime-business.test.ts',
      'tests/ai-runtime-public-api.test.ts',
      'tests/ai-session-cache.test.ts',
      'tests/leave-request-module.test.ts',
      'tests/page-design-business-definition.test.ts',
      'tests/spark-ai-framework-neutral.test.ts',
    ],
    setupFiles: ['./tests/vitest-setup.ts'],
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
