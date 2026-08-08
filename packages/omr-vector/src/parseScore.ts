/**
 * 6단계: 전체 파이프라인을 잇는 진입점.
 *
 * extractPdfGeometry → detectStaves → groupIntoSystems → parseNotesOnStaff
 * → detectLayout → splitVoices → 이상 검출 → ParseResult
 *
 * 여러 시스템(악보 줄)과 여러 페이지를 하나의 연속된 곡으로 이어붙이는
 * 것이 이 파일의 또 다른 역할이다. 마디 번호를 전역으로 매겨야 한다.
 */

import { detectBarlines, parseNotesOnStaff, toTimedEvents, unifyBarlines, type TimedEvent } from "./noteParse.js";
import { extractPdfGeometry, type PageGeometry } from "./pdfExtract.js";
import { assignClefs, detectStaves } from "./staffDetect.js";
import { groupIntoSystems, readKeySignature, readTimeSignature } from "./systemGroup.js";
import type {
  LayoutType,
  Note,
  OctaveSource,
  Part,
  ParseResult,
  Rest,
  Staff,
  Warning,
} from "./types.js";
import {
  PART_ORDER,
  checkMeasureDurations,
  checkPartBalance,
  detectLayout,
  normalizeOctave,
  splitClosedScore,
  splitOpenScore,
} from "./voiceSplit.js";

