/**
 * 시험용 인메모리 Postgres.
 *
 * **PGlite 를 쓴다.** Postgres 를 WASM 으로 컴파일한 것이라 프로세스 안에서
 * 실제 Postgres 의미론으로 돈다. jsonb · serial · timestamptz · 외래키 연쇄
 * 삭제가 운영과 같게 동작한다.
 *
 * 대안을 쓰지 않은 이유 —
 *   Testcontainers : Docker 를 요구한다. 이 개발 PC 에 Docker 가 꺼져 있고,
 *                    CI 없이도 시험이 돌아야 한다.
 *   로컬 Postgres  : 설치돼 있지 않다. 시험이 환경 설치에 기대면 안 된다.
 *   SQLite         : 방언이 다르다. jsonb 와 serial 의 차이가 시험을 통과시키고
 *                    운영에서 터진다. **다른 DB 로 시험하지 않는다.**
 *
 * 시험 파일이 아니라 소스에 두는 이유는 apps/web 의 시험도 이것을 쓰기
 * 때문이다. 패키지 경계를 넘어 시험 도우미를 공유하려면 빌드 산출물이어야 한다.
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

export type TestDatabase = ReturnType<typeof drizzle<typeof schema>> & {
  $close: () => Promise<void>;
};

/** 마이그레이션 SQL 이 있는 곳. dist 에서도 소스 기준으로 거슬러 올라간다 */
function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/ 에서 실행되든 dist/ 에서 실행되든 패키지 뿌리는 한 단계 위다
  return path.resolve(here, "../migrations");
}

/**
 * 마이그레이션을 적용한 빈 DB 를 만든다.
 *
 * drizzle-kit 이 생성한 SQL 을 그대로 실행한다. 스키마를 코드로 다시
 * 만들지 않는다 — 그러면 마이그레이션이 실제로 도는지 시험하지 못한다.
 */
export async function createTestDb(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as TestDatabase;

  const dir = migrationsDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    // drizzle-kit 은 문장을 이 구분자로 나눈다
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) await client.exec(trimmed);
    }
  }

  db.$close = () => client.close();
  return db;
}

export { schema };
