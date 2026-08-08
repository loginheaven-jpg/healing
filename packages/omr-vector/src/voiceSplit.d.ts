/**
 * 5단계: 보표 구조를 판별하고 성부를 분리한다.
 *
 * 이 파일이 다루는 문제가 앞선 검증에서 확인한 핵심 난제다.
 *
 * 2단 축소악보에서는 한 오선에 두 성부가 화음으로 겹쳐 있다. OMR은 이를
 * "화음 트랙 2개"로 내놓기 때문에, 그대로 재생하면 S+A와 T+B 두 개만 나온다.
 * 화음을 성부로 쪼개야 파트별 연습이 가능하다.
 *
 * 검증에서 얻은 두 가지 원칙:
 *   1) 기둥 방향으로 성부를 구분한 악보라도 그 정보에 의존할 수 없다.
 *      화음 표기형과 기둥 분리형이 동일하게 인식되기 때문이다.
 *      따라서 **음높이 정렬**이 유일하게 믿을 수 있는 기준이다.
 *   2) 화음 내 순서는 보장되지 않는다. 반드시 명시적으로 정렬해야 한다.
 *      정렬을 빠뜨리면 베이스 파트에서 테너 음이 나온다.
 */
import type { TimedEvent } from "./noteParse.js";
import type { ClefType, LayoutType, Note, Part, Staff, Warning } from "./types.js";
/**
 * SATB 각 파트의 통상 음역 (MIDI). 이상 검출과 옥타브 보정에 쓴다.
 *
 * 이 값을 좁게 잡으면 정상 악보를 망친다. 실측에서 이 문제를 겪었다.
 * open_satb.pdf의 소프라노는 C5~C6(72~84)를 오르내리는 정상적인 성가인데,
 * comfortable 구간을 60~79로 좁게 두어 중심이 69가 되었고, 중위값 77이
 * "1옥타브 높다"고 판정되어 전체가 C4로 내려갔다. 테너도 같은 이유로 틀렸다.
 *
 * 따라서 음역은 **실제 합창 음역의 최대치**로 넓게 잡고, 옥타브 보정은
 * 명백한 이탈(min/max를 벗어남)에만 발동해야 한다. 중심에서 멀다는
 * 이유만으로 보정하면 정상 악보를 훼손한다.
 */
export declare const PART_RANGE: Record<Part, {
    min: number;
    max: number;
    comfortable: [number, number];
}>;
export declare const PART_ORDER: Part[];
/**
 * 보표 구조를 판별한다.
 *
 * 오선 개수만으로 판단하면 위험하다. 특히 반주가 붙은 악보는
 * "성악 2단 + 피아노 2단 = 4단"이 되어 4단 개방악보로 오인된다.
 * 그래서 음자리표 구성과 화음 밀도를 함께 본다.
 */
export declare function detectLayout(staves: Staff[], eventsPerStaff: TimedEvent[][]): {
    layout: LayoutType;
    warnings: Warning[];
    useStaves?: number[];
};
/**
 * 2단 축소악보의 화음을 4성부로 분리한다.
 *
 * 상단 오선 → 높은음이 Soprano, 낮은음이 Alto
 * 하단 오선 → 높은음이 Tenor, 낮은음이 Bass
 *
 * 단성부(음 1개만)인 경우 처리가 까다롭다. 두 성부가 같은 음을 부르는
 * 동음(unison)일 수도 있고, 한 성부가 쉬는 것일 수도 있다.
 * 여기서는 동음으로 간주하되 경고를 남긴다. 조용히 한 파트를 비우면
 * 사용자가 "내 파트가 안 나온다"고 겪게 되므로, 소리는 내고 알려주는 편이 낫다.
 */
export declare function splitClosedScore(upperEvents: TimedEvent[], lowerEvents: TimedEvent[]): {
    parts: Record<Part, Note[]>;
    warnings: Warning[];
};
/**
 * 4단 개방악보에서 파트를 배정한다.
 *
 * 위에서 아래로 S, A, T, B가 기본이지만 음자리표와 음역으로 검증한다.
 * 검증 없이 순서만 믿으면 파트 순서가 다른 악보에서 전부 틀린다.
 */
export declare function splitOpenScore(staves: Staff[], eventsPerStaff: TimedEvent[][]): {
    parts: Record<Part, Note[]>;
    warnings: Warning[];
};
/**
 * 파트 음역 기반 옥타브 보정.
 *
 * 앞선 검증에서 정확도를 44.8%에서 94.8%로 올린 후처리다. 음자리표를
 * 잘못 읽으면 음이 옥타브 단위로 통째로 밀리는데, 이는 개별 음표 오류가
 * 아니라 체계적 오류이므로 파트 전체를 한 번에 되돌릴 수 있다.
 *
 * 벡터 경로에서는 음자리표를 정확히 읽으므로 보통 발동하지 않는다.
 * 발동한다면 그 자체가 인식에 문제가 있다는 신호이므로 경고를 남긴다.
 */
export declare function normalizeOctave(parts: Record<Part, Note[]>): {
    parts: Record<Part, Note[]>;
    warnings: Warning[];
};
/**
 * 파트별 음표 수 균형을 검사한다.
 *
 * 한 파트만 음표가 현저히 적으면 성부 분리가 실패한 것이다. 이 검사가
 * 앞선 검증에서 "베이스 45% 소실"을 잡아낸 게이트에 해당한다.
 *
 * 단성부 악보(`layout === "single"`)에는 적용하지 않는다. 파트 연습용으로
 * 한 성부만 뽑은 악보나 독창 악보는 4파트가 없는 것이 정상이다.
 * 실측(single_staff.pdf)에서 이 검사가 error 3건을 내며 신뢰도를 5로
 * 떨어뜨렸는데, 악보 자체는 완벽하게 읽힌 상태였다. 정상 입력을 실패로
 * 보고하는 것은 놓친 오류보다 해롭다 — 사용자가 도구를 불신하게 된다.
 */
export declare function checkPartBalance(parts: Record<Part, Note[]>, layout?: LayoutType): Warning[];
/** 마디 총 음길이가 박자표와 맞는지 검사 */
export declare function checkMeasureDurations(parts: Record<Part, Note[]>, timeSignature: {
    numerator: number;
    denominator: number;
}): Warning[];
/** 한국어 파트명 */
export declare function koPart(part: Part): string;
/** 음자리표 한국어명 (진단 메시지용) */
export declare function koClef(clef: ClefType): string;
//# sourceMappingURL=voiceSplit.d.ts.map