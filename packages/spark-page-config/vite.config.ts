import { defineConfig } from 'vite'
import { resolve, isAbsolute } from 'path'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@spark-view\/spark-page-config\/capabilities\/(.+)$/, replacement: resolve(__dirname, 'src/capabilities/$1') },
    ],
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'page/model/index': resolve(__dirname, 'src/page/model.ts'),
        'page/loading/index': resolve(__dirname, 'src/page/loading.ts'),
        'page/navigation/index': resolve(__dirname, 'src/page/navigation.ts'),
        'page/sandbox/index': resolve(__dirname, 'src/page/sandbox.ts'),
        'registrations/index': resolve(__dirname, 'src/registrations/index.ts'),
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
