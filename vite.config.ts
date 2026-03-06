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
    {
      name: 'spark-pages-config-server',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
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