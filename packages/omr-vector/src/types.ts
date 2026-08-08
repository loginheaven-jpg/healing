/**
 * 벡터 PDF 파싱 파이프라인의 **내부** 타입.
 *
 * 도메인 자료형(ParseResult · Note · Rest · Warning · Part …)은 여기에 두지
 * 않는다. 정본은 `@healing/schema` 이며, "두 인식 경로는 같은 ParseResult 를
 * 만든다" 는 규칙이 그 패키지에 있다. 정의가 둘로 갈리면 어느 쪽을 import
 * 했는지에 따라 다르게 동작하므로, 여기서는 **재수출만** 한다.
 *
 * 여기 남는 것은 이 파서 안에서만 뜻이 있는 중간 표현이다.
 * Glyph · GlyphKind · ClefType · Line · FilledRect · Staff.
 *
 * 좌표계 주의: PDF 원본은 Y축이 위로 증가한다(음이 높으면 Y가 크다).
 * 파서 내부에서는 이 PDF 좌표계를 그대로 유지하고, MeasureBox 로 나올 때만
 * 뒤집는다. 중간에 뒤집으면 음높이 계산 부호가 헷갈려 버그가 생긴다.
 */

export type {
  LayoutType,
  LyricSyllable,
  MeasureBox,
  Note,
  OctaveSource,
  ParseResult,
  Part,
  Rest,
  Severity,
  SourceKind,
  Warning,
  WarningCode,
} from "@healing/schema";

/** 파싱 중간 표현: 페이지 위 글리프 하나 */
export type Glyph = {
  /** 폰트 Differences 배열에서 얻은 글리프 이름 (예: "noteheads.s2") */
  name: string;
  /** 사전에서 해석한 의미. 미등록이면 null */
  kind: GlyphKind | null;
  /** 페이지 좌표 (PDF 좌표계, Y는 위로 증가) */
  x: number;
  y: number;
  /** 렌더 크기 (폰트 크기 × CTM 스케일) */
  size: number;
  /** 글리프 폭 (폰트 단위 1/1000em) */
  width: number;
};

/** 글리프의 음악적 의미 */
export type GlyphKind =
  | { type: "notehead"; duration: number } // duration: 4분음표=1.0, 0=기둥으로 판정
  | { type: "clef"; clef: ClefType }
  | { type: "rest"; duration: number }
  | { type: "accidental"; alter: number } // -2..+2
  | { type: "dot" } // 점(부점) — 음길이 1.5배
  | { type: "flag"; count: number } // 꼬리 — 8분음표 이하
  | { type: "timesig"; digit: number }
  | { type: "brace" } // 보표 묶음 표시
  | { type: "other" };

export type ClefType =
  "treble" | "treble8va" | "treble8vb" | "treble15mb" | "bass" | "bass8vb" | "alto" | "tenor";

/** 검출된 직선 */
export type Line = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 선 두께 */
  width: number;
};

/** 검출된 채워진 사각형 (기둥 등) */
export type FilledRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** 오선 하나 (5줄) */
export type Staff = {
  /** 5줄의 Y좌표. 내림차순 정렬 (위에서 아래로) */
  lineYs: number[];
  /** 줄 간격 */
  spacing: number;
  /** 가장 아래 줄 Y (음높이 계산 기준) */
  bottomY: number;
  /** 가장 위 줄 Y */
  topY: number;
  /** 좌우 범위 */
  x1: number;
  x2: number;
  /** 음자리표 */
  clef: ClefType;
  /** 조표에 의한 기본 변화음 (음이름 → alter) */
  keyAlters: Record<string, number>;
  /** 조표의 sharp/flat 개수. 양수=sharp, 음수=flat */
  keyFifths: number;
};
