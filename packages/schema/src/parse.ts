/**
 * 인식 결과의 정본 자료형.
 *
 * 이 파일이 이 프로젝트의 중심 규칙을 담는다:
 * **벡터 경로와 이미지 경로는 같은 ParseResult 를 만든다.**
 * 뒤쪽(저장·재생·화면)은 어느 경로로 왔는지 알 필요가 없다.
 * docs/ARCHITECTURE.md 3장·4.1절
 *
 * 좌표계 주의 — PDF 원본은 Y축이 위로 증가한다. 파서 내부는 PDF 좌표계를
 * 그대로 쓰고, MeasureBox 로 나올 때만 **페이지 이미지 좌표계(px, Y 아래로 증가)**
 * 로 뒤집는다. 두 경로 모두 이 좌표계로 통일한다. docs/ARCHITECTURE.md 4.3
 */

/** 네 파트. 표시 순서이기도 하다(위에서 아래). */
export const PARTS = ["Soprano", "Alto", "Tenor", "Bass"] as const;
export type Part = (typeof PARTS)[number];

export const LAYOUT_TYPES = [
  "closed-2staff", // 2단 축소악보 (S+A / T+B)
  "open-4staff", // 4단 개방악보
  "mixed-3staff", // 3단 혼합
  "single", // 단성부
  "unknown",
] as const;
export type LayoutType = (typeof LAYOUT_TYPES)[number];

/**
 * 음표 하나. 필드명이 짧은 이유는 페이로드 크기 때문이다.
 * 한 곡에 수천 개가 실려 나간다.
 */
export type Note = {
  /** 마디 번호 (1부터) */
  m: number;
  /** 마디 안 시작 박. 4분음표 = 1.0 */
  b: number;
  /** 음길이. 4분음표 = 1.0 */
  d: number;
  /** MIDI 음높이. 60 = C4 */
  p: number;
};

/**
 * 쉼표. 재생에는 쓰이지 않지만 박 위치 계산과 마디 길이 검증에 필요하다.
 * 쉼표를 버리면 박이 전진하지 않아 뒤 음표가 통째로 앞으로 밀린다. docs/OMR.md 5.1
 */
export type Rest = {
  m: number;
  b: number;
  d: number;
};

export const SEVERITIES = ["info", "warn", "error"] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * 경고 코드.
 *
 * **모든 한계는 경고로 사용자에게 알린다**가 이 프로젝트의 원칙이다.
 * 조용히 틀린 결과를 내지 않는다. docs/OMR.md 9장
 */
export const WARNING_CODES = [
  "STAFF_COUNT_UNEXPECTED", // 오선 수가 예상과 다름
  "VOICE_MISSING", // 특정 파트 음표가 현저히 적음
  "DIVISI_SUSPECTED", // 3성부 이상 동시 발생
  "UNISON_AMBIGUOUS", // 동음이라 성부 구분 불가
  "RANGE_VIOLATION", // 파트 음역 이탈
  "VOICE_CROSSING", // 성부 교차
  "MEASURE_DURATION_MISMATCH", // 마디 총 길이가 박자표와 불일치
  "TIME_SIGNATURE_GUESSED", // 박자표를 찾지 못해 가정함
  "UNKNOWN_GLYPH", // 사전에 없는 기호
  "CLEF_UNRECOGNIZED", // 음자리표 인식 실패
  "REPEAT_STRUCTURE", // 반복 구조 발견 (미지원)
  "MULTI_PAGE", // 여러 쪽 (경계 연결 주의)
  "LYRICS_UNREADABLE", // 가사 판독 불가
  "LOW_GLYPH_COUNT", // 기호가 너무 적음 (벡터가 아닐 가능성)
  "TIE_UNSUPPORTED", // 붙임줄 미처리 (벡터 경로)
  "KEY_CHANGE_UNSUPPORTED", // 중간 전조 미지원
  "POLYRHYTHM_SUSPECTED", // 성부마다 다른 리듬 (docs/OMR.md 5.4)
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

export type Warning = {
  code: WarningCode;
  severity: Severity;
  /** 사용자에게 그대로 보이는 존대체 완성 문장. docs/SPEC.md 2장·4.4절 */
  message: string;
  /** 관련 마디. 최대 20개까지만 담는다(화면의 마디 칩 개수 한도) */
  measures?: number[];
  part?: Part;
  /** 측정값 등 상세. 화면 조치 버튼이 참조한다 */
  detail?: Record<string, unknown>;
  /** 사용자가 확인했거나 교정함. 신뢰도 감점에서 제외된다. docs/OMR.md 6장 */
  resolved?: boolean;
};

/**
 * 마디의 화면상 위치. 악보 뷰의 커서·자동 스크롤·마디 클릭이 이것을 쓴다.
 * 좌표는 **페이지 이미지 좌표계(px)**. 클라이언트는 song_pages.width/height 와
 * 실제 표시 크기의 비율만 곱해서 쓴다. docs/ARCHITECTURE.md 4.3
 */
export type MeasureBox = {
  /** 쪽 번호 (1부터) */
  page: number;
  measure: number;
  /** 그 쪽 안에서의 시스템 순번 (0부터) */
  system: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** 가사 한 음절. 한글은 한 글자가 한 음절이다. docs/OMR.md 5.6 */
export type LyricSyllable = {
  m: number;
  b: number;
  text: string;
};

export type SourceKind = "vector" | "image";

/**
 * 그 파트의 옥타브를 무엇이 결정했는가. **진단용이며 사용자에게 보이지 않는다.**
 *
 *   clef            — 음자리표를 읽어 확정했다. 이것이 정상이다.
 *   range-heuristic — 음자리표로 알 수 없어 음역을 보고 추측했다.
 *                     맞을 수도 있지만 근거가 약하다.
 *
 * 둘을 구분해 기록하지 않으면 "정확한 결과"와 "우연히 맞은 결과"를 가릴 수 없다.
 * 옥타브 이조 음자리표(treble_8)는 성가 테너 보표에서 흔하고, 놓치면 한 옥타브가
 * 통째로 틀린다. 그런데 음역 휴리스틱이 우연히 그것을 덮어 결과만 맞을 수 있다.
 * 그 경우를 "고쳐졌다"고 착각하지 않기 위한 장치다.
 */
export type OctaveSource = "clef" | "range-heuristic";

export type ParseResult = {
  parts: Record<Part, Note[]>;
  /** 파트별 쉼표. 재생에는 안 쓰지만 검증에 쓴다 */
  rests: Record<Part, Rest[]>;
  /** 진단용: 파트마다 옥타브를 무엇이 결정했는지. 사용자에게 보이지 않는다 */
  octaveSource: Record<Part, OctaveSource>;
  layout: LayoutType;
  /** 조 (fifths). -7..+7 */
  keyFifths: number;
  /** 박자표. 중간 박자 변경은 1차 미지원이며 경고로 알린다 */
  timeSignature: { numerator: number; denominator: number };
  /** 악보에 적힌 빠르기. 없으면 null 이고 화면은 기본값을 쓴다 */
  tempoBpm: number | null;
  measureCount: number;
  lyrics: LyricSyllable[];
  /** 산출 실패 시 빈 배열. 자동 스크롤이 경과 시간 비례로 대체된다 */
  measureBoxes: MeasureBox[];
  warnings: Warning[];
  /** 0..100 정수. 계산식은 docs/OMR.md 6장 */
  confidence: number;
  source: SourceKind;
  elapsedMs: number;
  pageCount: number;
};
