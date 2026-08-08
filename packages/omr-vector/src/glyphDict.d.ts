/**
 * 글리프 이름 → 음악적 의미 사전.
 *
 * 악보 프로그램마다 폰트와 글리프 이름 체계가 다르다.
 *   LilyPond   → Emmentaler ("noteheads.s2", "clefs.G")
 *   MuseScore  → Leland / Bravura, SMuFL 표준 ("noteheadBlack", "gClef")
 *   Finale     → Maestro
 *   Sibelius   → Opus
 *
 * PDF의 폰트 Encoding Differences 배열이 이름을 그대로 알려주므로,
 * 폰트 종류를 미리 알 필요는 없다. 이름만 해석하면 된다.
 *
 * 사전에 없는 이름은 조용히 무시하지 않고 UNKNOWN_GLYPH 경고로 올린다.
 * 그래야 새 악보 프로그램을 만났을 때 사전을 확장할 수 있다.
 */
import type { GlyphKind } from "./types.js";
/**
 * 글리프 이름을 음악적 의미로 해석한다.
 * 해석 실패 시 null을 반환하고, 호출자가 UNKNOWN_GLYPH 경고를 올린다.
 */
export declare function resolveGlyph(name: string): GlyphKind | null;
/** 사전 등록 여부 (테스트·진단용) */
export declare function isKnownGlyph(name: string): boolean;
//# sourceMappingURL=glyphDict.d.ts.map