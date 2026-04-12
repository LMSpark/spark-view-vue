import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'
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

/**
 * 构建模式
 * - smart: 智能编译时注册（默认，性能最优）
 * - classic: 经典运行时注册（兼容模式）
 */
const BUILD_MODE = process.env['BUILD_MODE'] || 'smart'
const isSmartMode = BUILD_MODE === 'smart'

console.log(`🔧 构建模式: ${BUILD_MODE === 'smart' ? '智能编译时注册 ⚡' : '经典运行时注册 🔄'}`)

export default defineConfig({
  define: {
    __SPARK_CLASSIC_MODE__: JSON.stringify(!isSmartMode),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // monorepo 内始终指向 src 源码——Vite 直接编译 TS，无需预构建 dist JS
      // dist 仅包含 .d.ts 类型声明，供外部 npm 消费者使用
      '@spark-view/spark-component': path.resolve(__dirname, 'packages', 'spark-component', 'src', 'index.ts'),
      '@spark-view/spark-data': path.resolve(__dirname, 'packages', 'spark-data', 'src', 'index.ts'),
      '@spark-view/spark-utils': path.resolve(__dirname, 'packages', 'spark-utils', 'src', 'index.ts'),
      '@spark-view/spark-page-config': path.resolve(__dirname, 'packages', 'spark-page-config', 'src', 'index.ts'),
      '@spark-view/spark-app': path.resolve(__dirname, 'packages', 'spark-app', 'src', 'index.ts'),
      '@spark-view/spark-ai': path.resolve(__dirname, 'packages', 'spark-ai', 'src', 'index.ts'),
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
            url?.includes('/chat/stream') || url === '/api/events'
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
    //
    // 若未设置 AI_BACKEND_URL，仍保留 Mock AI 端点供独立前端调试。
    {
      name: 'spark-mock-ai',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          // 默认走 proxy 到 Java 后端，仅 MOCK_AI=true 时启用内置 mock
          if (!process.env['MOCK_AI']) {
            return next()
          }

          // ── Mock AI 端点（无后端时的开发模式）：POST /api/ai/chat ──
          if (req.method === 'POST' && req.url === '/api/ai/chat') {
            try {
              const body = await new Promise<string>((resolve, reject) => {
                let data = ''
                req.on('data', (chunk: Buffer) => { data += chunk.toString() })
                req.on('end', () => resolve(data))
                req.on('error', reject)
              })
              const payload = JSON.parse(body) as { action?: string; pageId?: string; prompt?: string; feedback?: string; logs?: unknown[] }
              const pid = payload.pageId ?? 'ai-page'
              const prompt = payload.prompt ?? payload.feedback ?? ''
              const action = payload.action ?? 'generate'

              const title = prompt.slice(0, 30) || pid
              const ruleJson = JSON.stringify([
                { type: 'h2', children: [`${title}`] },
                { type: 'el-divider' },
                { type: 'el-table', name: 'mainTable', dataKey: `${pid}@rows`,
                  props: { border: true, stripe: true, highlightCurrentRow: true },
                  children: [
                    { type: 'el-table-column', props: { prop: 'id', label: 'ID', width: 80 } },
                    { type: 'el-table-column', props: { prop: 'name', label: '名称' } },
                    { type: 'el-table-column', props: { prop: 'status', label: '状态', width: 120 } }
                  ]
                },
                { type: 'p', children: [`[mock] action=${action}, prompt="${prompt.slice(0, 60)}"`] }
              ], null, 2)

              const pagedataJson = JSON.stringify({
                dataSetName: pid,
                tables: {
                  [pid]: {
                    tableName: pid,
                    columns: [
                      { name: 'id', type: 'number' },
                      { name: 'name', type: 'string' },
                      { name: 'status', type: 'string' }
                    ],
                    rows: [
                      { id: 1, name: '示例数据 A', status: '正常' },
                      { id: 2, name: '示例数据 B', status: '待处理' },
                      { id: 3, name: '示例数据 C', status: '已完成' }
                    ]
                  }
                }
              }, null, 2)

              const scriptJs = `// AI 生成 (mock) — ${new Date().toISOString()}\nfunction __init__() {\n  console.log('[${pid}] 页面初始化完成')\n}\n`
              const styleCss = `/* AI 生成 (mock) */\n`

              const aiResp = {
                files: {
                  'rule.json': ruleJson,
                  'pagedata.json': pagedataJson,
                  'script.js': scriptJs,
                  'style.css': styleCss,
                },
                explanation: `[Mock AI] 为 "${title}" 生成了包含表格的基础页面`,
                needsIteration: false,
              }

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(aiResp))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(err) }))
            }
            return
          }

          return next()
        })
      }
    },

    vue({
      include: /\.(vue)$/,
    }),
    
    // ✨ 智能模式：编译时组件注册 - 零运行时开销
    // 🔄 经典模式：提供空模块以保持 import 兼容
    ...(isSmartMode ? [
      sparkComponentsPlugin({
        // 使用统一配置源
        patterns: [...COMPONENT_SCAN_PATTERNS],
        syncComponents: [...SYNC_COMPONENTS],
        asyncComponents: [...ASYNC_COMPONENTS],
        sizeThreshold: SIZE_THRESHOLD,
        exclude: [...COMPONENT_EXCLUDE_PATTERNS],
        verbose: false
      } satisfies Parameters<typeof sparkComponentsPlugin>[0])
    ] : [
      // Classic 模式：提供空的 virtual:spark-components 占位模块
      {
        name: 'spark-components-fallback',
        resolveId(id: string) {
          if (id === 'virtual:spark-components') return '\0virtual:spark-components'
          return undefined
        },
        load(id: string) {
          if (id === '\0virtual:spark-components') {
            return `
export function registerComponents() {
  return { total: 0, sync: 0, async: 0 }
}
export function getComponentMetadata() { return [] }
export default registerComponents
`
          }
          return undefined
        }
      }
    ]),

    // 📋 组件 Props 目录生成（独立插件，两种模式均启用）
    sparkCatalogPlugin({
      featurePatterns: [...COMPONENT_SCAN_PATTERNS],
      exclude: [...COMPONENT_EXCLUDE_PATTERNS, ...CATALOG_FEATURE_EXCLUDE_PATTERNS],
    }),
    
    ...(process.env['ANALYZE'] ? [visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true
    }) as unknown as import('vite').Plugin] : [])
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