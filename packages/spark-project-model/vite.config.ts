import { defineConfig } from 'vite'
import { resolve, isAbsolute } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@spark-view/spark-project-model': resolve(__dirname, 'src/index.ts'),
    },
  },
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        project: resolve(__dirname, 'src/project.ts'),
        ai: resolve(__dirname, 'src/ai.ts'),
        'json-document-public': resolve(__dirname, 'src/json-document-public.ts'),
      },
      formats: ['es'],
    },
    emptyOutDir: true,
    rollupOptions: {
      external: (id) => !id.startsWith('.') && !id.startsWith('\0') && !isAbsolute(id),
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        dir: 'dist',
        entryFileNames: '[name].js',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
