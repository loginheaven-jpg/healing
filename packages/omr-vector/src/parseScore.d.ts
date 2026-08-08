/**
 * 6단계: 전체 파이프라인을 잇는 진입점.
 *
 * extractPdfGeometry → detectStaves → groupIntoSystems → parseNotesOnStaff
 * → detectLayout → splitVoices → 이상 검출 → ParseResult
 *
 * 여러 시스템(악보 줄)과 여러 페이지를 하나의 연속된 곡으로 이어붙이는
 * 것이 이 파일의 또 다른 역할이다. 마디 번호를 전역으로 매겨야 한다.
 */
import type { ParseResult } from "./types.js";
export declare function parseScorePdf(data: Uint8Array): Promise<ParseResult>;
/** 벡터 파싱이 불가능할 때 (스캔 이미지) */
export declare class VectorParseUnavailable extends Error {
    reason: string;
    constructor(reason: string);
}
//# sourceMappingURL=parseScore.d.ts.map