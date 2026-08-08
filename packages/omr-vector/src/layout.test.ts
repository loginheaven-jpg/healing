/**
 * 악보 구조 분기 회귀 테스트.
 *
 * SATB 2단/4단 외에도 성가대가 실제로 쓰는 형태가 있다.
 *
 *  - 단성부: 파트 연습용으로 한 성부만 뽑은 악보, 독창 악보
 *  - 3단 혼합: 성악 2단 + 피아노 반주 1단
 *
 * 이 두 경우에서 파서가 (a) 구조를 맞게 판별하는지 (b) 정상 입력을
 * 실패로 오진하지 않는지를 고정한다. 특히 (b)가 중요하다. 완벽히 읽은
 * 악보에 "성부 분리 실패" 경고를 띄우면 사용자가 도구를 불신한다.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScorePdf } from "./parseScore.js";

const FIX = path.resolve(import.meta.dirname, "../fixtures");
const read = (n: string) => new Uint8Array(fs.readFileSync(path.join(FIX, n)));
const gt = (n: string) => JSON.parse(fs.readFileSync(path.join(FIX, n), "utf8"));

describe("단성부 악보", () => {
  it("single로 판별하고 음높이를 100% 읽는다", async () => {
    const r = await parseScorePdf(read("single_staff.pdf"));
    expect(r.layout).toBe("single");
    expect(r.parts.Soprano.map(n => n.p)).toEqual(gt("ground_truth_single.json").Melody);
  });

  it("4파트가 없다는 이유로 실패 경고를 내지 않는다", async () => {
    const r = await parseScorePdf(read("single_staff.pdf"));
    const voiceMissing = r.warnings.filter(w => w.code === "VOICE_MISSING");
    expect(voiceMissing, "단성부는 4파트가 없는 것이 정상").toHaveLength(0);
  });

  it("신뢰도가 실제 판독 품질을 반영한다", async () => {
    const r = await parseScorePdf(read("single_staff.pdf"));
    // 음높이 100%를 읽었으므로 높아야 한다. 빈 파트 감점으로 5까지
    // 떨어지던 버그의 회귀 방지.
    expect(r.confidence).toBeGreaterThanOrEqual(80);
  });
});

describe("3단 혼합 악보 (성악 2단 + 반주 1단)", () => {
  it("반주 오선을 제외하고 성악 2단만 4성부로 분리한다", async () => {
    const r = await parseScorePdf(read("three_staff.pdf"));
    const g = gt("ground_truth_three.json");
    for (const part of ["Soprano", "Alto", "Tenor", "Bass"] as const) {
      expect(r.parts[part].map(n => n.p), `${part} 파트`).toEqual(g[part]);
    }
  });

  it("반주를 성부로 착각해 옥타브 보정을 발동시키지 않는다", async () => {
    const r = await parseScorePdf(read("three_staff.pdf"));
    // 반주 오선을 테너로 배정하면 음역 이탈로 RANGE_VIOLATION이 쏟아진다
    expect(r.warnings.filter(w => w.code === "RANGE_VIOLATION")).toHaveLength(0);
  });

  it("반주 판별 사실을 사용자에게 알린다", async () => {
    const r = await parseScorePdf(read("three_staff.pdf"));
    const notice = r.warnings.find(w => w.message.includes("반주"));
    expect(notice, "판단 근거를 숨기지 않아야 한다").toBeDefined();
  });
});
