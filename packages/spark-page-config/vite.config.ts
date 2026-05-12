import { defineConfig } from 'vite'
import { resolve, isAbsolute } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'compiler/index': resolve(__dirname, 'src/compiler/index.ts'),
        'documents/index': resolve(__dirname, 'src/documents/index.ts'),
        'files/index': resolve(__dirname, 'src/files/index.ts'),
        'loader/index': resolve(__dirname, 'src/loader/index.ts'),
        'page-design/index': resolve(__dirname, 'src/page-design/index.ts'),
        'services/index': resolve(__dirname, 'src/services/index.ts'),
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
