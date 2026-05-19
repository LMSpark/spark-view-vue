import { defineConfig } from 'vite'
import { resolve, isAbsolute } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'core/index': resolve(__dirname, 'src/core/index.ts'),
        'core/host/index': resolve(__dirname, 'src/core/host/index.ts'),
        'registrations/index': resolve(__dirname, 'src/registrations/index.ts'),
        'registrations/page-design/index': resolve(__dirname, 'src/registrations/page-design/index.ts'),
        'registrations/leave-request/index': resolve(__dirname, 'src/registrations/leave-request/index.ts'),
        'registrations/page-design/payloads/index': resolve(__dirname, 'src/registrations/page-design/payloads/index.ts'),
      },
      formats: ['es'],
    },
    emptyOutDir: true,
    rollupOptions: {
      // 外部化所有非相对路径的导入（库构建标准做法）
      external: (id) => !id.startsWith('.') && !id.startsWith('\0') && !isAbsolute(id),
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        dir: 'dist',
        entryFileNames: '[name].js',
      },
    },
  },
})
