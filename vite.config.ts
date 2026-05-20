import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { sparkComponentsPlugin } from './tools/vite-plugin-spark-components'
import { sparkCatalogPlugin } from './packages/vite-plugin-spark-catalog/src/index'
import {
  COMPONENT_SCAN_PATTERNS,
  COMPONENT_EXCLUDE_PATTERNS,
  CATALOG_FEATURE_EXCLUDE_PATTERNS,
  SYNC_COMPONENTS,
  ASYNC_COMPONENTS,
  SIZE_THRESHOLD
} from './packages/vite-plugin-spark-catalog/src/index'

const root = fileURLToPath(new URL('.', import.meta.url))
const viteCacheDir = process.env['VITE_CACHE_DIR'] ?? path.resolve(root, 'node_modules', '.vite')

export default defineConfig({
  cacheDir: viteCacheDir,
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      // monorepo 内始终指向 src 源码——Vite 直接编译 TS，无需预构建 dist JS
      // dist 仅包含 .d.ts 类型声明，供外部 npm 消费者使用
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
    }
  },
  optimizeDeps: {
    include: ['vxe-table']
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: ['..', '../../src']
    },
    proxy: {
      // ── API 代理到 Java 后端 ──────────────────────────────────────────
      // 页面配置（routes.json, rule.json 等）、AI 端点全部由 Java 后端管理。
      // AI_BACKEND_URL 指定后端地址（默认 http://localhost:8080）。
      '/api': {
        target: process.env['AI_BACKEND_URL'] ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
        // SSE 端点（/chat/stream、/events）需禁用响应缓冲，否则代理会
        // 把整个流缓冲到连接关闭后才一次性转发，导致前端无法逐 token 接收。
        configure: (proxy) => {
          const isSSE = (url?: string) =>
            url?.includes('/chat/stream') || url?.includes('/turn/stream') || url === '/api/events'
          // 移除 Accept-Encoding 防止后端压缩 SSE（压缩会触发代理缓冲）
          proxy.on('proxyReq', (proxyReq, req) => {
            if (isSSE(req.url)) {
              proxyReq.removeHeader('Accept-Encoding')
            }
          })
          // 标记 SSE 响应不缓冲（Nginx 等反向代理也会读此头）
          proxy.on('proxyRes', (proxyRes, req) => {
            if (isSSE(req.url)) {
              proxyRes.headers['X-Accel-Buffering'] = 'no'
              proxyRes.headers['Cache-Control'] = 'no-cache, no-transform'
            }
          })
        },
      },
    }
  },
  plugins: [
    // ==================== pages-config: 始终由 Java 后端提供 ====================
    // 页面配置（routes.json, rule.json, pagedata.json 等）全部由 Java 后端管理，
    // 种子数据打包在 JAR 内（classpath:seed-pages-config/），服务端完全自包含。
    // 
    // 开发流程：先启动 Java 后端（mvn spring-boot:run），再启动 Vite dev server。
    // Vite proxy 将 /api/* 全部转发到 Java 后端。

    vue({
      include: /\.(vue)$/,
    }),
    
    sparkComponentsPlugin({
      // 使用统一配置源
      patterns: [...COMPONENT_SCAN_PATTERNS],
      syncComponents: [...SYNC_COMPONENTS],
      asyncComponents: [...ASYNC_COMPONENTS],
      sizeThreshold: SIZE_THRESHOLD,
      exclude: [...COMPONENT_EXCLUDE_PATTERNS],
      verbose: false
    } satisfies Parameters<typeof sparkComponentsPlugin>[0]),

    // 📋 组件 Props 目录生成（独立插件）
    sparkCatalogPlugin({
      featurePatterns: [...COMPONENT_SCAN_PATTERNS],
      exclude: [...COMPONENT_EXCLUDE_PATTERNS, ...CATALOG_FEATURE_EXCLUDE_PATTERNS],
    }),
    
    ...(process.env['ANALYZE'] ? [visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true
    })] : [])
  ],
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name
          if (!name) return 'assets/[name]-[hash].[ext]'

          if (/\.(png|jpe?g|gif|svg|ico)$/i.test(name)) {
            return 'images/[name]-[hash].[ext]'
          }
          if (/\.css$/i.test(name)) {
            return 'css/[name]-[hash].[ext]'
          }
          if (/\.(woff2?|ttf|eot)$/i.test(name)) {
            return 'fonts/[name]-[hash].[ext]'
          }
          return 'assets/[name]-[hash].[ext]'
        },
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')

          // Vue核心库
          if (normalizedId.includes('vue/dist') || normalizedId.includes('vue/index') || normalizedId === 'vue') {
            return 'vue-core'
          }
          // Vue Router
          if (normalizedId.includes('vue-router')) {
            return 'vue-router'
          }
          // Element Plus UI库（拆分 runtime / components，避免单块过大）
          if (normalizedId.includes('/node_modules/@element-plus/icons-vue/')) {
            return 'element-plus-icons'
          }
          if (normalizedId.includes('/node_modules/element-plus/')) {
            if (normalizedId.includes('/es/components/')) {
              const componentMatch = normalizedId.match(/\/es\/components\/([^/]+)\//)
              const componentName = componentMatch?.[1]
              if (!componentName) return 'element-plus-components-misc'
              const firstCharCode = componentName.charCodeAt(0)
              if (firstCharCode < 106) return 'element-plus-components-a-i'
              if (firstCharCode < 115) return 'element-plus-components-j-r'
              return 'element-plus-components-s-z'
            }
            if (normalizedId.includes('/es/directives/')) return 'element-plus-directives'
            if (normalizedId.includes('/es/locale/')) return 'element-plus-locale'
            if (
              normalizedId.includes('/es/hooks/')
              || normalizedId.includes('/es/utils/')
            ) {
              return 'element-plus-runtime'
            }
            if (
              normalizedId.includes('/es/constants/')
              || normalizedId.includes('/es/tokens/')
            ) {
              return 'element-plus-tokens'
            }
            if (normalizedId.includes('/es/')) return 'element-plus-core'
            return 'element-plus'
          }


          // ── 智能路由级代码分割 ──
          // 基于文件路径进行更细粒度的分割，提高缓存命中率

          // SPARK packages - 按功能模块分割
          // ⚠️ spark-utils 必须独立 chunk：它是 spark-data 和 spark-component 的共同依赖，
          //    若不单独分配，Rollup 可能将 spark-utils 模块分入 spark-component chunk，
          //    导致 spark-data chunk 反向引用 spark-component chunk（虚假循环依赖）。
          if (normalizedId.includes('packages/spark-utils')) {
            return 'spark-utils'
          }
          if (normalizedId.includes('packages/spark-component')) {
            return 'spark-component'
          }
          if (normalizedId.includes('packages/spark-data')) {
            return 'spark-data'
          }
          if (normalizedId.includes('packages/spark-ai')) {
            return 'spark-ai'
          }
          if (normalizedId.includes('packages/spark-app')) {
            return 'spark-app'
          }
          if (normalizedId.includes('packages/spark-page-config')) {
            return 'spark-config'
          }

          // ── 页面组件懒加载分组 ──
          // 将大型页面组件分组，便于按需加载

          // 数据密集型页面（包含大量图表/表格）
          if (normalizedId.includes('views/app/Dashboard') || normalizedId.includes('views/app/CapabilityDemo')) {
            return 'pages-data-heavy'
          }
          // 配置管理页面
          if (normalizedId.includes('views/tenant/Settings') || normalizedId.includes('views/tenant/TenantConfig')) {
            return 'pages-config'
          }
          // ── 第三方库智能分组 ──

          // 表单和验证库
          if (normalizedId.includes('async-validator') || normalizedId.includes('vxe-table')) {
            return 'vendor-forms'
          }

          // 编辑器生态（CodeMirror / Lezer）
          if (
            normalizedId.includes('/node_modules/@codemirror/')
            || normalizedId.includes('/node_modules/@lezer/')
            || normalizedId.includes('/node_modules/codemirror/')
            || normalizedId.includes('/node_modules/crelt/')
            || normalizedId.includes('/node_modules/w3c-keyname/')
          ) {
            return 'vendor-editor'
          }

          // Markdown 渲染链
          if (
            normalizedId.includes('/node_modules/vue-markdown-render/')
            || normalizedId.includes('/node_modules/markdown-it/')
            || normalizedId.includes('/node_modules/linkify-it/')
            || normalizedId.includes('/node_modules/mdurl/')
            || normalizedId.includes('/node_modules/uc.micro/')
          ) {
            return 'vendor-markdown'
          }

          // JSON 编辑器
          if (
            normalizedId.includes('/node_modules/vanilla-jsoneditor/')
            || normalizedId.includes('/node_modules/svelte-jsoneditor/')
            || normalizedId.includes('/node_modules/jsonrepair/')
          ) {
            return 'vendor-jsoneditor'
          }

          if (normalizedId.includes('/node_modules/html2canvas/')) {
            return 'vendor-canvas'
          }

          // Node modules通用处理
          if (normalizedId.includes('node_modules')) {
            return 'vendor'
          }

          return undefined
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
})
