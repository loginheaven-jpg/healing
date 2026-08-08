/**
 * 벡터 PDF 파서 회귀 테스트.
 *
 * 이 테스트가 이 프로젝트의 품질 기준선이다. 파서를 손볼 때마다
 * 세 픽스처의 음높이·리듬 정확도가 유지되는지 확인한다.
 *
 * 픽스처는 LilyPond로 생성했고 정답은 LilyPond가 출력한 MIDI에서 뽑았다.
 * 즉 "내가 정답이라고 생각한 것"이 아니라 조판 프로그램이 확정한 값이다.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScorePdf } from "./parseScore.js";
import type { Part } from "./types.js";

const FIXTURE_DIR = path.resolve(import.meta.dirname, "../fixtures");
const PARTS: Part[] = ["Soprano", "Alto", "Tenor", "Bass"];

/**
 * 정답 파일의 키는 두 가지 형태가 있다.
 *   ground_truth.json      → "S", "A", "T", "B" (초기 검증 때 만든 형식)
 *   ground_truth_open.json → "Soprano", "Alto", ... (전체 이름)
 * 둘 다 받아들인다.
 */
type GroundTruth = Record<string, number[]>;

const SHORT: Record<Part, string> = {
  Soprano: "S",
  Alto: "A",
  Tenor: "T",
  Bass: "B",
};

function truthFor(truth: GroundTruth, part: Part): number[] {
  return truth[part] ?? truth[SHORT[part]] ?? [];
}

function loadFixture(name: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURE_DIR, name)));
}

