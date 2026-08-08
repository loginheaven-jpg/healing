import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("./client"),
  publicDir: r("./client/public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // 워크스페이스 패키지는 dist 가 아니라 소스로 해결합니다.
      "@healing/schema": r("../../packages/schema/src/index.ts"),
      "~": r("./client/src"),
    },
  },
  build: {
    outDir: r("./dist/client"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    // 개발 중에는 API 를 Hono 서버로 넘깁니다.
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/health": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
});
