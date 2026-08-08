/**
 * 2단계: 수평선에서 오선(5줄 묶음)을 찾는다.
 *
 * 실증에서 확인한 대로 벡터 PDF의 오선은 완벽한 등간격 수평선이다.
 * 따라서 딥러닝이나 이미지 처리가 전혀 필요 없고, Y좌표를 클러스터링하면 된다.
 *
 * 오선 간격(spacing)은 이 파이프라인 전체에서 가장 중요한 값이다.
 * 음높이는 "오선 기준선에서 spacing/2 단위로 몇 칸 떨어졌는가"로 계산되므로,
 * spacing이 틀리면 모든 음이 틀린다.
 */
import type { ClefType, Glyph, Line, Staff } from "./types.js";
/**
 * 수평선 목록에서 오선을 검출한다.
 * 덧줄(ledger line)은 짧으므로 길이 필터로 걸러진다.
 */
export declare function detectStaves(hLines: Line[], pageWidth: number): Omit<Staff, "clef" | "keyAlters" | "keyFifths">[];
/**
 * 각 오선의 음자리표를 판정한다.
 *
 * 음자리표 글리프는 오선 왼쪽 끝에 있고 오선 5줄 전체 높이에 걸친다.
 * `treble8vb`(테너용 옥타브 이동 음자리표)는 글리프 이름으로 구분되지 않는
 * 경우가 있어, 음자리표 아래의 작은 "8" 텍스트로도 판정한다.
 */
export declare function assignClefs(staves: Omit<Staff, "clef" | "keyAlters" | "keyFifths">[], glyphs: Glyph[], texts: {
    x: number;
    y: number;
    text: string;
    size: number;
}[]): {
    clefs: ClefType[];
    unrecognized: number[];
};
/**
 * 음자리표별 기준 정보.
 *
 * refMidi  : 오선 맨 아래 줄에 놓인 음의 MIDI 번호
 * refStep  : 그 음의 절대 diatonic step. `옥타브 × 7 + 음이름인덱스`
 *            음이름 인덱스는 C=0, D=1, E=2, F=3, G=4, A=5, B=6
 *
 * 예) 높은음자리표는 맨 아래 줄이 E4(MIDI 64).
 *     낮은음자리표는 맨 아래 줄이 G2(MIDI 43).
 *     테너용 treble8vb는 높은음자리표를 한 옥타브 낮게 읽으므로 E3(MIDI 52).
 *
 * 실측 검증: closed_chord.pdf에서 낮은음자리표 파트(T/B)가 100% 일치했고
 * 높은음자리표 파트가 정확히 장3도(2계단) 높게 나왔다. 이는 refStep의
 * 음이름 인덱스를 잘못 넣었다는 신호였다. E는 인덱스 2인데 4를 넣어
 * 2계단 밀린 것이다. 아래 값은 수정 후 재검증한 값이다.
 */
export declare const CLEF_REF: Record<ClefType, {
    refMidi: number;
    refStep: number;
}>;
/** diatonic step(C=0..B=6) → 옥타브 내 semitone */
export declare const STEP_SEMITONE: number[];
/** step 인덱스 → 음이름 */
export declare const STEP_NAME: string[];
//# sourceMappingURL=staffDetect.d.ts.map