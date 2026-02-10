import { defineConfig } from 'vite'
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
      '@spark-view/spark-component': path.resolve(__dirname, 'packages', 'spark-component', 'src'),
      '@spark-view/spark-data': path.resolve(__dirname, 'packages', 'spark-data', 'src'),
      '@spark-view/spark-utils': path.resolve(__dirname, 'packages', 'spark-utils', 'src'),
      '@spark-view/spark-renderer': path.resolve(__dirname, 'packages', 'spark-renderer', 'src'),
      '@spark-view/spark-page-config': path.resolve(__dirname, 'packages', 'spark-page-config', 'src'),
      '@spark-view/spark-app': path.resolve(__dirname, 'packages', 'spark-app', 'src'),
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
          path.resolve(__dirname, 'packages/spark-renderer/src/components'),
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
          // Syncfusion组件
          if (id.includes('@syncfusion/ej2-base') || 
              id.includes('@syncfusion/ej2-data') ||
              id.includes('@syncfusion/ej2-calendars')) {
            return 'syncfusion-base'
          }
          if (id.includes('@syncfusion/ej2-grids')) {
            return 'syncfusion-grids'
          }
          if (id.includes('@syncfusion/')) {
            return 'syncfusion-other'
          }
          // FormCreate
          if (id.includes('@form-create')) {
            return 'form-create'
          }
          // SPARK packages
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
          if (id.includes('packages/spark-renderer')) {
            return 'spark-renderer'
          }
          // Node modules通用处理
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        }
      }
    },
    // 提高chunk大小警告阈值
    chunkSizeWarningLimit: 800
  }
})