import { defineConfig, type Plugin as VitePlugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import { parse } from 'vue-docgen-api'
import { sparkComponentsPlugin } from './tools/vite-plugin-spark-components'
import {
  COMPONENT_SCAN_PATTERNS,
  COMPONENT_EXCLUDE_PATTERNS,
  SYNC_COMPONENTS,
  ASYNC_COMPONENTS,
  SIZE_THRESHOLD,
  COMPONENT_CAPABILITIES
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
      '@features': path.resolve(__dirname, 'features'),
      '@pages': path.resolve(__dirname, 'pages'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@root': path.resolve(__dirname, '..', '..', 'src'),
      '@spark-view/spark-component': path.resolve(__dirname, 'packages', 'spark-component', 'dist', 'index.js'),
      '@spark-view/spark-data': path.resolve(__dirname, 'packages', 'spark-data', 'dist', 'index.js'),
      '@spark-view/spark-utils': path.resolve(__dirname, 'packages', 'spark-utils', 'dist', 'index.js'),
      '@spark-view/spark-renderer': path.resolve(__dirname, 'packages', 'spark-component', 'dist', 'index.js'),
      '@spark-view/spark-page-config': path.resolve(__dirname, 'packages', 'spark-page-config', 'dist', 'index.js'),
      '@spark-view/spark-app': path.resolve(__dirname, 'packages', 'spark-app', 'dist', 'index.js'),
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
    
    {
      name: 'generate-component-library',
      buildStart() {
        console.log('开始生成Vue组件资源库...')
      },
      async generateBundle() {
        const componentLibrary: Record<string, any> = {}
        
        // 使用统一配置源获取扫描目录
        const componentDirs = [
          path.resolve(__dirname, 'packages/spark-component/src/components'),
          path.resolve(__dirname, 'packages/spark-component/src/renderer'),
          path.resolve(__dirname, 'features/spark/components'),
          path.resolve(__dirname, 'features/spark-ej2/components'),
          path.resolve(__dirname, 'src/components'),
          path.resolve(__dirname, 'src/components/demo'),
          path.resolve(__dirname, 'src/views')
        ]

        // ── kebab-case 转换工具（处理数字+字母边界如 EJ2Grid → ej2-grid）──
        const toKebab = (s: string) => s
          .replace(/([a-z])([A-Z])/g, '$1-$2')
          .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
          .replace(/([a-zA-Z])(\d)/g, '$1-$2')
          .replace(/(\d)([a-zA-Z])/g, '$1-$2')
          .replace(/[\s_]+/g, '-')
          .toLowerCase()

        // ── 判断加载策略 ──
        const matchPattern = (name: string, patterns: readonly string[]) =>
          patterns.some(p => new RegExp('^' + p.replace(/\*/g, '.*') + '$', 'i').test(name))

        const getStrategy = (name: string): 'sync' | 'async' => {
          if (matchPattern(name, SYNC_COMPONENTS)) return 'sync'
          if (matchPattern(name, ASYNC_COMPONENTS)) return 'async'
          return 'sync'
        }
        
        for (const componentDir of componentDirs) {
          if (!fs.existsSync(componentDir)) continue
          
          const files = fs.readdirSync(componentDir).filter(f => f.endsWith('.vue'))
          
          for (const file of files) {
            const filePath = path.resolve(componentDir, file)
            
            try {
              // 提取完整元数据（用于 AI 知识库）
              const docs = await parse(filePath)
              const componentName = file.replace('.vue', '')
              
              // 增强 props 信息提取
              const enhancedProps = (docs.props || []).map(prop => ({
                name: prop.name,
                type: prop.type,
                required: prop.required,
                defaultValue: prop.defaultValue,
                description: prop.description || '',
                tags: prop.tags || {},  // JSDoc 标签（@param, @example 等）
                values: prop.values,     // 枚举值
              }))

              // 增强 events 信息提取
              const enhancedEvents = (docs.events || []).map(event => ({
                name: event.name,
                description: event.description || '',
                type: event.type,
                properties: event.properties || [],  // 事件参数
                tags: event.tags || {}
              }))

              // 增强 slots 信息提取
              const enhancedSlots = (docs.slots || []).map(slot => ({
                name: slot.name,
                description: slot.description || '',
                bindings: slot.bindings || [],  // 插槽绑定的数据
                tags: slot.tags || {}
              }))

              // 提取 methods（如果通过 expose 暴露）
              const methods = (docs.methods || []).map(method => ({
                name: method.name,
                description: method.description || '',
                params: method.params || [],
                returns: method.returns,
                tags: method.tags || {}
              }))

              componentLibrary[componentName] = {
                // 基本信息
                name: componentName,
                displayName: docs.displayName || componentName,
                description: docs.description || '',
                tags: docs.tags || {},  // 组件级别的 JSDoc 标签
                
                // 详细元数据
                props: enhancedProps,
                events: enhancedEvents,
                slots: enhancedSlots,
                methods: methods,
                
                // 源码信息
                sourcePath: path.relative(__dirname, filePath),
                
                // AI 知识库增强字段
                exportName: docs.exportName,

                // ── SPARK 特有元数据 ──
                spark: {
                  // 注册类型（kebab-case）
                  type: toKebab(componentName),
                  // 加载策略
                  loadStrategy: getStrategy(componentName),
                  // 能力系统（provide / consume）
                  capabilities: COMPONENT_CAPABILITIES[componentName] || null,
                },
                
                // 统计信息（便于 AI 理解组件复杂度）
                complexity: {
                  propsCount: enhancedProps.length,
                  eventsCount: enhancedEvents.length,
                  slotsCount: enhancedSlots.length,
                  methodsCount: methods.length
                }
              }
              
              console.log(`✓ 提取组件元数据: ${componentName} (${enhancedProps.length} props, ${enhancedEvents.length} events, ${enhancedSlots.length} slots, ${methods.length} methods)`)
            } catch (error) {
              console.warn(`⚠ 无法提取 ${file} 的元数据:`, error.message)
              
              // 生成mock元数据
              const componentName = file.replace('.vue', '')
              componentLibrary[componentName] = {
                props: [
                  { name: 'id', type: 'string', description: '组件唯一标识' },
                  { name: 'dataSource', type: 'Array', description: '数据源' }
                ],
                events: [
                  { name: 'dataChanged', description: '数据变化事件' }
                ],
                slots: [
                  { name: 'default', description: '默认插槽' }
                ],
                description: `Mock 元数据 for ${componentName}`,
                sourcePath: path.relative(__dirname, filePath),
                isMock: true
              }
            }
          }
        }
        
        // 生成JSON文件
        const libraryPath = 'component-library.json'
        const libraryContent = JSON.stringify(componentLibrary, null, 2)
        fs.writeFileSync(libraryPath, libraryContent)
        
        console.log(`📄 组件库JSON已生成: ${libraryPath} (${Object.keys(componentLibrary).length} 个组件)`)
        
        // 上传到服务端
        try {
          console.log('🚀 开始上传组件库到服务端...')

          const response = await axios.post('http://localhost:3001/api/component-library', {
            data: componentLibrary
          }, {
            timeout: 5000 // 5秒超时
          })

          if (response.data.success) {
            console.log('✅ 组件库已成功上传到服务端')
            console.log(`📊 上传统计: ${Object.keys(componentLibrary).length} 个组件, ${libraryContent.length} 字节`)
          } else {
            console.warn('⚠️ 服务端返回错误:', response.data.error)
          }

        } catch (error) {
          console.warn('⚠️ 无法连接到组件库服务端，将使用本地文件')
          console.warn('💡 请启动服务端: node component-library-server.js')

          // 如果服务端不可用，至少保存本地文件
          console.log(`💾 本地文件已保存: ${libraryPath}`)
        }
      }
    },
    // rollup-plugin-visualizer@6 与 Vite 7 内置 rollup 类型在
    // exactOptionalPropertyTypes 下 filter.id 签名不兼容，
    // 显式断言为 VitePlugin 以通过类型检查
    ...(process.env.ANALYZE ? [visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true
    }) as unknown as VitePlugin] : [])
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
          // spark-renderer 已并入 spark-component

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
          // 演示页面
          if (id.includes('views/JsonRendererDemo') || id.includes('views/ComponentRendererDemo')) {
            return 'pages-demo'
          }

          // ── 第三方库智能分组 ──
          // 基于使用频率和大小进行分组

          // 经常使用的工具库
          if (id.includes('axios') || id.includes('lodash') || id.includes('dayjs')) {
            return 'vendor-utils'
          }
          // 图表和可视化库
          if (id.includes('echarts') || id.includes('d3')) {
            return 'vendor-charts'
          }
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