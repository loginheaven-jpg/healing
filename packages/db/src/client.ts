/**
 * DB 연결.
 *
 * 운영은 postgres.js, 시험은 PGlite 를 쓴다. 둘 다 같은 Drizzle 스키마를
 * 쓰므로 질의 코드는 하나다.
 *
 * **PGlite 를 고른 이유** — 이 개발 PC 에 Docker 도 로컬 Postgres 도 없다.
 * Testcontainers 는 Docker 를 요구한다. PGlite 는 Postgres 를 WASM 으로
 * 컴파일한 것이라 프로세스 안에서 **실제 Postgres 의미론**으로 돈다.
 * SQLite 같은 대체 DB 로 시험하면 jsonb·serial·timestamptz 의 동작 차이가
 * 시험을 통과시키고 운영에서 터진다.
 */

import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDb>;

/** 운영·개발용 Postgres 연결 */
export function createDb(connectionString: string) {
  const sql = postgres(connectionString, {
    // 벡터 파싱이 인라인으로 도는 web 서비스다. 연결을 많이 열 이유가 없다.
    max: 10,
    // Railway Postgres 는 SSL 을 요구한다. 로컬은 무시된다.
    ssl: connectionString.includes("localhost") ? false : "require",
  });
  return drizzlePg(sql, { schema });
}

export { schema };
