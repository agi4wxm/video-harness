import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 浏览器开发：先 `pnpm lib serve`（默认 4580 端口），vite 把 /api 代理过去
export default defineConfig({
  root: "renderer",
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist/renderer", emptyOutDir: true },
  server: { port: 5180, proxy: { "/api": "http://127.0.0.1:4580" } },
});
