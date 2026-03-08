import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'
import fs from 'fs'
import { sparkComponentsPlugin } from './tools/vite-plugin-spark-components'
import {
  COMPONENT_SCAN_PATTERNS,
  COMPONENT_EXCLUDE_PATTERNS,
  SYNC_COMPONENTS,
  ASYNC_COMPONENTS,
  SIZE_THRESHOLD
} from './tools/spark-components-config'

/**
 * 构建模式
 * - smart: 智能编译时注册（默认，性能最优）
 * - classic: 经典运行时注册（兼容模式）
 */
const BUILD_MODE = process.env.BUILD_MODE || 'smart'
const isSmartMode = BUILD_MODE === 'smart'

console.log(`🔧 构建模式: ${BUILD_MODE === 'smart' ? '智能编译时注册 ⚡' : '经典运行时注册 🔄'}`)

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // 开发环境直接指向 src 源码，改动即时生效无需重新构建；生产环境用 dist
      '@spark-view/spark-component': process.env.NODE_ENV === 'production'
        ? path.resolve(__dirname, 'packages', 'spark-component', 'dist', 'index.js')
        : path.resolve(__dirname, 'packages', 'spark-component', 'src', 'index.ts'),
      '@spark-view/spark-data': process.env.NODE_ENV === 'production'
        ? path.resolve(__dirname, 'packages', 'spark-data', 'dist', 'index.js')
        : path.resolve(__dirname, 'packages', 'spark-data', 'src', 'index.ts'),
      '@spark-view/spark-utils': process.env.NODE_ENV === 'production'
        ? path.resolve(__dirname, 'packages', 'spark-utils', 'dist', 'index.js')
        : path.resolve(__dirname, 'packages', 'spark-utils', 'src', 'index.ts'),
      '@spark-view/spark-page-config': process.env.NODE_ENV === 'production'
        ? path.resolve(__dirname, 'packages', 'spark-page-config', 'dist', 'index.js')
        : path.resolve(__dirname, 'packages', 'spark-page-config', 'src', 'index.ts'),
      // spark-app 同样开发走 src
      '@spark-view/spark-app': process.env.NODE_ENV === 'production'
        ? path.resolve(__dirname, 'packages', 'spark-app', 'dist', 'index.js')
        : path.resolve(__dirname, 'packages', 'spark-app', 'src', 'index.ts'),
      '/pages-config': path.resolve(__dirname, 'public', 'pages-config')
    }
  },
  optimizeDeps: {
    include: ['@form-create/element-ui', 'vxe-table']
  },
  server: {
    port: 5173,
    fs: {
      allow: ['..', '../../src']
    },
    proxy: {
      // 代理配置 API 请求到 mock 服务器
      '/api/config': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/api/tenants': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  plugins: [
    // ==================== pages-config 文件服务（FileLoader 协议） ====================
    // 拦截 GET /api/pages-config/** 请求，从 public/pages-config/** 读取文件，
    // 以 { content, timestamp } 格式响应，供 FileLoader 时间戳缓存协议使用。
    // 同时提供 AI 闭环所需的写入 API 和 SSE 变更通知。
    {
      name: 'spark-pages-config-server',
      configureServer(server) {
        // ── SSE 客户端列表（AI 闭环：文件变更通知） ──
        type SseClient = import('http').ServerResponse
        const sseClients: Set<SseClient> = new Set()
        function broadcastChange(pageId: string, file: string): void {
          const data = JSON.stringify({ pageId, file, timestamp: Date.now() })
          for (const client of sseClients) {
            try { client.write(`data: ${data}\n\n`) } catch { sseClients.delete(client) }
          }
        }

        server.middlewares.use(async (req, res, next) => {
          // ── SSE 端点：GET /api/pages-config/__events ──
          if (req.method === 'GET' && req.url === '/api/pages-config/__events') {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*'
            })
            res.write('data: {"type":"connected"}\n\n')
            sseClients.add(res)
            req.on('close', () => sseClients.delete(res))
            return
          }

          // ── 写入 API：PUT /api/pages-config/{pageId}/{file} ──
          // AI 闭环：AI 生成/修改页面配置文件后通过此端点写入磁盘
          if (req.method === 'PUT' && req.url?.startsWith('/api/pages-config/')) {
            const urlClean = req.url.split('?')[0]
            const relPath = urlClean.slice('/api/pages-config/'.length)
            // 安全校验：只允许写入合法的页面配置文件
            const ALLOWED_FILES = ['rule.json', 'pagedata.json', 'script.js', 'style.css']
            const segments = relPath.split('/')
            if (segments.length !== 2 || !ALLOWED_FILES.includes(segments[1])) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: `只允许写入 ${ALLOWED_FILES.join(', ')}` }))
              return
            }
            // 防止路径穿越
            const pageId = segments[0]
            if (pageId.includes('..') || pageId.includes('/') || pageId.includes('\\')) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: '无效的 pageId' }))
              return
            }
            const targetDir = path.resolve(__dirname, 'public', 'pages-config', pageId)
            const targetFile = path.resolve(targetDir, segments[1])
            // 确保路径在 pages-config 内
            const pagesRoot = path.resolve(__dirname, 'public', 'pages-config')
            if (!targetFile.startsWith(pagesRoot)) {
              res.writeHead(403, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: '路径越界' }))
              return
            }

            try {
              // 读取请求体
              const body = await new Promise<string>((resolve, reject) => {
                let data = ''
                req.on('data', (chunk: Buffer) => { data += chunk.toString() })
                req.on('end', () => resolve(data))
                req.on('error', reject)
              })
              // 确保目录存在
              await fs.promises.mkdir(targetDir, { recursive: true })
              await fs.promises.writeFile(targetFile, body, 'utf-8')
              const stat = await fs.promises.stat(targetFile)
              broadcastChange(pageId, segments[1])
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true, timestamp: stat.mtime.toISOString() }))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(err) }))
            }
            return
          }

          // ── 批量写入：POST /api/pages-config/{pageId}/__batch ──
          // AI 一次性写入 4 个文件
          if (req.method === 'POST' && req.url?.match(/^\/api\/pages-config\/[^/]+\/__batch/)) {
            const urlClean = req.url.split('?')[0]
            const pageId = urlClean.split('/')[3]
            if (!pageId || pageId.includes('..')) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: '无效的 pageId' }))
              return
            }
            try {
              const body = await new Promise<string>((resolve, reject) => {
                let data = ''
                req.on('data', (chunk: Buffer) => { data += chunk.toString() })
                req.on('end', () => resolve(data))
                req.on('error', reject)
              })
              const files = JSON.parse(body) as Record<string, string>
              const ALLOWED_FILES = ['rule.json', 'pagedata.json', 'script.js', 'style.css']
              const targetDir = path.resolve(__dirname, 'public', 'pages-config', pageId)
              await fs.promises.mkdir(targetDir, { recursive: true })
              const written: string[] = []
              for (const [fileName, content] of Object.entries(files)) {
                if (!ALLOWED_FILES.includes(fileName)) continue
                if (typeof content !== 'string') continue
                const targetFile = path.resolve(targetDir, fileName)
                await fs.promises.writeFile(targetFile, content, 'utf-8')
                written.push(fileName)
              }
              // 自动注册路由：新建页面时追加到 routes.json
              const routesFile = path.resolve(__dirname, 'public', 'pages-config', 'routes.json')
              try {
                const routesRaw = await fs.promises.readFile(routesFile, 'utf-8')
                const routes = JSON.parse(routesRaw) as Array<{ pageId?: string }>
                const exists = routes.some(r => r.pageId === pageId)
                if (!exists) {
                  routes.push({
                    path: `/${pageId}`,
                    name: pageId,
                    pageId,
                    meta: { title: pageId, icon: '🤖' }
                  })
                  await fs.promises.writeFile(routesFile, JSON.stringify(routes, null, 2), 'utf-8')
                }
              } catch { /* routes.json 读写失败不阻断主流程 */ }

              broadcastChange(pageId, '__batch')
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true, pageId, written }))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: String(err) }))
            }
            return
          }

          // ── Mock AI 端点（开发环境）：POST /api/ai/chat ──
          // 不连真实 AI 后端时，返回一个可运行的 SPARK 页面骨架
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

              // 构造一个能在 SPARK 中运行的最小页面
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

          // ── 读取 API（原有逻辑）：GET /api/pages-config/{path} ──
          if (req.method !== 'GET' || !req.url?.startsWith('/api/pages-config/')) {
            return next()
          }
          const urlClean = req.url.split('?')[0]
          const relPath = urlClean.slice('/api/pages-config/'.length)
          const filePath = path.resolve(__dirname, 'public', 'pages-config', relPath)
          const clientTs = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '').get('timestamp') ?? ''

          try {
            const stat = await fs.promises.stat(filePath)
            const timestamp = stat.mtime.toISOString()
            res.setHeader('Content-Type', 'application/json')
            if (clientTs && clientTs === timestamp) {
              res.end(JSON.stringify({ notModified: true, timestamp, content: '' }))
              return
            }
            const content = await fs.promises.readFile(filePath, 'utf-8')
            res.end(JSON.stringify({ content, timestamp }))
          } catch {
            next()
          }
        })
      }
    },

    vue({
      include: /\.(vue)$/,
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('e-')
        }
      }
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
      })
    ] : [
      // Classic 模式：提供空的 virtual:spark-components 占位模块
      {
        name: 'spark-components-fallback',
        resolveId(id: string) {
          if (id === 'virtual:spark-components') return '\0virtual:spark-components'
        },
        load(id: string) {
          if (id === '\0virtual:spark-components') {
            return `
export function registerComponents() { return null }
export function getComponentMetadata() { return [] }
export default registerComponents
`
          }
        }
      }
    ]),
    
    ...(process.env.ANALYZE ? [visualizer({
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
          // Vue核心库
          if (id.includes('vue/dist') || id.includes('vue/index') || id === 'vue') {
            return 'vue-core'
          }
          // Vue Router
          if (id.includes('vue-router')) {
            return 'vue-router'
          }
          // Element Plus UI库
          if (id.includes('element-plus')) {
            return 'element-plus'
          }
          
          // ── Syncfusion 统一打包策略（解决循环依赖） ──
          // 
          // Syncfusion 是紧密耦合的组件生态系统，各包之间有复杂的交叉依赖：
          //   - ej2-grids 依赖 15+ 个子包（base, data, buttons, inputs, lists等）
          //   - 这些子包之间也互相依赖（如 lists → data, dropdowns → lists → data）
          //   - 尝试分层会导致循环 chunk 警告
          //
          // 解决方案：统一打包所有 @syncfusion/* 到单一 chunk
          //   - 优势 1: 彻底消除循环依赖
          //   - 优势 2: 减少 HTTP 请求（15+ 个包 → 1 个包）
          //   - 优势 3: 更好的 gzip 压缩率（重复代码只压缩一次）
          //   - 权衡: 单个文件较大（~2.1 MB 未压缩，~460 KB gzipped）
          //
          // 注：企业级组件库（如 Syncfusion、DevExtreme）通常本身就很大
          //     这是为了提供完整的企业级功能（Grid, Chart, Scheduler等）
          
          if (id.includes('@syncfusion/')) {
            return 'syncfusion'
          }
          
          // FormCreate
          if (id.includes('@form-create')) {
            return 'form-create'
          }

          // ── 智能路由级代码分割 ──
          // 基于文件路径进行更细粒度的分割，提高缓存命中率

          // SPARK packages - 按功能模块分割
          // ⚠️ spark-utils 必须独立 chunk：它是 spark-data 和 spark-component 的共同依赖，
          //    若不单独分配，Rollup 可能将 spark-utils 模块分入 spark-component chunk，
          //    导致 spark-data chunk 反向引用 spark-component chunk（虚假循环依赖）。
          if (id.includes('packages/spark-utils')) {
            return 'spark-utils'
          }
          if (id.includes('packages/spark-component')) {
            return 'spark-component'
          }
          if (id.includes('packages/spark-data')) {
            return 'spark-data'
          }
          if (id.includes('packages/spark-app')) {
            return 'spark-app'
          }
          if (id.includes('packages/spark-page-config')) {
            return 'spark-config'
          }

          // ── 页面组件懒加载分组 ──
          // 将大型页面组件分组，便于按需加载

          // 数据密集型页面（包含大量图表/表格）
          if (id.includes('views/Dashboard') || id.includes('views/CapabilityDemo')) {
            return 'pages-data-heavy'
          }
          // 配置管理页面
          if (id.includes('views/Settings') || id.includes('views/TenantConfigDemo')) {
            return 'pages-config'
          }
          // ── 第三方库智能分组 ──

          // 表单和验证库
          if (id.includes('async-validator') || id.includes('vxe-table')) {
            return 'vendor-forms'
          }

          // Node modules通用处理
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        }
      }
    },
    // 提高 chunk 大小警告阈值
    // 
    // 合理性分析：
    //   - Syncfusion 统一打包: ~2.1 MB (gzipped ~460 KB)
    //   - Element Plus 全量引入: ~762 KB (gzipped ~243 KB)
    //   - 企业级组件库体积较大是正常现象（功能完整性换来的代价）
    //   - 现代浏览器并行下载能力强，单文件 < 2.5 MB 可接受
    //   - HTTP/2 多路复用 + gzip 压缩后实际传输时间可控
    chunkSizeWarningLimit: 2500
  }
})