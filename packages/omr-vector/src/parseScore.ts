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
  /** 악보에 적힌 빠르기. 못 찾으면 null 이다. 추정하지 않는다 */
  let tempoBpm: number | null = null;
  /** 화음 안에 서로 다른 음길이가 섞인 마디. docs/tasks/P1.md 3.6 */
  const polyrhythmMeasures = new Set<number>();

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

      // 첫 시스템에서 조·박자·빠르기·구조를 확정한다
      if (!firstSystemSeen) {
        keyFifths = sysStaves[0].keyFifths;
        const ts = readTimeSignature(page.glyphs, sysStaves[0]);
        timeSignature = { numerator: ts.numerator, denominator: ts.denominator };
        timeSigConfident = ts.confident;
        tempoBpm = readTempoBpm(page, sysStaves[0]);
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

      /*
       * 성부별 리듬 차이의 검출.
       *
       * 신호 (1) 화음 안에 서로 다른 음길이가 섞였다. 긴 음을 잘라 냈다는 뜻이다.
       *
       * 신호 (2) **마디 총 길이가 부풀었다.** 이것이 직렬화의 직접 증거다.
       *   한 보표의 두 성부가 다른 리듬으로 움직이면 음표머리의 X가 어긋나
       *   화음으로 묶이지 않고 순차 이벤트가 된다. 그러면 두 성부의 음길이가
       *   차례로 더해져 마디가 거의 두 배로 늘어난다.
       *   closed_hard 실측: 4/4 마디가 b0·2·4·6 으로 8박이 됐다.
       *
       * 음정 간격은 신호로 쓰지 않는다. 한때 "인접 음 16반음 초과"를 썼다가
       * 정상 악보에 오탐이 났다. **테너와 베이스는 옥타브를 넘어 벌어지는
       * 것이 정상**이고 찬송가 편곡에서 10도·12도가 흔하다. 간격은 직렬화의
       * 결과일 뿐이니 원인을 본다.
       */
      const expectedBeats = (timeSignature.numerator * 4) / timeSignature.denominator;
      for (const evs of shifted) {
        const perMeasure = new Map<number, number>();
        for (const e of evs) {
          if (e.mixedRhythm) polyrhythmMeasures.add(e.measure);
          perMeasure.set(e.measure, Math.max(perMeasure.get(e.measure) ?? 0, e.beat + e.duration));
        }
        for (const [m, total] of perMeasure) {
          if (total >= expectedBeats * 1.8) polyrhythmMeasures.add(m);
        }
      }

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

  /*
   * 성부마다 리듬이 다른 지점.
   *
   * toTimedEvents가 화음 안 최단 음길이를 채택하므로 긴 음이 잘린다.
   * 완전 해결은 기둥 방향 기반 성부 분리가 필요해 2차로 미룬다.
   * 1차에는 검출과 경고까지만 한다. docs/OMR.md 5.4
   */
  if (polyrhythmMeasures.size > 0) {
    const ms = [...polyrhythmMeasures].sort((a, b) => a - b);
    warnings.push({
      code: "POLYRHYTHM_SUSPECTED",
      severity: "warn",
      message: `${ms.length}개 마디에서 성부마다 리듬이 다릅니다. 재생이 정확하지 않을 수 있습니다.`,
      measures: ms.slice(0, 20),
      detail: { count: ms.length },
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
  warnings.push(...detectTieCandidates(normalized.parts));

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
    tempoBpm,
    measureCount,
    // 마디 좌표는 3.10에서 채운다. 산출 실패 시 빈 배열이 규격이다
    measureBoxes: [],
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

  /*
   * 음절 분할.
   *
   * 글자 사이 간격으로 음절을 가르려 하면 안 된다. 실측에서 음절 경계의
   * 간격(0.59·0.68·0.72 × 폰트크기)이 음절 안쪽 간격(0.61·0.61·0.68)과
   * 완전히 겹쳤다. 조판이 음표를 촘촘히 놓으면 가사도 똑같이 촘촘해진다.
   * "Amazing grace"가 A·m·in·gr·h 로 조각난 것이 이 때문이다.
   *
   * 훨씬 강한 신호가 있다. **가사 음절은 자기 음표 아래에서 시작해
   * 오른쪽으로 뻗는다.** 그러니 글자마다 "그 글자보다 왼쪽에 있는 가장
   * 오른쪽 음표"를 찾아 붙이면, 같은 음표에 붙은 글자들이 곧 한 음절이다.
   * 간격을 재는 대신 음표 위치를 기준으로 삼는다.
   *
   * 한글은 예외 없이 글자마다 나눈다. 한 글자가 한 음절이기 때문이다.
   * docs/OMR.md 5.6 · docs/tasks/P1.md 3.5
   */
  zone.sort((a, b) => a.x - b.x);

  // 가사는 소리 나는 음에 붙는다. 쉼표 이벤트는 기준점이 아니다.
  const anchors = refEvents.filter(e => e.notes.length > 0).sort((a, b) => a.x - b.x);
  if (anchors.length === 0) return [];

  const isHangul = (ch: string) => {
    const c = ch.charCodeAt(0);
    return c >= 0xac00 && c <= 0xd7a3;
  };

  type Syllable = { anchor: TimedEvent; text: string; startX: number };
  const syllables: Syllable[] = [];
  let ai = 0;

  /*
   * 음절은 음표머리 **중앙에** 놓인다. 글자의 왼쪽 끝을 음표 X와 직접
   * 비교하면 한 칸씩 밀린다. 실측에서 "ma"의 m이 자기 음표보다 3.6pt
   * 왼쪽에 있어 앞 음표에 붙었고 결과가 Am·az·inggr 로 어긋났다.
   *
   * 그래서 이웃한 두 음표의 **중점**을 음절 경계로 삼는다. 그 사이에
   * 있는 글자는 모두 그 음표의 음절이다.
   */
  const bounds = anchors.slice(0, -1).map((a, i) => (a.x + anchors[i + 1].x) / 2);

  for (const t of zone) {
    // 붙임표와 공백은 음절 경계다. MusicXML 관례와 같다.
    if (t.text === "-" || t.text === "‐" || t.text.trim() === "") continue;

    while (ai < bounds.length && t.x >= bounds[ai]) ai++;
    const anchor = anchors[ai];

    // 첫 음표보다 훨씬 왼쪽이거나 마지막 음표에서 너무 먼 글자는
    // 가사가 아니라 지시어·제목이다.
    if (t.x < anchors[0].x - sp * 4 || t.x > anchor.x + sp * 12) continue;

    const last = syllables[syllables.length - 1];
    const startsNew =
      !last || last.anchor !== anchor || isHangul(t.text) || isHangul(last.text.slice(-1));

    if (startsNew) syllables.push({ anchor, text: t.text, startX: t.x });
    else last.text += t.text;
  }

  void measureOffset;
  return syllables.map(s => ({ m: s.anchor.measure, b: s.anchor.beat, text: s.text }));
}

/**
 * 악보에 적힌 빠르기를 읽는다.
 *
 * LilyPond는 `	empo 4 = 82`를 **음표 글리프 + "= 82" 텍스트**로 그린다.
 * 실측(reference_satb.pdf): noteheads.s2@x126,y745 다음에 "="@x135, "8"@x144,
 * "2"@x151 이 오선 바로 위(topY=739)에 놓였다.
 *
 * 첫 오선 바로 위의 좁은 띠만 본다. 제목과 부제는 훨씬 위에 있어(4~8칸)
 * 걸리지 않는다. 실측에서 제목은 8칸 위, 부제는 4.4칸 위, 빠르기는 0.8칸
 * 위였다.
 *
 * **못 찾으면 null 이다. 추정하지 않는다.** 화면이 기본값을 쓴다.
 * 억지로 숫자를 지어내면 재생 속도가 통째로 어긋나고, 사용자는 그것이
 * 악보에 적힌 값인 줄 안다.
 */
function readTempoBpm(page: PageGeometry, staff: Staff): number | null {
  const sp = staff.spacing;
  const band = page.texts
    .filter(t => t.y > staff.topY && t.y < staff.topY + sp * 3.5)
    .sort((a, b) => a.x - b.x);
  if (band.length === 0) return null;

  // "= 82" 형태를 찾는다. 메트로놈 표기는 반드시 등호를 쓴다.
  const m = band
    .map(t => t.text)
    .join("")
    .match(/=\s*(\d{2,3})/);
  if (!m) return null;

  const bpm = Number(m[1]);
  // 사람이 부를 수 있는 범위 밖이면 다른 숫자를 잘못 읽은 것이다
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) return null;
  return bpm;
}

/**
 * 붙임줄 후보를 찾는다.
 *
 * 벡터 경로에서 이음줄 곡선을 검출하기는 어렵다. 1차에는 하지 않는다.
 * 대신 **같은 음높이가 마디 경계를 넘어 연속**하면 후보로 본다.
 *
 * 오탐이 나기 쉽다. 같은 음을 두 번 치는 것과 구별되지 않는다. 그래서
 * info 등급으로 두어 신뢰도 감점을 2점에 묶는다. 조용히 넘기지는 않는다 —
 * 이어진 음이 나뉘어 소리 나는 것은 사용자가 알아야 할 사실이다.
 * docs/OMR.md 5.5 · docs/tasks/P1.md 3.7
 */
function detectTieCandidates(parts: Record<Part, Note[]>): Warning[] {
  const measures = new Set<number>();

  for (const part of PART_ORDER) {
    const notes = [...parts[part]].sort((a, b) => a.m - b.m || a.b - b.b);
    for (let i = 0; i + 1 < notes.length; i++) {
      const a = notes[i];
      const b = notes[i + 1];
      // 마디 경계를 넘고, 앞 음이 마디 끝에 닿고, 뒤 음이 마디 머리에서 시작
      if (b.m === a.m + 1 && b.b === 0 && a.p === b.p) measures.add(b.m);
    }
  }

  if (measures.size === 0) return [];
  const ms = [...measures].sort((a, b) => a - b);
  return [
    {
      code: "TIE_UNSUPPORTED",
      severity: "info",
      message: "이어진 음이 있을 수 있습니다. 재생에서는 나누어 소리 납니다.",
      measures: ms.slice(0, 20),
      detail: { count: ms.length },
    },
  ];
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
