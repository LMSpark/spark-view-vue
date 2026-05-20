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
      '@spark-view/spark-page-config/page/model': path.resolve(root, 'packages', 'spark-page-config', 'src', 'page', 'model', 'index.ts'),
      '@spark-view/spark-page-config/page/loading': path.resolve(root, 'packages', 'spark-page-config', 'src', 'page', 'loading', 'index.ts'),
      '@spark-view/spark-page-config/page/workspace': path.resolve(root, 'packages', 'spark-page-config', 'src', 'page', 'workspace', 'index.ts'),
      '@spark-view/spark-page-config/page/navigation': path.resolve(root, 'packages', 'spark-page-config', 'src', 'page', 'navigation', 'index.ts'),
      '@spark-view/spark-page-config/page/sandbox': path.resolve(root, 'packages', 'spark-page-config', 'src', 'page', 'sandbox', 'index.ts'),
      '@spark-view/spark-page-config/page': path.resolve(root, 'packages', 'spark-page-config', 'src', 'page', 'index.ts'),
      '@spark-view/spark-page-config/assistant/registrations': path.resolve(root, 'packages', 'spark-page-config', 'src', 'assistant', 'registrations', 'index.ts'),
      '@spark-view/spark-page-config/assistant': path.resolve(root, 'packages', 'spark-page-config', 'src', 'assistant', 'index.ts'),
      '@spark-view/spark-page-config': path.resolve(root, 'packages', 'spark-page-config', 'src', 'index.ts'),
      '@spark-view/spark-app': path.resolve(root, 'packages', 'spark-app', 'src', 'index.ts'),
      '@spark-view/spark-ai/protocol': path.resolve(root, 'packages', 'spark-ai', 'src', 'protocol', 'index.ts'),
      '@spark-view/spark-ai/core': path.resolve(root, 'packages', 'spark-ai', 'src', 'index.ts'),
      '@spark-view/spark-ai/host': path.resolve(root, 'packages', 'spark-ai', 'src', 'host', 'index.ts'),
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
