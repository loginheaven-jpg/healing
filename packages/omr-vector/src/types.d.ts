/**
 * 벡터 PDF 파싱 파이프라인의 공용 타입.
 *
 * 좌표계 주의: PDF 원본은 Y축이 위로 증가한다(음이 높으면 Y가 크다).
 * 파서 내부에서는 이 PDF 좌표계를 그대로 유지하고, 화면 렌더링 시점에만
 * 뒤집는다. 중간에 뒤집으면 음높이 계산 부호가 헷갈려 버그가 생긴다.
 */
export type Part = "Soprano" | "Alto" | "Tenor" | "Bass";
/** 클라이언트로 전달되는 음표. 필드명이 짧은 이유는 페이로드 크기 때문. */
export type Note = {
    /** 마디 번호 (1부터) */
    m: number;
    /** 마디 내 시작 위치. 4분음표 = 1.0 */
    b: number;
    /** 음길이. 4분음표 = 1.0 */
    d: number;
    /** MIDI 음높이. 60 = C4 */
    p: number;
};
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
export type GlyphKind = {
    type: "notehead";
    duration: number;
} | {
    type: "clef";
    clef: ClefType;
} | {
    type: "rest";
    duration: number;
} | {
    type: "accidental";
    alter: number;
} | {
    type: "dot";
} | {
    type: "flag";
    count: number;
} | {
    type: "timesig";
    digit: number;
} | {
    type: "brace";
} | {
    type: "other";
};
export type ClefType = "treble" | "bass" | "treble8vb" | "alto" | "tenor";
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
/** 보표 구조 유형 */
export type LayoutType = 
/** 2단 축소악보: 높은음자리표=S+A, 낮은음자리표=T+B */
"closed-2staff"
/** 4단 개방악보: 각 오선에 한 파트 */
 | "open-4staff"
/** 3단 (S+A / T / B 등) */
 | "mixed-3staff"
/** 단성부 */
 | "single"
/** 판별 실패 */
 | "unknown";
/** 이상 검출 경고 */
export type Warning = {
    /** 경고 코드. SPEC 8.6절 참조 */
    code: WarningCode;
    /** 심각도. error는 자동 처리 불가, warn은 확인 권장 */
    severity: "error" | "warn" | "info";
    /** 사용자에게 보여줄 한국어 메시지 */
    message: string;
    /** 관련 마디 번호 (있으면) */
    measures?: number[];
    /** 관련 파트 (있으면) */
    part?: Part;
    /** 측정값 등 상세 정보 */
    detail?: Record<string, unknown>;
};
export type WarningCode = "STAFF_COUNT_UNEXPECTED" | "VOICE_MISSING" | "DIVISI_SUSPECTED" | "UNISON_AMBIGUOUS" | "RANGE_VIOLATION" | "VOICE_CROSSING" | "MEASURE_DURATION_MISMATCH" | "UNKNOWN_GLYPH" | "CLEF_UNRECOGNIZED" | "REPEAT_STRUCTURE" | "MULTI_PAGE" | "LYRICS_UNREADABLE" | "LOW_GLYPH_COUNT";
/** 파싱 최종 결과 */
export type ParseResult = {
    /** 파트별 음표 */
    parts: Record<Part, Note[]>;
    /** 보표 구조 */
    layout: LayoutType;
    /** 조 (fifths: -7..+7) */
    keyFifths: number;
    /** 박자표 */
    timeSignature: {
        numerator: number;
        denominator: number;
    };
    /** 총 마디 수 */
    measureCount: number;
    /** 가사 (마디·박 위치 → 음절) */
    lyrics: {
        m: number;
        b: number;
        text: string;
    }[];
    /** 이상 검출 결과 */
    warnings: Warning[];
    /** 신뢰도 0..100 */
    confidence: number;
    /** 파싱 경로 */
    source: "vector" | "image";
    /** 처리 시간 ms */
    elapsedMs: number;
    /** 페이지 수 */
    pageCount: number;
};
//# sourceMappingURL=types.d.ts.map