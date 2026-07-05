import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  build: {
    cssMinify: 'esbuild',
  },
  plugins: [
    vue(),
    // vueDevTools(),
    tailwindcss(),
    // visualizer({
    //   open: true,           // 构建完成后自动在浏览器打开报告
    //   filename: 'stats.html', // 报告文件名
    //   gzipSize: true,       // 显示 gzip 后的大小（更接近真实传输体积）
    //   brotliSize: true,     // 显示 brotli 压缩后的大小
    // }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://100.92.208.69:8000', // 👈 真实后端地址+端口
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ''), // 如果后端没有 /api 前缀则取消注释
      }
    }
  }
})
