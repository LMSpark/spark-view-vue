import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

function sparkVirtualModulesPlugin() {
  const modules = new Map([
    [
      'virtual:spark-components',
      `
export function registerComponents() {
  return { total: 0, sync: 0, async: 0 }
}
export function getComponentMetadata() {
  return []
}
`,
    ],
    [
      'virtual:spark-skill-catalog',
      `
export const skillCatalog = []
export default skillCatalog
`,
    ],
  ])
  const prefix = '\0codex-dev:'
  return {
    name: 'codex-dev-spark-virtual-modules',
    resolveId(id) {
      if (modules.has(id)) return `${prefix}${id}`
      return null
    },
    load(id) {
      if (!id.startsWith(prefix)) return null
      return modules.get(id.slice(prefix.length)) ?? null
    },
  }
}

export default defineConfig({
  cacheDir: process.env.VITE_CACHE_DIR ?? path.resolve(root, 'node_modules', '.vite-codex'),
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@spark-view/spark-component': path.resolve(root, 'packages', 'spark-component', 'src', 'index.ts'),
      '@spark-view/spark-data': path.resolve(root, 'packages', 'spark-data', 'src', 'index.ts'),
      '@spark-view/spark-utils': path.resolve(root, 'packages', 'spark-utils', 'src', 'index.ts'),
      '@spark-view/spark-page-config/capabilities/': path.resolve(root, 'packages', 'spark-page-config', 'src', 'capabilities') + path.sep,
      '@spark-view/spark-page-config/page/model': path.resolve(root, 'packages', 'spark-page-config', 'src', 'page', 'model.ts'),
      '@spark-view/spark-page-config/page/loading': path.resolve(root, 'packages', 'spark-page-config', 'src', 'page', 'loading.ts'),
      '@spark-view/spark-page-config/capabilities/': path.resolve(root, 'packages', 'spark-page-config', 'src', 'capabilities') + path.sep,
      '@spark-view/spark-page-config/page/sandbox': path.resolve(root, 'packages', 'spark-page-config', 'src', 'page', 'sandbox.ts'),
      '@spark-view/spark-page-config/page': path.resolve(root, 'packages', 'spark-page-config', 'src', 'page'),
      '@spark-view/spark-page-config/registrations': path.resolve(root, 'packages', 'spark-page-config', 'src', 'assistant', 'registrations', 'index.ts'),
      '@spark-view/spark-page-config/assistant': path.resolve(root, 'packages', 'spark-page-config', 'src', 'assistant', 'index.ts'),
      '@spark-view/spark-page-config': path.resolve(root, 'packages', 'spark-page-config', 'src', 'index.ts'),
      '@spark-view/spark-app': path.resolve(root, 'packages', 'spark-app', 'src', 'index.ts'),
      '@spark-view/spark-ai/schema': path.resolve(root, 'packages', 'spark-ai', 'src', 'schema', 'index.ts'),
      '@spark-view/spark-ai/host': path.resolve(root, 'packages', 'spark-ai', 'src', 'host', 'index.ts'),
      '@spark-view/spark-ai/module-semantic': path.resolve(root, 'packages', 'spark-ai', 'src', 'module-semantic', 'index.ts'),
      '@spark-view/spark-ai': path.resolve(root, 'packages', 'spark-ai', 'src', 'index.ts'),
    },
  },
  optimizeDeps: {
    include: ['vxe-table'],
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: ['..', '../../src'],
    },
    proxy: {
      '/api': {
        target: process.env.AI_BACKEND_URL ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [
    vue({ include: /\.(vue)$/ }),
    sparkVirtualModulesPlugin(),
  ],
})
