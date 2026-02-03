import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

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
    })
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