export async function parseScorePdf(data: Uint8Array): Promise<ParseResult> {
  const t0 = Date.now();
  const extracted = await extractPdfGeometry(data);
  const warnings: Warning[] = [];

  if (!extracted.isVector) {
    throw new VectorParseUnavailable(extracted.vectorReason);
  }

  if (extracted.pages.length > 1) {
    warnings.push({
      code: "MULTI_PAGE",
      severity: "info",
      message: `${extracted.pages.length}페이지 악보입니다. 페이지 경계에서 마디가 이어지는지 확인해 주세요.`,
      detail: { pageCount: extracted.pages.length },
    });
  }

  // 미등록 글리프 집계
  const unknownAll = Array.from(
    new Set(extracted.pages.flatMap(p => p.unknownGlyphNames))
  );
  if (unknownAll.length > 0) {
    warnings.push({
      code: "UNKNOWN_GLYPH",
      severity: "info",
      message: `해석하지 못한 악보 기호가 ${unknownAll.length}종 있습니다: ${unknownAll.slice(0, 8).join(", ")}. 해당 기호는 무시되었습니다.`,
      detail: { names: unknownAll },
    });
  }

  /* 가사 폰트를 읽지 못한 경우.
     깨진 글자를 보여주는 대신 가사를 비웠다는 사실을 알려야 한다.
     이유를 모르면 사용자는 "가사가 없는 앱"으로 오해한다. */
  const untrustedFonts = Array.from(
    new Set(extracted.pages.flatMap(p => p.untrustedTextFonts))
  ).filter(Boolean);
  if (untrustedFonts.length > 0) {
    warnings.push({
      code: "LYRICS_UNREADABLE",
      severity: "info",
      message:
        "이 PDF에는 글자 정보(ToUnicode)가 없어 가사를 읽지 못했습니다. 음표와 연주는 정상입니다. 악보 프로그램에서 다시 내보낼 때 글자 정보를 포함하면 가사도 표시됩니다.",
      detail: { fonts: untrustedFonts },
    });
  }

  const parts: Record<Part, Note[]> = { Soprano: [], Alto: [], Tenor: [], Bass: [] };
  const rests: Record<Part, Rest[]> = { Soprano: [], Alto: [], Tenor: [], Bass: [] };
  const lyrics: { m: number; b: number; text: string }[] = [];

  let globalMeasureOffset = 0;
  let layout: LayoutType = "unknown";
  // 3단 악보에서 반주 오선을 제외할 때 쓸 오선 인덱스 (지정 없으면 전부)
  let useStaves: number[] | undefined;
  let keyFifths = 0;
  let timeSignature = { numerator: 4, denominator: 4 };
  let timeSigConfident = false;
  let firstSystemSeen = false;
  /*
   * 첫 시스템의 오선별 "옥타브를 음자리표가 확정했는가".
   * 파트 배정은 형태에 따라 달라지므로 오선 단위로 모아 두었다가 뒤에서 옮긴다.
   */
  let octaveByStaff: boolean[] = [];

  for (const page of extracted.pages) {
    const bare = detectStaves(page.hLines, page.width);
    if (bare.length === 0) continue;

    const { clefs, unrecognized, octaveByClef } = assignClefs(bare, page.glyphs, page.texts);
    if (!firstSystemSeen) octaveByStaff = octaveByClef;
    if (unrecognized.length > 0 && !firstSystemSeen) {
      warnings.push({
        code: "CLEF_UNRECOGNIZED",
        severity: "warn",
        message: `${unrecognized.length}개 오선의 음자리표를 읽지 못해 위치로 추정했습니다. 음높이가 옥타브 단위로 틀릴 수 있습니다.`,
        detail: { staffIndexes: unrecognized },
      });
    }

    const staves: Staff[] = bare.map((s, i) => {
      const st: Staff = { ...s, clef: clefs[i], keyAlters: {}, keyFifths: 0 };
      const k = readKeySignature(st, page.glyphs);
      st.keyFifths = k.fifths;
      st.keyAlters = k.alters;
      return st;
    });

    const systems = groupIntoSystems(staves, page.vLines);

    for (const sys of systems) {
      const sysStaves = sys.staves;

      // 첫 시스템에서 조·박자·구조를 확정한다
      if (!firstSystemSeen) {
        keyFifths = sysStaves[0].keyFifths;
        const ts = readTimeSignature(page.glyphs, sysStaves[0]);
        timeSignature = { numerator: ts.numerator, denominator: ts.denominator };
        timeSigConfident = ts.confident;
      }

      // 시스템 내 마디선 통합
      const perStaffBars = sysStaves.map(st => detectBarlines(page.vLines, st));
      const bars = unifyBarlines(perStaffBars, sysStaves[0].spacing);

      // 오선별 음표 → 이벤트
      const eventsPerStaff: TimedEvent[][] = sysStaves.map((st, i) => {
        // 이웃 오선의 경계를 넘겨 음표 흡수를 막는다.
        // 오선은 위에서 아래 순서이므로 i-1이 위, i+1이 아래다.
        const above =
          i > 0
            ? { bottomY: sysStaves[i - 1].bottomY, topY: sysStaves[i - 1].topY }
            : undefined;
        const below =
          i + 1 < sysStaves.length
            ? { bottomY: sysStaves[i + 1].bottomY, topY: sysStaves[i + 1].topY }
            : undefined;
        const parsed = parseNotesOnStaff(st, i, page.glyphs, page.rects, bars, { above, below });
        return toTimedEvents(parsed.notes, parsed.rests, st.spacing);
      });

      // 구조 판별 (첫 시스템 기준으로 고정)
      if (!firstSystemSeen) {
        const det = detectLayout(sysStaves, eventsPerStaff);
        layout = det.layout;
        useStaves = det.useStaves;
        warnings.push(...det.warnings);
        firstSystemSeen = true;
      }

      // 마디 번호를 전역으로 이동
      const shifted = eventsPerStaff.map(evs =>
        evs.map(e => ({ ...e, measure: e.measure + globalMeasureOffset }))
      );

      // 성부 분리
      let split: { parts: Record<Part, Note[]>; rests: Record<Part, Rest[]>; warnings: Warning[] };
      /*
       * useStaves가 지정되면 그 오선만 성부로 쓴다. 3단 악보에서
       * 반주 오선을 제외하기 위한 것이다(detectLayout 참조).
       */
      const vocal = useStaves ? useStaves.map(i => shifted[i] ?? []) : shifted;
      const vocalStaves = useStaves ? useStaves.map(i => sysStaves[i]) : sysStaves;
      if (layout === "closed-2staff") {
        split = splitClosedScore(vocal[0] ?? [], vocal[1] ?? []);
      } else if (layout === "open-4staff" || layout === "mixed-3staff") {
        split = splitOpenScore(vocalStaves, vocal);
      } else {
        // 단성부: 소프라노로만 넣는다
        const parts0: Record<Part, Note[]> = { Soprano: [], Alto: [], Tenor: [], Bass: [] };
        const rests0: Record<Part, Rest[]> = { Soprano: [], Alto: [], Tenor: [], Bass: [] };
        for (const e of vocal[0] ?? []) {
          const hi = [...e.notes].sort((a, b) => b.midi - a.midi)[0];
          if (hi) parts0.Soprano.push({ m: e.measure, b: e.beat, d: e.duration, p: hi.midi });
          else rests0.Soprano.push({ m: e.measure, b: e.beat, d: e.duration });
        }
        split = { parts: parts0, rests: rests0, warnings: [] };
      }

      for (const p of PART_ORDER) {
        parts[p].push(...split.parts[p]);
        rests[p].push(...split.rests[p]);
      }
      // 시스템별 반복 경고는 첫 시스템만 채택 (같은 경고가 줄마다 쌓이는 것 방지)
      if (globalMeasureOffset === 0) warnings.push(...split.warnings);

      // 가사 추출
      lyrics.push(...extractLyrics(page, sys.staves, shifted, globalMeasureOffset));

      // 다음 시스템의 마디 번호 시작점
      const maxM = Math.max(
        globalMeasureOffset,
        ...shifted.flatMap(evs => evs.map(e => e.measure))
      );
      globalMeasureOffset = maxM;
    }
  }

  /*
   * 박자표를 찾지 못한 경우.
   *
   * 예전에는 이 경고에 MEASURE_DURATION_MISMATCH 코드를 붙였다. 문구는
   * "박자표를 찾지 못해 4/4로 가정했습니다"인데 코드는 마디 길이 불일치라,
   * 마디가 완벽한 악보에서도 길이 문제가 있는 것처럼 보였다. closed_chord는
   * 마디 총 길이가 전부 4.0인데도 이 경고가 떴다.
   *
   * 코드와 문구가 어긋나면 화면이 엉뚱한 조치 버튼을 내민다. 박자표 문제에는
   * 박자표를 고칠 수단을 줘야 한다. docs/SPEC.md 4.4
   */
  if (!timeSigConfident) {
    warnings.push({
      code: "TIME_SIGNATURE_GUESSED",
      severity: "warn",
      message: `박자표를 찾지 못해 ${timeSignature.numerator}/${timeSignature.denominator}로 보았습니다. 다르면 아래에서 고쳐 주세요.`,
      detail: { assumed: { ...timeSignature } },
    });
  }

  // 옥타브 정규화
  const normalized = normalizeOctave(parts);
  warnings.push(...normalized.warnings);

  /*
   * 옥타브를 무엇이 결정했는지 기록한다.
   *
   * 음자리표의 옥타브 표시를 읽었으면 "clef", 음역을 보고 추측했으면
   * "range-heuristic"이다. 둘을 구분하지 않으면 "정확한 결과"와 "우연히
   * 맞은 결과"를 가릴 수 없다. docs/tasks/P1.md 3.4
   *
   * 오선 → 파트 대응은 형태에 따라 다르다.
   *   closed-2staff : 상단 오선 → S·A,  하단 오선 → T·B
   *   open-4staff   : 오선 i → PART_ORDER[i]
   *   single        : 상단 오선 → S
   */
  const staffOf: Record<Part, number> =
    layout === "closed-2staff"
      ? { Soprano: 0, Alto: 0, Tenor: 1, Bass: 1 }
      : { Soprano: 0, Alto: 1, Tenor: 2, Bass: 3 };

  const octaveSource = Object.fromEntries(
    PART_ORDER.map(p => {
      if (normalized.shifted[p]) return [p, "range-heuristic" as OctaveSource];
      const si = useStaves ? (useStaves[staffOf[p]] ?? staffOf[p]) : staffOf[p];
      return [p, (octaveByStaff[si] ? "clef" : "range-heuristic") as OctaveSource];
    })
  ) as Record<Part, OctaveSource>;

  // 이상 검출 게이트
  warnings.push(...checkPartBalance(normalized.parts, layout));
  const durCheck = checkMeasureDurations(normalized.parts, rests, timeSignature);
  warnings.push(...durCheck.warnings);

  const measureCount = Math.max(
    0,
    ...PART_ORDER.flatMap(p => normalized.parts[p].map(n => n.m))
  );

  const confidence = computeConfidence(
    warnings,
    normalized.parts,
    layout,
    "vector",
    durCheck.ratio
  );

  return {
    parts: normalized.parts,
    rests,
    octaveSource,
    layout,
    keyFifths,
    timeSignature,
    measureCount,
    lyrics: dedupeLyrics(lyrics),
    warnings,
    confidence,
    source: "vector",
    elapsedMs: Date.now() - t0,
    pageCount: extracted.pages.length,
  };
}

