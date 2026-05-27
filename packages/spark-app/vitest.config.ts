import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts']
  },
  resolve: {
    alias: [
      { find: /^@spark-view\/spark-ai\/json$/, replacement: resolve(__dirname, '../spark-ai/src/json/index.ts') },
      { find: /^@spark-view\/spark-ai\/agent$/, replacement: resolve(__dirname, '../spark-ai/src/agent/index.ts') },
      { find: /^@spark-view\/spark-ai\/modules$/, replacement: resolve(__dirname, '../spark-ai/src/modules/index.ts') },
      { find: /^@spark-view\/spark-ai$/, replacement: resolve(__dirname, '../spark-ai/src/index.ts') },
      { find: /^@spark-view\/spark-utils$/, replacement: resolve(__dirname, '../spark-utils/src/index.ts') },
      { find: /^@spark-view\/spark-data$/, replacement: resolve(__dirname, '../spark-data/src/index.ts') },
      { find: /^@spark-view\/spark-page-config$/, replacement: resolve(__dirname, '../spark-page-config/src/index.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/model$/, replacement: resolve(__dirname, '../spark-page-config/src/page/model.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/loading$/, replacement: resolve(__dirname, '../spark-page-config/src/page/loading.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/workspace$/, replacement: resolve(__dirname, '../spark-page-config/src/capabilities/index.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/navigation$/, replacement: resolve(__dirname, '../spark-page-config/src/page/navigation.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/sandbox$/, replacement: resolve(__dirname, '../spark-page-config/src/page/script-context-types.ts') },
      { find: /^@spark-view\/spark-page-config\/page\/services$/, replacement: resolve(__dirname, '../spark-page-config/src/page/app-services.ts') },
      { find: /^@spark-view\/spark-page-config\/assistant\/registrations$/, replacement: resolve(__dirname, '../spark-page-config/src/registrations/index.ts') },
      { find: /^@spark-view\/spark-app$/, replacement: resolve(__dirname, './src/index.ts') },
      { find: /^@spark-view\/spark-app\/(.*)$/, replacement: resolve(__dirname, './src/$1') },
    ]
  }
})
