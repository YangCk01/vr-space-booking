import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
