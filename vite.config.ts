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
            dirs: ['src/components'],
            exclude: [/src\/components\/renderers\/ej2\/.*/],
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
        // 启用代码分割和优化
        rollupOptions: {
            // 可选：将大型库外部化到CDN（生产环境建议）
            // external: [
            //     '@syncfusion/ej2-base',
            //     '@syncfusion/ej2-vue-grids',
            //     '@syncfusion/ej2-vue-inputs',
            //     '@syncfusion/ej2-vue-calendars'
            // ],
            output: {
                // 文件命名策略 - 优化缓存
                chunkFileNames: 'js/[name]-[hash].js',
                entryFileNames: 'js/[name]-[hash].js',
                assetFileNames: (assetInfo) => {
                    const ext = assetInfo.name!.split('.').pop()
                    if (/\.(png|jpe?g|gif|svg|ico)$/i.test(assetInfo.name!)) {
                        return 'images/[name]-[hash].[ext]'
                    }
                    if (/\.css$/i.test(assetInfo.name!)) {
                        return 'css/[name]-[hash].[ext]'
                    }
                    if (/\.(woff2?|ttf|eot)$/i.test(assetInfo.name!)) {
                        return 'fonts/[name]-[hash].[ext]'
                    }
                    return 'assets/[name]-[hash].[ext]'
                },
                
                // 手动分包优化（函数形式，更灵活）
                manualChunks(id) {
                    // Vue核心（最优先级，防止循环依赖）
                    if (id.includes('vue/dist') || id.includes('vue/index') || id === 'vue') {
                        return 'vue-core'
                    }
                    
                    // Vue Router
                    if (id.includes('vue-router')) {
                        return 'vue-router'
                    }
                    
                    // Element Plus（独立分包）
                    if (id.includes('element-plus') && !id.includes('node_modules')) {
                        return 'element-plus'
                    }
                    
                    // Form Create
                    if (id.includes('@form-create/element-ui')) {
                        return 'form-create'
                    }
                    
                    // 所有Syncfusion组件统一打包（避免内部循环依赖）
                    if (id.includes('@syncfusion/')) {
                        return 'syncfusion-all'
                    }
                    
                    // Element Plus包（第三方node_modules中的）
                    if (id.includes('node_modules') && id.includes('element-plus')) {
                        return 'element-plus-vendor'
                    }
                    
                    // 其他第三方库
                    if (id.includes('node_modules') && !id.includes('@syncfusion')) {
                        return 'vendor'
                    }
                }
            }
        },
        // 启用压缩
        minify: 'terser',
        terserOptions: {
            compress: {
                // 移除console和debugger
                drop_console: true,
                drop_debugger: true
            }
        },
        // 启用源码映射（生产环境可关闭）
        sourcemap: false,
        // 设置目标浏览器
        target: 'es2018',
        // 优化chunk大小警告阈值（Syncfusion全包较大）
        chunkSizeWarningLimit: 1500
    },
    ssr: {
        // 防止在 SSR 中外部化这些依赖
        noExternal: ['element-plus', '@form-create/element-ui']
    }
})
