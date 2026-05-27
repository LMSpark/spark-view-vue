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
      '@spark-view/spark-page-config/editor': path.resolve(root, 'packages', 'spark-page-config', 'src', 'editor', 'page-editor.ts'),
      '@spark-view/spark-page-config': path.resolve(root, 'packages', 'spark-page-config', 'src', 'index.ts'),
      '@spark-view/spark-app': path.resolve(root, 'packages', 'spark-app', 'src', 'index.ts'),
      '@spark-view/spark-ai/json': path.resolve(root, 'packages', 'spark-ai', 'src', 'json', 'index.ts'),
      '@spark-view/spark-ai/agent': path.resolve(root, 'packages', 'spark-ai', 'src', 'agent', 'index.ts'),
      '@spark-view/spark-ai/modules': path.resolve(root, 'packages', 'spark-ai', 'src', 'modules', 'index.ts'),
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
