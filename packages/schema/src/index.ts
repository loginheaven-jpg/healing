/**
 * @healing/schema — 두 인식 경로와 서버·클라이언트가 공유하는 자료형.
 *
 * 여기에 두는 것: 경로에 무관한 **계약**.
 * 여기에 두지 않는 것: 특정 경로의 중간 표현(예: Glyph, Staff, Line).
 *   그것들은 packages/omr-vector/src/types.ts 에 남는다.
 */

export * from "./parse.js";
