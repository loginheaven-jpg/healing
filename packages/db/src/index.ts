/**
 * @healing/db — Postgres 스키마와 연결.
 *
 * 스키마 정본은 `docs/ARCHITECTURE.md` 4.2절 SQL 이다.
 * users 테이블은 없다. 1차에 회원 개념이 없다.
 */

export * from "./schema.js";
export { createDb, type Database } from "./client.js";
