import { defineConfig } from 'vite'
import { resolve, isAbsolute } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'config/index': resolve(__dirname, 'src/config/index.ts'),
        'node-tree/index': resolve(__dirname, 'src/node-tree/index.ts'),
        'navigation/index': resolve(__dirname, 'src/navigation/index.ts'),
        'runtime/index': resolve(__dirname, 'src/runtime/index.ts'),
        'json-document/index': resolve(__dirname, 'src/json-document/index.ts'),
        'design/index': resolve(__dirname, 'src/design/index.ts'),
        'ai/index': resolve(__dirname, 'src/ai/index.ts'),
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
