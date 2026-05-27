import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    port: 5173,      // 固定端口，不要修改
    strictPort: true, // 若 5173 被占用则直接报错，不要自动换端口
    host: '0.0.0.0', // 绑定到 127.0.0.1，确保浏览器可访问
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
