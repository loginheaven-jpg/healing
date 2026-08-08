/**
 * 스키마와 마이그레이션 회귀.
 *
 * 완료 기준: 마이그레이션이 빈 DB 에 적용되고, 롤백 후 재적용도 된다.
 * docs/tasks/P2.md 2.1
 */

import { eq, sql } from "drizzle-orm";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDatabase } from "./testing.js";
import { songs, songMeasures, songPages, songParts, songWarnings } from "./schema.js";

let db: TestDatabase;

/**
 * drizzle 의 execute 는 드라이버마다 반환 형태가 다르다.
 * pglite 는 { rows }, postgres.js 는 배열을 준다. 둘 다 받아 배열로 만든다.
 */
async function rowsOf<T>(query: Parameters<TestDatabase["execute"]>[0], on?: TestDatabase) {
  const res = (await (on ?? db).execute(query)) as unknown;
  return (Array.isArray(res) ? res : ((res as { rows?: T[] }).rows ?? [])) as T[];
}

beforeEach(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.$close();
});

/** 곡 한 건을 넣고 id 를 돌려준다 */
async function insertSong(overrides: Partial<typeof songs.$inferInsert> = {}) {
  const [row] = await db
    .insert(songs)
    .values({
      title: "시험곡",
      fileName: "test.pdf",
      fileKey: "orig/test.pdf",
      fileKind: "pdf",
      source: "vector",
      status: "ready",
      ...overrides,
    })
    .returning({ id: songs.id });
  return row!.id;
}

describe("마이그레이션", () => {
  it("빈 DB 에 적용된다", async () => {
    const names = (
      await rowsOf<{ table_name: string }>(
        sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
      )
    ).map((r) => r.table_name);
    expect(names).toEqual([
      "song_edits",
      "song_lyrics",
      "song_measures",
      "song_pages",
      "song_parts",
      "song_warnings",
      "songs",
    ]);
  });

  it("users 테이블을 만들지 않는다", async () => {
    // 1차에 회원 개념이 없다. 나중을 위해 미리 만들지도 않는다.
    const rows = await rowsOf(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_name = 'users'`,
    );
    expect(rows.length).toBe(0);
  });

  it("롤백 후 재적용된다", async () => {
    await db.execute(sql`drop schema public cascade`);
    await db.execute(sql`create schema public`);
    const fresh = await createTestDb();
    const rows = await rowsOf<{ n: number }>(
      sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
      fresh,
    );
    expect(rows[0]!.n).toBe(7);
    await fresh.$close();
  });
});

describe("스키마 동작", () => {
  it("곡을 지우면 딸린 행이 함께 지워진다", async () => {
    const songId = await insertSong();
    await db.insert(songPages).values({ songId, pageNo: 1, imageKey: "k", width: 10, height: 20 });
    await db
      .insert(songParts)
      .values({ songId, part: "Soprano", notes: [{ m: 1, b: 0, d: 1, p: 60 }] });
    await db
      .insert(songMeasures)
      .values({ songId, measure: 1, pageNo: 1, systemIdx: 0, x: 1, y: 2, w: 3, h: 4 });

    await db.delete(songs).where(eq(songs.id, songId));

    expect((await db.select().from(songPages)).length).toBe(0);
    expect((await db.select().from(songParts)).length).toBe(0);
    expect((await db.select().from(songMeasures)).length).toBe(0);
  });

  it("jsonb 로 음표 배열을 그대로 담고 꺼낸다", async () => {
    const songId = await insertSong();
    const notes = [
      { m: 1, b: 0, d: 1, p: 60 },
      { m: 1, b: 1, d: 0.5, p: 62 },
    ];
    await db.insert(songParts).values({ songId, part: "Alto", notes, noteCount: notes.length });
    const [row] = await db.select().from(songParts).where(eq(songParts.songId, songId));
    // 부동소수 0.5 가 문자열로 바뀌거나 반올림되면 재생 리듬이 깨진다
    expect(row!.notes).toEqual(notes);
  });

  it("한 곡에 같은 마디를 두 번 넣을 수 없다", async () => {
    const songId = await insertSong();
    const box = { songId, measure: 1, pageNo: 1, systemIdx: 0, x: 1, y: 2, w: 3, h: 4 };
    await db.insert(songMeasures).values(box);
    await expect(db.insert(songMeasures).values(box)).rejects.toThrow();
  });

  it("경고의 resolved 기본값이 false 다", async () => {
    const songId = await insertSong();
    await db.insert(songWarnings).values({
      songId,
      code: "TIE_UNSUPPORTED",
      severity: "info",
      message: "이어진 음이 있을 수 있습니다.",
    });
    const [row] = await db.select().from(songWarnings);
    expect(row!.resolved).toBe(false);
  });
});
