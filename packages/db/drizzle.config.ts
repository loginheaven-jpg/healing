import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/healing",
  },
  // 마이그레이션 파일을 사람이 읽을 수 있게 둔다. 생성된 SQL 을 검토하고 커밋한다.
  verbose: true,
  strict: true,
});
