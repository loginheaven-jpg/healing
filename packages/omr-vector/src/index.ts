/**
 * @healing/omr-vector — 벡터 PDF 파서의 공개 입구.
 *
 * 안쪽 모듈(pdfExtract, staffDetect, noteParse …)은 파이프라인의 중간 단계입니다.
 * 회귀 테스트는 안쪽을 직접 부르지만, 앱은 이 입구만 씁니다.
 */

export { parseScorePdf, VectorParseUnavailable } from "./parseScore.js";
export type * from "./types.js";
