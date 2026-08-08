import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // 워크스페이스 패키지를 dist 가 아니라 소스로 해결합니다.
  // 빌드하지 않고도 `pnpm test` 가 돌아야 하기 때문입니다.
  resolve: {
    alias: {
      "@healing/schema": r("./packages/schema/src/index.ts"),
      "@healing/db": r("./packages/db/src/index.ts"),
      "@healing/omr-vector": r("./packages/omr-vector/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/*/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "ui/**"],
    // 벡터 파싱은 쪽당 0.4~0.9초입니다(docs/OMR.md 1장). 픽스처 회귀는 여유를 둡니다.
    testTimeout: 30_000,
    reporters: ["default"],
  },
});
