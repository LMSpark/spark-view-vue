import { defineConfig } from 'vite'
import { resolve, isAbsolute } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'page/model/index': resolve(__dirname, 'src/page/model/index.ts'),
        'page/loading/index': resolve(__dirname, 'src/page/loading/index.ts'),
        'page/workspace/index': resolve(__dirname, 'src/page/workspace/index.ts'),
        'page/navigation/index': resolve(__dirname, 'src/page/navigation/index.ts'),
        'page/sandbox/index': resolve(__dirname, 'src/page/sandbox/index.ts'),
        'page/services/index': resolve(__dirname, 'src/page/services/index.ts'),
        'assistant/registrations/index': resolve(__dirname, 'src/assistant/registrations/index.ts'),
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