function loadTruth(name: string): GroundTruth {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

/** 파트별 음높이 일치율을 센다 */
function scorePitches(
  got: Record<Part, { p: number }[]>,
  truth: GroundTruth
): { part: Part; correct: number; total: number }[] {
  return PARTS.map(part => {
    const expected = truthFor(truth, part);
    const actual = got[part].map(n => n.p);
    let correct = 0;
    for (let i = 0; i < expected.length; i++) {
      if (actual[i] === expected[i]) correct++;
    }
    return { part, correct, total: expected.length };
  });
}

describe("벡터 PDF 파서 — 2단 축소악보", () => {
  it("화음 표기형에서 4파트를 모두 100% 정확히 추출한다", async () => {
    const result = await parseScorePdf(loadFixture("closed_chord.pdf"));
    const truth = loadTruth("ground_truth.json");

    expect(result.layout).toBe("closed-2staff");
    expect(result.source).toBe("vector");

    for (const { part, correct, total } of scorePitches(result.parts, truth)) {
      expect(total, `${part} 정답 데이터 존재`).toBeGreaterThan(0);
      expect(correct, `${part} 음높이`).toBe(total);
    }
  });

  it("기둥 분리형에서도 동일하게 100% 정확하다", async () => {
    const result = await parseScorePdf(loadFixture("closed_stems.pdf"));
    const truth = loadTruth("ground_truth.json");

    expect(result.layout).toBe("closed-2staff");

    for (const { part, correct, total } of scorePitches(result.parts, truth)) {
      expect(correct, `${part} 음높이`).toBe(total);
    }
  });

  /*
   * 가사 정책 테스트.
   *
   * 이 픽스처는 LilyPond가 만든 PDF인데 ToUnicode CMap이 없다. pdfjs는
   * 그런 폰트에서 CID를 유니코드로 착각해 "주"를 "횵"으로 내놓는다.
   * 실제로 배포판에서 "횵융퍊펥씵"이 화면에 나왔다.
   *
   * 그래서 정책을 정했다. 신뢰할 수 없는 글자는 내보내지 않고 경고를 남긴다.
   * 깨진 가사는 없는 가사보다 나쁘다 — 사용자는 종이 악보를 보며 부르므로
   * 가사가 비어도 연습할 수 있지만, 깨진 글자는 앱이 고장났다는 인상만 준다.
   *
   * 따라서 이 테스트는 "가사가 나온다"가 아니라
   * "깨진 가사가 나오지 않고, 이유가 경고로 전달된다"를 검증한다.
   */
  it("판독할 수 없는 가사는 내보내지 않고 경고를 남긴다", async () => {
    const result = await parseScorePdf(loadFixture("closed_chord.pdf"));

    expect(result.lyrics).toHaveLength(0);
    const warn = result.warnings.find(w => w.code === "LYRICS_UNREADABLE");
    expect(warn, "가사 판독 불가 경고").toBeDefined();
    expect(warn?.severity).toBe("info");
    // 음표·연주는 정상이라는 점이 메시지에 담겨야 한다
    expect(warn?.message).toContain("연주");
  });

  it("가사가 있을 때는 마디·박 순으로 정렬되어 나온다", async () => {
    const result = await parseScorePdf(loadFixture("closed_chord.pdf"));
    // 이 픽스처는 가사가 비지만, 정렬 불변식은 어떤 입력에서도 성립해야 한다
    for (let i = 1; i < result.lyrics.length; i++) {
      const prev = result.lyrics[i - 1];
      const cur = result.lyrics[i];
      expect(cur.m > prev.m || (cur.m === prev.m && cur.b >= prev.b)).toBe(true);
    }
  });
});

describe("벡터 PDF 파서 — 4단 개방악보", () => {
  it("테너 옥타브 이동 음자리표를 포함해 100% 정확히 추출한다", async () => {
    const result = await parseScorePdf(loadFixture("open_satb.pdf"));
    const truth = loadTruth("ground_truth_open.json");

    expect(result.layout).toBe("open-4staff");

    for (const { part, correct, total } of scorePitches(result.parts, truth)) {
      expect(total, `${part} 정답 데이터 존재`).toBeGreaterThan(0);
      expect(correct, `${part} 음높이`).toBe(total);
    }
  });

  it("여러 시스템(악보 줄)의 마디 번호를 이어붙인다", async () => {
    const result = await parseScorePdf(loadFixture("open_satb.pdf"));
    // 마디 번호가 1부터 연속이어야 하고, 시스템 경계에서 리셋되지 않아야 한다
    const measures = [...new Set(result.parts.Soprano.map(n => n.m))].sort((a, b) => a - b);
    expect(measures[0]).toBe(1);
    expect(result.measureCount).toBeGreaterThanOrEqual(measures.length);
    // 중간에 빈 마디 없이 연속
    for (let i = 1; i < measures.length; i++) {
      expect(measures[i] - measures[i - 1]).toBe(1);
    }
  });
});

describe("파서 품질 게이트", () => {
  it("정상 악보에서는 error 등급 경고를 내지 않는다", async () => {
    for (const name of ["closed_chord.pdf", "closed_stems.pdf", "open_satb.pdf"]) {
      const result = await parseScorePdf(loadFixture(name));
      const errors = result.warnings.filter(w => w.severity === "error");
      expect(errors, `${name} error 경고`).toHaveLength(0);
    }
  });

  it("정상 악보의 신뢰도가 80 이상이다", async () => {
    for (const name of ["closed_chord.pdf", "closed_stems.pdf", "open_satb.pdf"]) {
      const result = await parseScorePdf(loadFixture(name));
      expect(result.confidence, `${name} 신뢰도`).toBeGreaterThanOrEqual(80);
    }
  });

  it("마디별 총 음길이가 박자표와 맞는다", async () => {
    const result = await parseScorePdf(loadFixture("closed_chord.pdf"));
    const expectedPerMeasure =
      result.timeSignature.numerator * (4 / result.timeSignature.denominator);

    // 마지막 마디는 불완전할 수 있으므로 제외
    const byMeasure = new Map<number, number>();
    for (const n of result.parts.Soprano) {
      byMeasure.set(n.m, (byMeasure.get(n.m) ?? 0) + n.d);
    }
    const measures = [...byMeasure.keys()].sort((a, b) => a - b);
    for (const m of measures.slice(0, -1)) {
      expect(byMeasure.get(m), `마디 ${m} 총 음길이`).toBeCloseTo(expectedPerMeasure, 2);
    }
  });

  it("모든 음높이가 사람이 부를 수 있는 범위 안에 있다", async () => {
    // MIDI 36(C2) ~ 88(E6).
    //
    // 상한을 처음 84(C6)로 잡았다가 실패했다. open_satb.pdf 소프라노의
    // 정답 최고음이 86(D6)이었다. 성가 소프라노가 D6까지 올라가는 것은
    // 드물지만 정상이다. 테스트가 잘못이었고 파서는 맞았다.
    //
    // 이 경계를 좁게 잡으면 옥타브 자동보정이 정상 악보를 훼손하는 것과
    // 같은 실수를 반복하게 된다.
    for (const name of ["closed_chord.pdf", "closed_stems.pdf", "open_satb.pdf"]) {
      const result = await parseScorePdf(loadFixture(name));
      for (const part of PARTS) {
        for (const n of result.parts[part]) {
          expect(n.p, `${name} ${part} 음높이 ${n.p}`).toBeGreaterThanOrEqual(36);
          expect(n.p, `${name} ${part} 음높이 ${n.p}`).toBeLessThanOrEqual(88);
        }
      }
    }
  });
});
