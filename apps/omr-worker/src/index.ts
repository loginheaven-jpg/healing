/**
 * 이미지 인식 워커.
 *
 * **P0 에서는 배포가 통하는지만 확인합니다.** 내용은 P3 에서 채웁니다.
 *   1. pg-boss 소비자 — songs.status = pending 인 작업을 가져온다
 *   2. 전처리 (기울기 보정 · 해상도 보정 · 대비 정규화)  docs/ARCHITECTURE.md 3.1
 *   3. 품질 진단 — 여기서 거부할 수 있다               docs/ARCHITECTURE.md 3.2
 *   4. Audiveris CLI 호출                             docs/ARCHITECTURE.md 3.3
 *   5. MusicXML → ParseResult 변환                    docs/OMR.md 8장
 *
 * Audiveris 는 AGPL-3.0 입니다. **CLI 로만 부릅니다.**
 * 파일과 종료 코드로만 주고받고, 우리 코드에 링크하지 않습니다.
 * docs/decisions/001-omr-engine.md
 */

const STARTED_AT = Date.now();

function log(msg: string, extra: Record<string, unknown> = {}) {
  // 구조화 JSON. P3 부터 모든 로그에 songId 를 붙입니다. docs/ARCHITECTURE.md 8장
  console.log(JSON.stringify({ level: "info", service: "omr-worker", msg, ...extra }));
}

log("omr-worker started", { env: process.env.NODE_ENV ?? "development" });

// P3 에서 pg-boss 구독으로 바뀝니다. 지금은 살아 있음만 알립니다.
const beat = setInterval(() => {
  log("idle", { uptimeMs: Date.now() - STARTED_AT });
}, 60_000);

function shutdown(signal: string) {
  clearInterval(beat);
  log("omr-worker stopped", { signal });
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
