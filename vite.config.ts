import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  build: {
    // lightningcss ships inside Vite's own bundle since Vite 5; no separate dep needed.
    // esbuild used to be the default but requires an explicit install since Vite 6 / rolldown.
    cssMinify: 'lightningcss',
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
      // 指向 Spring Boot（默认 8080），不是 Python 的 8000。
      //
      // 重构后前端只跟 Java 通信：鉴权、会话、历史、上传、SSE 转发都在
      // Java 侧。Python 只剩 /internal/* 内部推理接口，需要
      // X-Internal-Secret 才能调，浏览器直连会被拒。
      //
      // 地址从环境变量取，默认本机 —— 后端跑在另一台机器时不用改代码，
      // 建 .env.local 写 VITE_API_TARGET=http://<ip>:8080 即可。
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8006',
        changeOrigin: true,
      }
    }
  }
})
