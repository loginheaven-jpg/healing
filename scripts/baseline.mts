/**
 * 픽스처별 파서 출력을 표로 뽑는다.
 *
 * `docs/tasks/P1.md` 1장의 베이스라인 표를 그대로 재현하는 스크립트다.
 * P1 이후에도 회귀 확인에 쓴다 — 테스트가 잡지 못하는 "수치가 조용히 달라졌다"를
 * 눈으로 보기 위한 것이다.
 *
 * 실행:
 *   pnpm baseline              전체 픽스처
 *   pnpm baseline rest_test    한 픽스처만 (상세 출력)
 *   pnpm baseline --json       기계가 읽을 형태로
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseScorePdf } from "@healing/omr-vector";
import type { Note, Part, ParseResult } from "@healing/omr-vector";

const FIXTURES = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../packages/omr-vector/fixtures",
);

/**
 * kor_tounicode.pdf 는 여기에 없다. 악보가 아니라 한글 판독 시험용 PDF 이며
 * pdfExtract.test.ts 가 extractPdfGeometry 로 직접 다룬다. docs/tasks/P1.md 1장
 */
const NAMES = [
  "closed_chord",
  "closed_stems",
  "closed_hard",
  "open_satb",
  "three_staff",
  "single_staff",
  "accidental",
  "rest_test",
  "tenor_octave",
  "wide_tb",
  "reference_satb",
] as const;

const PARTS: Part[] = ["Soprano", "Alto", "Tenor", "Bass"];
const SHORT: Record<Part, string> = { Soprano: "S", Alto: "A", Tenor: "T", Bass: "B" };

function range(notes: Note[]): string {
  if (notes.length === 0) return "—";
  const ps = notes.map((n) => n.p);
  return `${Math.min(...ps)}-${Math.max(...ps)}`;
}

function partsCell(r: ParseResult): string {
  return PARTS.filter((p) => r.parts[p].length > 0)
    .map((p) => `${SHORT[p]}:${r.parts[p].length}(${range(r.parts[p])})`)
    .join(" ");
}

/** 마디별 총 음길이. 쉼표 결함의 직접 지표다. */
function measureDurations(r: ParseResult): Record<number, number> {
  const byMeasure = new Map<number, number>();
  for (const p of PARTS) {
    // 파트 하나만 봐도 된다. 마디 길이는 파트마다 같아야 한다.
    if (r.parts[p].length === 0) continue;
    for (const n of r.parts[p]) {
      byMeasure.set(n.m, Math.max(byMeasure.get(n.m) ?? 0, n.b + n.d));
    }
    break;
  }
  return Object.fromEntries([...byMeasure.entries()].sort((a, b) => a[0] - b[0]));
}

/** rests 는 P1 3.3 에서 추가된다. 그 전에는 필드 자체가 없다. */
function restCount(r: ParseResult): number | null {
  const rests = (r as ParseResult & { rests?: Record<Part, unknown[]> }).rests;
  if (!rests) return null;
  return PARTS.reduce((s, p) => s + (rests[p]?.length ?? 0), 0);
}

/** 옥타브를 무엇이 결정했는지. clef 여야 정상이다. docs/tasks/P1.md 3.4 */
function octaveCell(r: ParseResult): string {
  const src = (r as ParseResult & { octaveSource?: Record<Part, string> }).octaveSource;
  if (!src) return "—";
  const byClef = PARTS.filter((p) => r.parts[p].length > 0 && src[p] === "clef");
  const heur = PARTS.filter((p) => r.parts[p].length > 0 && src[p] !== "clef");
  return `clef:${byClef.map((p) => SHORT[p]).join("") || "없음"}${heur.length ? ` 추측:${heur.map((p) => SHORT[p]).join("")}` : ""}`;
}

function boxCount(r: ParseResult): number | null {
  const boxes = (r as ParseResult & { measureBoxes?: unknown[] }).measureBoxes;
  return boxes ? boxes.length : null;
}

async function measure(name: string): Promise<(ParseResult & { name: string }) | null> {
  const file = path.join(FIXTURES, `${name}.pdf`);
  if (!fs.existsSync(file)) return null;
  const data = new Uint8Array(fs.readFileSync(file));
  const r = await parseScorePdf(data);
  return { ...r, name };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const only = args.filter((a) => !a.startsWith("--"));
  const targets = only.length > 0 ? only : [...NAMES];

  const results: (ParseResult & { name: string })[] = [];
  const missing: string[] = [];

  for (const n of targets) {
    const r = await measure(n);
    if (r) results.push(r);
    else missing.push(n);
  }

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(
    "| 픽스처 | 형태 | 조 | 박자 | 마디 | 신뢰도 | 파트별 음표(음역) | 쉼표 | 옥타브근거 | 마디상자 | 경고 |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const rests = restCount(r);
    const boxes = boxCount(r);
    console.log(
      `| \`${r.name}\` | ${r.layout} | ${r.keyFifths} | ` +
        `${r.timeSignature.numerator}/${r.timeSignature.denominator} | ${r.measureCount} | ` +
        `${r.confidence} | ${partsCell(r)} | ${rests ?? "—"} | ${octaveCell(r)} | ${boxes ?? "—"} | ` +
        `${r.warnings.map((w) => w.code).join(", ") || "없음"} |`,
    );
  }

  if (missing.length > 0) {
    console.log(`\n없는 픽스처: ${missing.join(", ")}`);
  }

  // 한 픽스처만 지정하면 상세를 함께 낸다.
  if (only.length === 1 && results[0]) {
    const r = results[0];
    console.log(`\n── ${r.name} 상세 ──`);
    console.log(`마디별 총 길이: ${JSON.stringify(measureDurations(r))}`);
    for (const p of PARTS) {
      const ns = r.parts[p];
      if (ns.length === 0) continue;
      const head = ns
        .slice(0, 8)
        .map((n) => `m${n.m}b${n.b.toFixed(2)}d${n.d}p${n.p}`)
        .join("  ");
      console.log(`${p}: ${head}${ns.length > 8 ? ` … (${ns.length}음)` : ""}`);
    }
    if (r.lyrics.length > 0) {
      console.log(`가사(${r.lyrics.length}): ${r.lyrics.map((l) => l.text).join("·")}`);
    }
    for (const w of r.warnings) {
      console.log(`[${w.severity}] ${w.code} — ${w.message}`);
    }
  }
}

await main();
