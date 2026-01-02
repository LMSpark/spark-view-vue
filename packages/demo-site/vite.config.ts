import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: process.env.BASE_URL || '/',
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
