import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {viteMockServe} from 'vite-plugin-mock'

export default defineConfig({
    plugins: [
        vue(),
        viteMockServe({
            mockPath: 'src/mock',
            enable: true,
            watchFiles: true
        })
    ],
    server: {
        port: 3000
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: undefined
            }
        }
    },
    ssr: {
        // 防止在 SSR 中外部化这些依赖
        noExternal: ['element-plus', '@form-create/element-ui']
    }
})
