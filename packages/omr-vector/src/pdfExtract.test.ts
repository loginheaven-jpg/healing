/**
 * 텍스트(가사) 판독 신뢰성 테스트.
 *
 * 두 방향을 모두 고정한다.
 *   1) ToUnicode가 있으면 한글이 정확히 읽힌다
 *   2) 없으면 텍스트를 버리고 폰트를 신고한다
 *
 * 2번만 검증하면 "그냥 항상 가사를 버리는" 회귀를 놓친다. 그렇게 되면
 * 정상 악보의 가사까지 사라지므로 반드시 짝으로 둔다.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfGeometry } from "./pdfExtract.js";

const FIXTURE_DIR = path.resolve(import.meta.dirname, "../fixtures");

function load(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURE_DIR, name)));
}

describe("PDF 텍스트 판독", () => {
  it("ToUnicode가 있으면 한글을 정확히 읽는다", async () => {
    // reportlab으로 만든 PDF (TrueType 임베드 + ToUnicode CMap 포함).
    // 생성 스크립트는 tests/fixtures/make_kor_tounicode.py
    const res = await extractPdfGeometry(load("kor_tounicode.pdf"));
    const page = res.pages[0];

    const text = page.texts.map((t) => t.text).join("");
    expect(text).toContain("주를찬양하여라");
    expect(page.untrustedTextFonts).toHaveLength(0);
  });

  it("ToUnicode가 없는 CID 폰트의 텍스트는 버리고 폰트를 신고한다", async () => {
    // LilyPond 출력 (Identity-H, ToUnicode 없음)
    const res = await extractPdfGeometry(load("closed_chord.pdf"));
    const page = res.pages[0];

    expect(page.untrustedTextFonts.length).toBeGreaterThan(0);
    expect(page.untrustedTextFonts.join(",")).toMatch(/CJK/i);

    // 깨진 한글이 하나도 섞이지 않아야 한다.
    // 실제 버그였던 "횵융퍊펥씵"류가 여기서 걸린다.
    const hangul = page.texts.filter((t) => /[\uAC00-\uD7A3]/.test(t.text));
    expect(hangul, "깨진 한글이 남아 있음").toHaveLength(0);
  });
});
