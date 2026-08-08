/**
 * 4단계: 글리프를 실제 음표로 변환한다.
 *
 * 음높이 계산이 이 파일의 핵심이다. 원리는 단순하다.
 *   1) 음표머리 Y좌표와 오선 맨 아래 줄의 Y좌표 차이를 구한다
 *   2) 그 차이를 (오선 간격 / 2)로 나누면 "계단 수"가 나온다
 *   3) 계단 수는 diatonic step(도레미) 단위이므로 음자리표 기준음에 더한다
 *   4) 조표와 임시표를 적용해 반음을 조정한다
 *
 * 음길이는 글리프 이름(머리 모양)에서 시작하지만, 4분음표와 8분음표가 같은
 * 머리를 쓰므로 꼬리(flag)와 빔(beam)을 함께 봐야 한다.
 */
import type { FilledRect, Glyph, Line, Staff } from "./types.js";
/** 음표머리 하나 (음길이 확정 전) */
export type RawNote = {
    x: number;
    y: number;
    /** MIDI 음높이 */
    midi: number;
    /** 글리프에서 얻은 기본 음길이 (4분음표=1.0). 검은 머리는 1.0으로 시작 */
    baseDuration: number;
    /** 부점 개수 */
    dots: number;
    /** 꼬리 개수 (0이면 4분음표 이상) */
    flags: number;
    /** 소속 오선 인덱스 */
    staffIdx: number;
    /** 마디 번호 */
    measure: number;
    /** 확정된 음길이 */
    duration: number;
    /** 음이름 (진단용) */
    name: string;
};
/**
 * 오선 위 Y좌표를 MIDI 음높이로 변환한다.
 *
 * @param y        음표머리 중심 Y (PDF 좌표계, 위로 증가)
 * @param staff    소속 오선
 * @param accidental 이 음에 적용된 임시표 (null이면 조표만 적용)
 */
export declare function yToMidi(y: number, staff: Staff, accidental: number | null): {
    midi: number;
    name: string;
    step: number;
};
/**
 * 마디선 X좌표 목록을 구한다.
 *
 * 함정: 음표 기둥(stem)이 우연히 오선 상하 범위를 덮으면 마디선으로 오인된다.
 * 실측에서 낮은음자리표 오선의 마디선이 8개가 아니라 13개로 검출됐고,
 * 그 결과 마디 번호가 밀려 마디 총 음길이가 4.0이 아닌 0.5, 1.0 등으로
 * 깨졌다. 원인은 낮은음자리표 파트의 기둥이 위로 뻗어 오선 높이와
 * 비슷해졌기 때문이다.
 *
 * 구분 근거는 **선 두께**다. 실측값이 명확히 갈렸다.
 *   마디선: 두께 0.95, 길이 19.92 (오선 높이와 정확히 일치)
 *   기둥:   두께 0.25, 길이 21~26 (오선 높이를 넘거나 어긋남)
 *
 * 기둥은 마디선보다 얇게 조판된다. 이는 악보 조판의 보편적 관례이므로
 * LilyPond뿐 아니라 다른 프로그램에서도 성립한다.
 * 또한 마디선은 오선 상하 경계에 **정확히** 맞고, 기둥은 어긋난다.
 */
export declare function detectBarlines(vLines: Line[], staff: Staff): number[];
/**
 * 시스템 내 모든 오선의 마디선을 통합한다.
 *
 * 같은 시스템의 오선들은 마디선 X좌표가 동일해야 한다. 한 오선에서
 * 놓친 마디선을 다른 오선이 보완하므로, 통합하면 검출이 안정된다.
 * 이것이 오선별로 따로 계산하는 것보다 신뢰도가 높다.
 */
export declare function unifyBarlines(perStaff: number[][], spacing: number): number[];
/**
 * 음표머리를 추출하고 음높이·음길이를 계산한다.
 *
 * @param staffIdx 이 오선의 인덱스 (여러 오선을 순회하며 호출)
 */
export declare function parseNotesOnStaff(staff: Staff, staffIdx: number, glyphs: Glyph[], rects: FilledRect[], barlines: number[], 
/**
 * 인접 오선의 몸통 Y범위. 개방악보에서 오선 간격이 좁으면 덧줄 허용범위가
 * 이웃 오선까지 침범해 다른 파트의 음표를 흡수한다.
 *
 * 실측에서 이 문제를 겪었다. 테너 오선(bottomY=667.6)에 알토 오선의
 * 음표(y=702~707)가 섞여 들어왔다. 알토 오선의 bottomY는 712.4로
 * 테너 오선 위 45pt(= 9 × spacing)에 있는데, 덧줄 허용범위 5칸
 * (=25pt)에 알토 음표 일부가 걸린 것이다.
 *
 * 중간선으로 딱 잘라내는 방식은 실패했다. 오선 간격이 좁으면 중간선이
 * 오선에 너무 가까워져 정상적인 덧줄 음표까지 잘려나간다.
 * 대신 **최근접 오선 판정**을 쓴다 (belongsToThisStaff 참고).
 */
neighborBounds?: {
    above?: {
        bottomY: number;
        topY: number;
    };
    below?: {
        bottomY: number;
        topY: number;
    };
}): RawNote[];
/**
 * 음표를 마디 내 박 위치(beat)로 변환한다.
 *
 * 여기서 화음(동일 X에 여러 음표)을 하나의 "시각 이벤트"로 묶는다.
 * 화음 내 음표들은 같은 b(시작 위치)를 갖는다.
 */
export type TimedEvent = {
    measure: number;
    /** 마디 내 시작 위치. 4분음표 = 1.0 */
    beat: number;
    /** 음길이 */
    duration: number;
    /** 이 시점에 울리는 음들 (Y 내림차순 = 높은음부터) */
    notes: RawNote[];
    /** 원본 X (진단용) */
    x: number;
};
/**
 * 같은 X에 있는 음표를 묶고, 마디 내 박 위치를 계산한다.
 *
 * 박 위치는 각 이벤트의 음길이를 누적해서 구한다. 이것이 신뢰할 수 있는
 * 이유는 악보가 시간 순서대로 왼쪽에서 오른쪽으로 배치되기 때문이다.
 * X좌표 비례로 계산하면 조판 여백 때문에 틀린다.
 */
export declare function toTimedEvents(notes: RawNote[], spacing: number): TimedEvent[];
//# sourceMappingURL=noteParse.d.ts.map