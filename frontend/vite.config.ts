import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // 显式绑 IPv4 回环：默认的 "localhost" 在这台机器上只绑了 ::1，
    // 导致 http://127.0.0.1:5173 打不开，启动脚本和浏览器容易对不上。
    // 只监听本机，也符合“你的星图默认只有你自己可见”。
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // 文档 P1-5: 把公共依赖拆出来，手机首次打开不必为一个 chunk 下载全部代码。
    // Vite 8 底层是 rolldown，manualChunks 只接受函数形式。
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return "react";
          }
          if (/[\\/]node_modules[\\/](@tanstack|zustand|zod|date-fns)[\\/]/.test(id)) {
            return "data";
          }
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) {
            return "motion";
          }
          if (/[\\/]node_modules[\\/](d3|d3-[a-z]+|internmap|delaunator|robust-predicates)[\\/]/.test(id)) {
            return "graph";
          }
          return undefined;
        },
      },
    },
  },
});
