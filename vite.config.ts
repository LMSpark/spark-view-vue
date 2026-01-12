import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import {viteMockServe} from 'vite-plugin-mock'
import path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    plugins: [
        vue(),
        // 自动导入 Vue 相关函数（ref, reactive, computed 等）
        AutoImport({
            resolvers: [ElementPlusResolver()],
            imports: ['vue', 'vue-router'],
            dts: 'src/auto-imports.d.ts',
        }),
        // 自动导入 Element Plus 组件
        Components({
            resolvers: [ElementPlusResolver()],
            dts: 'src/components.d.ts',
        }),
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