/** 벡터 파싱이 불가능할 때 (스캔 이미지) */
export class VectorParseUnavailable extends Error {
  constructor(public reason: string) {
    super(`벡터 PDF가 아닙니다: ${reason}`);
    this.name = "VectorParseUnavailable";
  }
}

/**
 * 가사를 추출해 마디·박 위치에 붙인다.
 *
 * 가사는 오선 아래의 텍스트다. 음표와 X좌표로 매칭한다.
 * 한글 가사는 한 글자가 한 음절이므로 글자 단위로 처리하되,
 * 인접한 글자가 같은 X 근처에 있으면 한 음절로 합친다.
 */
function extractLyrics(
  page: PageGeometry,
  staves: Staff[],
  eventsPerStaff: TimedEvent[][],
  measureOffset: number
): { m: number; b: number; text: string }[] {
  if (staves.length === 0) return [];
  const sp = staves[0].spacing;

  // 가사는 보통 첫 오선(또는 상단 오선) 아래에 놓인다
  const refStaff = staves[0];
  const refEvents = eventsPerStaff[0] ?? [];
  if (refEvents.length === 0) return [];

  // 오선 아래 1~5칸 구간의 텍스트
  const zone = page.texts.filter(
    t =>
      t.y < refStaff.bottomY - sp * 0.5 &&
      t.y > refStaff.bottomY - sp * 7 &&
      t.x >= refStaff.x1 - sp &&
      t.x <= refStaff.x2 + sp
  );
  if (zone.length === 0) return [];

  // X순 정렬 후 인접 글자 병합
  zone.sort((a, b) => a.x - b.x);
  const syllables: { x: number; text: string }[] = [];
  for (const t of zone) {
    const last = syllables[syllables.length - 1];
    // 글자 폭의 60% 이내면 같은 음절로 본다
    if (last && t.x - last.x < t.size * 0.6) {
      last.text += t.text;
    } else {
      syllables.push({ x: t.x, text: t.text });
    }
  }

  // 각 음절을 가장 가까운 이벤트에 붙인다
  const out: { m: number; b: number; text: string }[] = [];
  for (const s of syllables) {
    let best: TimedEvent | null = null;
    let bestD = Infinity;
    for (const e of refEvents) {
      const d = Math.abs(e.x - s.x);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    // 너무 멀면 가사가 아니라 다른 텍스트(지시어 등)
    if (best && bestD < sp * 4) {
      out.push({ m: best.measure, b: best.beat, text: s.text });
    }
  }

  void measureOffset;
  return out;
}

/** 같은 위치의 가사 중복 제거 */
function dedupeLyrics(
  lyrics: { m: number; b: number; text: string }[]
): { m: number; b: number; text: string }[] {
  const seen = new Map<string, { m: number; b: number; text: string }>();
  for (const l of lyrics) {
    const key = `${l.m}:${l.b.toFixed(3)}`;
    if (!seen.has(key)) seen.set(key, l);
  }
  return Array.from(seen.values()).sort((a, b) => a.m - b.m || a.b - b.b);
}

/**
 * 신뢰도 점수. 계산식은 docs/OMR.md 6장 그대로다.
 *
 *   기본 100
 *     - error 1건당 -20
 *     - warn  1건당 -8
 *     - info  1건당 -2
 *     - 파트 수가 4가 아니면 (단성부 악보 제외) -15
 *     - 마디 길이 불일치 비율 × 30
 *     - source === "image"이면 -5
 *   하한 0, 상한 100
 *
 * 이 숫자를 사용자에게 그대로 보여주므로 낙관적으로 매기면 안 된다.
 * 해결된 경고(resolved)는 감점에서 뺀다. 사용자가 확인하면 점수가 오른다.
 */
function computeConfidence(
  warnings: Warning[],
  parts: Record<Part, Note[]>,
  layout: LayoutType | undefined,
  source: "vector" | "image",
  measureMismatchRatio: number
): number {
  let score = 100;

  for (const w of warnings) {
    if (w.resolved) continue;
    if (w.severity === "error") score -= 20;
    else if (w.severity === "warn") score -= 8;
    else score -= 2;
  }

  /*
   * 파트 수 감점.
   *
   * 단성부 악보는 빈 파트 3개가 정상이므로 감점하지 않는다. 감점하면
   * 완벽히 읽힌 악보가 낮은 신뢰도로 표시되어 사용자가 결과를 의심한다.
   */
  if (layout !== "single") {
    const filled = PART_ORDER.filter(p => parts[p].length > 0).length;
    if (filled !== 4) score -= 15;
  }

  score -= measureMismatchRatio * 30;

  // 이미지 인식은 벡터보다 근본적으로 불확실하다. 정직하게 알린다.
  if (source === "image") score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}
