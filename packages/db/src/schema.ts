/**
 * Postgres 스키마.
 *
 * `docs/ARCHITECTURE.md` 4.2절 SQL 을 그대로 옮긴 것이다. 컬럼 이름·타입·
 * 제약을 임의로 바꾸지 않는다. 바꿔야 하면 먼저 문서를 고친다.
 *
 * **users 테이블은 만들지 않는다.** 1차에 회원 개념이 없다. 2차에서
 * `songs.owner_id` 를 추가하는 마이그레이션으로 확장한다. 지금부터 그 자리를
 * 비워 두려고 nullable 컬럼을 만들지 않는다. 쓰지 않는 컬럼은 혼란만 부른다.
 *
 * **octaveSource 도 저장하지 않는다.** 진단용이며 사용자에게 보이지 않는다.
 * docs/tasks/P2.md 0.3
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import type { LyricSyllable, Note, Part, Rest, Severity, WarningCode } from "@healing/schema";

/** 곡 한 건 */
export const songs = pgTable(
  "songs",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    composer: varchar("composer", { length: 200 }),
    arranger: varchar("arranger", { length: 200 }),
    fileName: varchar("file_name", { length: 300 }).notNull(),
    /** R2 키 (원본) */
    fileKey: varchar("file_key", { length: 500 }).notNull(),
    fileSize: integer("file_size").notNull().default(0),
    /** pdf | zip | image */
    fileKind: varchar("file_kind", { length: 16 }).notNull(),
    /** vector | image */
    source: varchar("source", { length: 16 }).notNull(),
    /** pending | processing | ready | failed */
    status: varchar("status", { length: 16 }).notNull(),
    pageCount: integer("page_count").notNull().default(0),
    layout: varchar("layout", { length: 24 }),
    keyFifths: integer("key_fifths"),
    timeNum: integer("time_num"),
    timeDen: integer("time_den"),
    tempoBpm: integer("tempo_bpm"),
    measureCount: integer("measure_count").notNull().default(0),
    confidence: integer("confidence").notNull().default(0),
    elapsedMs: integer("elapsed_ms").notNull().default(0),
    /** 실패 시 사용자용 존대체 문구. docs/ARCHITECTURE.md 8장 */
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("songs_created_idx").on(t.createdAt.desc())],
);

/** 쪽별 이미지 — 악보 뷰가 보여주는 실체 */
export const songPages = pgTable(
  "song_pages",
  {
    id: serial("id").primaryKey(),
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    /** R2 키 (정규화된 PNG) */
    imageKey: varchar("image_key", { length: 500 }).notNull(),
    /**
     * 렌더된 이미지의 실제 픽셀 크기.
     *
     * 클라이언트가 표시 크기와의 비율을 계산하는 근거이므로 정확해야 한다.
     * 이 값이 틀리면 마디 강조 사각형이 어긋난다. docs/tasks/P2.md 0.2
     */
    width: integer("width").notNull(),
    height: integer("height").notNull(),
  },
  (t) => [unique("song_pages_song_page_uq").on(t.songId, t.pageNo)],
);

/**
 * 파트별 음표.
 * 항상 파트 전체를 한 번에 읽으므로 음표 하나하나를 행으로 쪼개지 않는다.
 */
export const songParts = pgTable(
  "song_parts",
  {
    id: serial("id").primaryKey(),
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    /** Soprano | Alto | Tenor | Bass */
    part: varchar("part", { length: 10 }).notNull().$type<Part>(),
    notes: jsonb("notes").notNull().$type<Note[]>(),
    rests: jsonb("rests").notNull().default([]).$type<Rest[]>(),
    noteCount: integer("note_count").notNull().default(0),
    /** 음역 띠 표시용 */
    pitchMin: integer("pitch_min"),
    pitchMax: integer("pitch_max"),
  },
  (t) => [unique("song_parts_song_part_uq").on(t.songId, t.part)],
);

/**
 * 마디 좌표 — 자동 스크롤 · 마디 클릭 · 마디 칩 이동이 쓴다.
 *
 * ParseResult.measureBoxes 를 그대로 담는다. 좌표는 **페이지 이미지
 * 좌표계(px, Y 아래로 증가)** 이며 이미 뒤집혀 있다. 여기서 다시 뒤집지 않는다.
 */
export const songMeasures = pgTable(
  "song_measures",
  {
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    measure: integer("measure").notNull(),
    pageNo: integer("page_no").notNull(),
    systemIdx: integer("system_idx").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    w: integer("w").notNull(),
    h: integer("h").notNull(),
  },
  (t) => [primaryKey({ columns: [t.songId, t.measure] })],
);

/** 가사 */
export const songLyrics = pgTable(
  "song_lyrics",
  {
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    measure: integer("measure").notNull(),
    beat: numeric("beat", { precision: 6, scale: 3 }).notNull(),
    text: varchar("text", { length: 40 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.songId, t.measure, t.beat] })],
);

/** 경고 */
export const songWarnings = pgTable(
  "song_warnings",
  {
    id: serial("id").primaryKey(),
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 40 }).notNull().$type<WarningCode>(),
    severity: varchar("severity", { length: 10 }).notNull().$type<Severity>(),
    message: text("message").notNull(),
    measures: jsonb("measures").$type<number[] | null>(),
    part: varchar("part", { length: 10 }).$type<Part | null>(),
    detail: jsonb("detail").$type<Record<string, unknown> | null>(),
    /** 사용자가 확인했거나 교정함. 신뢰도 감점에서 빠진다 */
    resolved: boolean("resolved").notNull().default(false),
  },
  (t) => [index("song_warnings_song_idx").on(t.songId)],
);

/** 교정 이력 — 되돌리기용 */
export const songEdits = pgTable("song_edits", {
  id: serial("id").primaryKey(),
  songId: integer("song_id")
    .notNull()
    .references(() => songs.id, { onDelete: "cascade" }),
  /** octaveShift | voiceSwap | timeSignature | includeStaff | resolveWarning */
  kind: varchar("kind", { length: 30 }).notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 가사 행의 타입이 LyricSyllable 과 어긋나지 않는지 컴파일 시점에 묶어 둔다 */
export type SongLyricRow = typeof songLyrics.$inferSelect;
const _lyricShape: (row: SongLyricRow) => LyricSyllable = (row) => ({
  m: row.measure,
  b: Number(row.beat),
  text: row.text,
});
void _lyricShape;

export const songsRelations = relations(songs, ({ many }) => ({
  pages: many(songPages),
  parts: many(songParts),
  measures: many(songMeasures),
  lyrics: many(songLyrics),
  warnings: many(songWarnings),
  edits: many(songEdits),
}));
