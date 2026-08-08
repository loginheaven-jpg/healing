/**
 * 3단계: 오선을 "시스템"(악보 한 줄) 단위로 묶는다.
 *
 * 실측에서 4단 개방악보 1페이지가 오선 8개로 나왔다. 이는 4단 악보가
 * 두 줄(system)에 걸쳐 있다는 뜻이다. 오선 개수만 보고 "8단 악보"라고
 * 판단하면 완전히 틀린다.
 *
 * 시스템 경계 판정 근거:
 *   1) 같은 시스템 안의 오선은 세로 간격이 좁고 균일하다
 *   2) 시스템이 바뀌면 간격이 뚜렷하게 벌어진다
 *   3) 시스템 시작점의 X좌표가 다르다 (첫 줄은 들여쓰기, 이후는 왼쪽 정렬)
 *   4) 보표 묶음 표시(brace)나 좌측 세로 연결선이 시스템 범위를 알려준다
 */
import type { Line, Staff } from "./types.js";
export type StaffSystem = {
    /** 이 시스템에 속한 오선들. 위에서 아래 순서 */
    staves: Staff[];
    /** 시스템 좌우 범위 */
    x1: number;
    x2: number;
};
/**
 * 오선 목록을 시스템으로 묶는다.
 * 입력은 Y 내림차순(위에서 아래)으로 정렬되어 있다고 가정한다.
 */
export declare function groupIntoSystems(staves: Staff[], vLines: Line[]): StaffSystem[];
export declare function readKeySignature(staff: Staff, glyphs: {
    kind: {
        type: string;
        alter?: number;
    } | null;
    x: number;
    y: number;
}[]): {
    fifths: number;
    alters: Record<string, number>;
};
/**
 * 박자표를 읽는다.
 *
 * LilyPond는 4/4를 `timesig.C44` 같은 통합 글리프로 그리는 경우가 있어
 * 숫자를 개별로 읽을 수 없다. 이런 경우 이름에서 숫자를 파싱한다.
 * 실패하면 4/4로 가정하되 경고를 남긴다.
 */
export declare function readTimeSignature(glyphs: {
    name: string;
    kind: {
        type: string;
        digit?: number;
    } | null;
    x: number;
    y: number;
}[], staff: Staff): {
    numerator: number;
    denominator: number;
    confident: boolean;
};
//# sourceMappingURL=systemGroup.d.ts.map