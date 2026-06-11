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
      '@spark-appworks/spark-component': path.resolve(root, 'packages', 'spark-component', 'src', 'index.ts'),
      '@spark-appworks/spark-data': path.resolve(root, 'packages', 'spark-data', 'src', 'index.ts'),
      '@spark-appworks/spark-utils': path.resolve(root, 'packages', 'spark-utils', 'src', 'index.ts'),
      '@spark-appworks/spark-project-model': path.resolve(root, 'packages', 'spark-project-model', 'src', 'index.ts'),
      '@spark-appworks/spark-app': path.resolve(root, 'packages', 'spark-app', 'src', 'index.ts'),
      '@spark-appworks/spark-ai/json': path.resolve(root, 'packages', 'spark-ai', 'src', 'json', 'index.ts'),
      '@spark-appworks/spark-ai/agent': path.resolve(root, 'packages', 'spark-ai', 'src', 'agent', 'index.ts'),
      '@spark-appworks/spark-ai/class-model': path.resolve(root, 'packages', 'spark-ai', 'src', 'class-model', 'index.ts'),
      '@spark-appworks/spark-ai': path.resolve(root, 'packages', 'spark-ai', 'src', 'index.ts'),
    },
  },
  optimizeDeps: {
    include: ['vxe-table'],
  },
  server: {
    port: 5273,
    strictPort: true,
    fs: {
      allow: ['..', '../../src'],
    },
    proxy: {
      '/api': {
        target: process.env.AI_BACKEND_URL ?? 'http://127.0.0.1:8180',
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
