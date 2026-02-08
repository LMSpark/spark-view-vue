import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import vueDocgen from 'vue-docgen-api'

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
    {
      name: 'generate-component-library',
      buildStart() {
        console.log('开始生成Vue组件资源库...')
      },
      async generateBundle(options, bundle) {
        const componentLibrary: Record<string, any> = {}
        
        // 扫描组件目录
        const componentDirs = [
          path.resolve(__dirname, 'packages/spark-component/src/components'),
          path.resolve(__dirname, 'features/spark/components'),
          path.resolve(__dirname, 'features/spark-ej2/components')
        ]
        
        for (const componentDir of componentDirs) {
          if (!fs.existsSync(componentDir)) continue
          
          const files = fs.readdirSync(componentDir).filter(f => f.endsWith('.vue'))
          
          for (const file of files) {
            const filePath = path.resolve(componentDir, file)
            
            try {
              // 提取元数据
              const docs = await vueDocgen.buildComponentDocs(filePath)
              const componentName = file.replace('.vue', '')
              
              componentLibrary[componentName] = {
                props: docs.props || [],
                events: docs.events || [],
                slots: docs.slots || [],
                description: docs.description || '',
                sourcePath: path.relative(__dirname, filePath)
              }
              
              console.log(`✓ 提取组件元数据: ${componentName}`)
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
        
        // Mock 上传到服务端
        try {
          // 模拟上传 - 实际项目中替换为真实API
          console.log('🚀 开始上传组件库到服务端...')
          
          // Mock API 调用
          await new Promise(resolve => setTimeout(resolve, 1000)) // 模拟网络延迟
          
          console.log('✅ 组件库已成功上传到服务端 (Mock)')
          console.log(`📊 上传统计: ${Object.keys(componentLibrary).length} 个组件, ${libraryContent.length} 字节`)
          
          // 在开发环境下输出前5个组件的预览
          if (process.env.NODE_ENV !== 'production') {
            console.log('\n📋 组件库预览 (前5个):')
            Object.entries(componentLibrary).slice(0, 5).forEach(([name, meta]: [string, any]) => {
              console.log(`  - ${name}: ${meta.props?.length || 0} props, ${meta.events?.length || 0} events${meta.isMock ? ' (Mock)' : ''}`)
            })
          }
          
        } catch (error) {
          console.error('❌ 上传失败:', error)
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
          if (id.includes('packages/spark-core')) {
            return 'spark-core'
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