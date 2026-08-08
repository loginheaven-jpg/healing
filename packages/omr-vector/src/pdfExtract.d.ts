/**
 * 1단계: PDF에서 원시 기하 정보를 뽑는다.
 *
 * pdfjs의 operator list를 순회하면서 CTM(current transformation matrix)을
 * 직접 추적한다. CTM을 무시하면 좌표가 10배 틀린다 — LilyPond는 전역을
 * 0.1배로 축소한 뒤 텍스트마다 10배로 되돌리기 때문이다.
 *
 * 이 단계는 음악을 전혀 이해하지 않는다. 오직 "무엇이 어디에 있는가"만 뽑는다.
 */
import type { FilledRect, Glyph, Line } from "./types.js";
export type PageGeometry = {
    width: number;
    height: number;
    glyphs: Glyph[];
    /** 수평선 (오선, 덧줄, 이음줄 일부) */
    hLines: Line[];
    /** 수직선 (마디선, 기둥) */
    vLines: Line[];
    /** 채워진 사각형 (기둥, 굵은 마디선) */
    rects: FilledRect[];
    /** 텍스트 (가사, 마디 번호, 파트 이름) */
    texts: {
        x: number;
        y: number;
        text: string;
        size: number;
    }[];
    /** 사전에 없던 글리프 이름 */
    unknownGlyphNames: string[];
    /**
     * 음악 폰트 항목인데 이름도 숫자도 없어 해석하지 못한 것.
     *
     * 예전에는 이런 항목이 두 갈래 어디에도 걸리지 않고 흔적 없이 사라졌다.
     * 버리더라도 기록은 남겨야 다음에 무엇을 놓쳤는지 알 수 있다.
     */
    droppedGlyphs: {
        code: number;
        unicode: string;
        x: number;
        y: number;
        size: number;
    }[];
    /**
     * 문자 코드를 유니코드로 신뢰할 수 없었던 폰트 이름들.
     *
     * 비어 있지 않으면 그 PDF의 가사를 읽지 못했다는 뜻이므로, 상위 단계에서
     * 사용자에게 경고를 남긴다. 조용히 가사를 비우면 "왜 가사가 없지"라는
     * 의문만 남는다.
     */
    untrustedTextFonts: string[];
};
export type ExtractResult = {
    pages: PageGeometry[];
    /** 벡터 판정 결과 */
    isVector: boolean;
    /** 판정 근거 */
    vectorReason: string;
};
export declare function extractPdfGeometry(data: Uint8Array): Promise<ExtractResult>;
//# sourceMappingURL=pdfExtract.d.ts.map