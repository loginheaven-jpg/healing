/**
 * web 서비스 진입점.
 *
 * 한 서비스가 두 가지를 합니다.
 *   1. API (Hono + tRPC)          — P2 에서 붙입니다
 *   2. 클라이언트 정적 파일 제공      — Vite 가 만든 dist/client
 *
 * 벡터 PDF 파싱도 이 프로세스 안에서 즉시 처리합니다(1초 내).
 * 이미지 인식만 omr-worker 로 넘깁니다. docs/ARCHITECTURE.md 1.1
 */

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** 빌드 산출물 기준: dist/server/index.js → dist/client */
const CLIENT_DIR = path.resolve(HERE, "../client");

const PORT = Number(process.env.PORT ?? 8080);
const NODE_ENV = process.env.NODE_ENV ?? "development";
const STARTED_AT = Date.now();

const app = new Hono();

/**
 * 상태 확인. Railway 의 헬스체크가 이 경로를 봅니다.
 * 아직 DB 를 붙이지 않았으므로 프로세스 생존만 알립니다.
 * P2 에서 DB 연결 확인을 더합니다.
 */
app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "web",
    env: NODE_ENV,
    uptimeMs: Date.now() - STARTED_AT,
  }),
);

// 클라이언트 정적 파일. 빌드가 없으면(개발 중 서버만 띄운 경우) 건너뜁니다.
const hasClientBuild = fs.existsSync(path.join(CLIENT_DIR, "index.html"));

if (hasClientBuild) {
  // serveStatic 의 root 는 cwd 기준 상대경로입니다. Windows 역슬래시는 쓰지 못합니다.
  const staticRoot = path.relative(process.cwd(), CLIENT_DIR).replaceAll("\\", "/");
  app.use("/assets/*", serveStatic({ root: staticRoot }));
  app.use("/*", serveStatic({ root: staticRoot }));
  // 클라이언트 라우팅(SPA)을 위해 나머지는 index.html 로 되돌립니다.
  app.get("*", (c) => c.html(fs.readFileSync(path.join(CLIENT_DIR, "index.html"), "utf8")));
} else {
  app.get("/", (c) =>
    c.text(
      "클라이언트 빌드가 없습니다. `pnpm --filter @healing/web build:client` 를 실행하세요.",
      200,
    ),
  );
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  // 구조화 로그. docs/ARCHITECTURE.md 8장
  console.log(
    JSON.stringify({
      level: "info",
      msg: "web started",
      port: info.port,
      env: NODE_ENV,
      client: hasClientBuild ? "served" : "absent",
    }),
  );
});

export { app };
