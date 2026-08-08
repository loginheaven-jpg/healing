/**
 * 임시표(accidental) 처리 회귀 테스트.
 *
 * 이 테스트가 지키는 규칙은 세 가지다.
 *
 * 1. 표기된 임시표를 적용한다 (#, b, natural)
 * 2. 같은 마디 안에서 같은 높이의 음에 계속 적용된다 (조판은 한 번만 그린다)
 * 3. 마디선을 넘으면 초기화된다
 *
 * 픽스처 accidental.pdf는 이 세 규칙을 모두 밟도록 만들었다.
 * 정답은 LilyPond가 같은 소스에서 낸 MIDI이므로 사람의 해석이 개입하지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScorePdf } from "./parseScore.js";

const FIX = path.resolve(import.meta.dirname, "../fixtures");
const read = (n: string) => new Uint8Array(fs.readFileSync(path.join(FIX, n)));

describe("임시표 처리", () => {
  it("표기·지속·마디 초기화를 모두 지켜 음높이가 정확하다", async () => {
    const r = await parseScorePdf(read("accidental.pdf"));
    const gt = JSON.parse(fs.readFileSync(path.join(FIX, "ground_truth_accidental.json"), "utf8"));

    // 2단 축소악보이므로 상단 선율 = Soprano, 하단 선율 = Bass
    expect(r.parts.Soprano.map(n => n.p)).toEqual(gt.Treble);
    expect(r.parts.Bass.map(n => n.p)).toEqual(gt.Bass);
  });

  it("마디 안에서 임시표가 지속된다", async () => {
    const r = await parseScorePdf(read("accidental.pdf"));
    // 1마디: F#5 F#5 G5 F#5 — sharp 글리프는 첫 음표에만 있다
    const m1 = r.parts.Soprano.filter(n => n.m === 1).map(n => n.p);
    expect(m1).toEqual([78, 78, 79, 78]);
  });

  it("마디선을 넘으면 임시표가 초기화된다", async () => {
    const r = await parseScorePdf(read("accidental.pdf"));
    // 2마디: F5 F5 G5 A5 — 1마디의 sharp가 넘어오면 안 된다
    const m2 = r.parts.Soprano.filter(n => n.m === 2).map(n => n.p);
    expect(m2).toEqual([77, 77, 79, 81]);
  });

  it("첫 음표의 임시표를 조표로 오인하지 않는다", async () => {
    const r = await parseScorePdf(read("accidental.pdf"));
    // 이 악보는 다장조(조표 없음)다. 1마디 첫 음표의 sharp를 조표로 읽으면
    // fifths=1(사장조)이 되어 모든 F가 F#으로 계산된다.
    expect(r.keySignature?.fifths ?? 0).toBe(0);
  });
});
