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
      '@plugins': path.resolve(__dirname, 'plugins'),
      '@root': path.resolve(__dirname, '..', '..', 'src'),
      '@spark-view/spark-core': path.resolve(__dirname, 'packages', 'spark-core', 'src'),
      '@spark-view/dataset-core': path.resolve(__dirname, 'packages', 'dataset-core', 'src')
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
          if (id.includes('vue/dist') || id.includes('vue/index') || id === 'vue') {
            return 'vue-core'
          }
          if (id.includes('vue-router')) {
            return 'vue-router'
          }
          if (id.includes('@syncfusion/')) {
            return 'syncfusion-all'
          }
        }
      }
    }
  }
})