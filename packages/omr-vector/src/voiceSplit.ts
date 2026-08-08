/**
 * 5단계: 보표 구조를 판별하고 성부를 분리한다.
 *
 * 이 파일이 다루는 문제가 앞선 검증에서 확인한 핵심 난제다.
 *
 * 2단 축소악보에서는 한 오선에 두 성부가 화음으로 겹쳐 있다. OMR은 이를
 * "화음 트랙 2개"로 내놓기 때문에, 그대로 재생하면 S+A와 T+B 두 개만 나온다.
 * 화음을 성부로 쪼개야 파트별 연습이 가능하다.
 *
 * 검증에서 얻은 두 가지 원칙:
 *   1) 기둥 방향으로 성부를 구분한 악보라도 그 정보에 의존할 수 없다.
 *      화음 표기형과 기둥 분리형이 동일하게 인식되기 때문이다.
 *      따라서 **음높이 정렬**이 유일하게 믿을 수 있는 기준이다.
 *   2) 화음 내 순서는 보장되지 않는다. 반드시 명시적으로 정렬해야 한다.
 *      정렬을 빠뜨리면 베이스 파트에서 테너 음이 나온다.
 */

import type { TimedEvent } from "./noteParse.js";
import type { ClefType, LayoutType, Note, Part, Rest, Staff, Warning } from "./types.js";

/**
 * SATB 각 파트의 통상 음역 (MIDI). 이상 검출과 옥타브 보정에 쓴다.
 *
 * 이 값을 좁게 잡으면 정상 악보를 망친다. 실측에서 이 문제를 겪었다.
 * open_satb.pdf의 소프라노는 C5~C6(72~84)를 오르내리는 정상적인 성가인데,
 * comfortable 구간을 60~79로 좁게 두어 중심이 69가 되었고, 중위값 77이
 * "1옥타브 높다"고 판정되어 전체가 C4로 내려갔다. 테너도 같은 이유로 틀렸다.
 *
 * 따라서 음역은 **실제 합창 음역의 최대치**로 넓게 잡고, 옥타브 보정은
 * 명백한 이탈(min/max를 벗어남)에만 발동해야 한다. 중심에서 멀다는
 * 이유만으로 보정하면 정상 악보를 훼손한다.
 */
export const PART_RANGE: Record<Part, { min: number; max: number; comfortable: [number, number] }> =
  {
    // 소프라노: B3(59) ~ C6(84). 실제 성가에서 C6까지 쓴다
    Soprano: { min: 59, max: 84, comfortable: [64, 81] },
    // 알토: F3(53) ~ F5(77)
    Alto: { min: 53, max: 77, comfortable: [57, 74] },
    // 테너: B2(47) ~ A4(69). treble8vb로 적히므로 실음은 이 범위
    Tenor: { min: 47, max: 72, comfortable: [52, 69] },
    // 베이스: E2(40) ~ D4(62)
    Bass: { min: 38, max: 64, comfortable: [43, 60] },
  };

export const PART_ORDER: Part[] = ["Soprano", "Alto", "Tenor", "Bass"];

/**
 * 보표 구조를 판별한다.
 *
 * 오선 개수만으로 판단하면 위험하다. 특히 반주가 붙은 악보는
 * "성악 2단 + 피아노 2단 = 4단"이 되어 4단 개방악보로 오인된다.
 * 그래서 음자리표 구성과 화음 밀도를 함께 본다.
 */
export function detectLayout(
  staves: Staff[],
  eventsPerStaff: TimedEvent[][],
): { layout: LayoutType; warnings: Warning[]; useStaves?: number[] } {
  const warnings: Warning[] = [];
  const n = staves.length;

  /*
   * 오선별 평균 동시발음 수 (화음 밀도).
   *
   * 쉼표 이벤트(notes가 빈 것)는 분모에서 뺀다. 넣으면 쉼표가 많은 악보의
   * 밀도가 통째로 낮아져 4성부 악보가 2성부로 오판된다. rest_test.pdf에서
   * 밀도가 2.0에서 1.43으로 떨어져 VOICE_MISSING 경고가 잘못 떴다.
   *
   * 세는 것은 "소리 나는 순간의 평균 성부 수"이지 "이벤트당 음표 수"가 아니다.
   */
  const density = eventsPerStaff.map((evs) => {
    const sounding = evs.filter((e) => e.notes.length > 0);
    if (sounding.length === 0) return 0;
    return sounding.reduce((s, e) => s + e.notes.length, 0) / sounding.length;
  });

  const clefs = staves.map((s) => s.clef);

  if (n === 2) {
    const isTrebleBass = clefs[0] === "treble" && (clefs[1] === "bass" || clefs[1] === "treble8vb");
    // 두 오선 모두 화음(평균 1.5 이상)이면 2단 축소악보
    const bothChordal = density[0] >= 1.5 && density[1] >= 1.5;

    if (isTrebleBass && bothChordal) {
      return { layout: "closed-2staff", warnings };
    }
    if (isTrebleBass && !bothChordal) {
      warnings.push({
        code: "VOICE_MISSING",
        severity: "warn",
        message: `2단 악보이지만 화음 밀도가 낮습니다 (상단 ${density[0].toFixed(2)}, 하단 ${density[1].toFixed(2)}). 4성부가 아닌 2성부 악보이거나 반주 악보일 수 있습니다.`,
        detail: { density },
      });
      return { layout: "closed-2staff", warnings };
    }
    return { layout: "single", warnings };
  }

  if (n === 4) {
    // 4단 개방악보의 전형: treble, treble, treble8vb(또는 tenor), bass
    //
    // 밀도만으로 판정하면 위험하다. 실측에서 open_satb.pdf의 밀도가
    // 1.6을 넘어 "성악 2단 + 반주 2단"으로 오판되었고, 그 결과 파트가
    // 전부 뒤섞이며 신뢰도가 59로 떨어졌다.
    //
    // 음자리표 구성이 훨씬 강한 근거다. 4단 SATB 개방악보는 셋째 오선에
    // 옥타브 이동 음자리표(treble8vb) 또는 테너 음자리표를 쓴다. 반주
    // 악보에는 이런 음자리표가 나타나지 않는다.
    const hasTenorClef = clefs[2] === "treble8vb" || clefs[2] === "tenor";
    const satbClefShape = clefs[0] === "treble" && clefs[1] === "treble" && clefs[3] === "bass";

    if (satbClefShape && hasTenorClef) {
      return { layout: "open-4staff", warnings };
    }

    // 음자리표로 확정되지 않으면 밀도로 보조 판정한다
    const lowDensity = density.every((d) => d < 1.6);
    if (lowDensity) {
      return { layout: "open-4staff", warnings };
    }

    // 화음 밀도가 높은 4단은 "성악 2단 + 반주 2단"일 가능성이 있다.
    // 위 2단만 성악으로 보고 2단 축소악보로 처리한다.
    warnings.push({
      code: "STAFF_COUNT_UNEXPECTED",
      severity: "warn",
      message:
        "오선 4개인데 각 오선에 화음이 많습니다. 성악 2단에 피아노 반주 2단이 붙은 악보일 수 있습니다. 상단 2개 오선만 성부로 처리했습니다.",
      detail: { density, clefs },
    });
    return { layout: "closed-2staff", warnings };
  }

  if (n === 3) {
    /*
     * 오선 3개는 두 가지 경우가 있다.
     *
     *  (A) 성악 2단(S+A / T+B 화음) + 피아노 반주 1단
     *  (B) 성악 3단 (예: S / A / T+B)
     *
     * (A)를 (B)로 오판하면 반주 오선이 파트로 배정된다. 실측
     * (three_staff.pdf)에서 반주 오선이 테너로 배정되어 음표 16개가
     * 테너 파트에 들어갔고, 정작 진짜 테너는 사라졌다.
     *
     * 판별 근거는 **음표 밀도**다. 반주는 8분음표 이하로 촘촘히 움직이므로
     * 이벤트 수가 성악보다 뚜렷하게 많다. 실측: 성악 7 vs 반주 16.
     * 화음 밀도(동시발음 수)는 반주도 성악처럼 2 이상일 수 있어 근거가 약하다.
     */
    const counts = eventsPerStaff.map((e) => e.length);
    const vocalMax = Math.max(counts[0], counts[1]);
    // 마지막 오선이 위 두 오선보다 1.6배 이상 촘촘하면 반주로 본다
    const lastIsAccomp = vocalMax > 0 && counts[2] >= vocalMax * 1.6;

    if (lastIsAccomp) {
      warnings.push({
        code: "STAFF_COUNT_UNEXPECTED",
        severity: "info",
        message:
          "오선 3개 중 마지막 오선은 음표가 촘촘해 피아노 반주로 판단했습니다. 상단 2개 오선을 4성부로 처리했습니다.",
        detail: { counts, clefs, density },
      });
      // 상단 2개만 넘겨 2단 축소악보로 처리한다
      return { layout: "closed-2staff", warnings, useStaves: [0, 1] };
    }

    warnings.push({
      code: "STAFF_COUNT_UNEXPECTED",
      severity: "warn",
      message: "오선이 3개입니다. 파트 배정을 확인해 주세요.",
      detail: { clefs, density, counts },
    });
    return { layout: "mixed-3staff", warnings };
  }

  if (n === 1) return { layout: "single", warnings };

  warnings.push({
    code: "STAFF_COUNT_UNEXPECTED",
    severity: "error",
    message: `오선이 ${n}개로 예상 범위를 벗어났습니다. 자동 파트 분리가 어렵습니다.`,
    detail: { clefs },
  });
  return { layout: "unknown", warnings };
}

/**
 * 2단 축소악보의 화음을 4성부로 분리한다.
 *
 * 상단 오선 → 높은음이 Soprano, 낮은음이 Alto
 * 하단 오선 → 높은음이 Tenor, 낮은음이 Bass
 *
 * 단성부(음 1개만)인 경우 처리가 까다롭다. 두 성부가 같은 음을 부르는
 * 동음(unison)일 수도 있고, 한 성부가 쉬는 것일 수도 있다.
 * 여기서는 동음으로 간주하되 경고를 남긴다. 조용히 한 파트를 비우면
 * 사용자가 "내 파트가 안 나온다"고 겪게 되므로, 소리는 내고 알려주는 편이 낫다.
 */
export function splitClosedScore(
  upperEvents: TimedEvent[],
  lowerEvents: TimedEvent[],
): { parts: Record<Part, Note[]>; rests: Record<Part, Rest[]>; warnings: Warning[] } {
  const parts: Record<Part, Note[]> = { Soprano: [], Alto: [], Tenor: [], Bass: [] };
  const rests: Record<Part, Rest[]> = { Soprano: [], Alto: [], Tenor: [], Bass: [] };
  const warnings: Warning[] = [];

  const unisonMeasures: Record<string, number[]> = {};
  const divisiMeasures: Record<string, number[]> = {};

  const process = (events: TimedEvent[], hi: Part, lo: Part) => {
    for (const e of events) {
      // 음높이 내림차순 정렬. 이것이 성부 배정의 유일한 근거다.
      const sorted = [...e.notes].sort((a, b) => b.midi - a.midi);

      /*
       * 음표가 없는 이벤트는 쉼표다. 파트에 음을 넣지 않고 rests에만 남긴다.
       * 2단 축소악보는 한 오선이 두 파트를 담으므로 쉼표도 둘 다에 기록한다.
       */
      if (sorted.length === 0) {
        rests[hi].push({ m: e.measure, b: e.beat, d: e.duration });
        rests[lo].push({ m: e.measure, b: e.beat, d: e.duration });
        continue;
      }

      if (sorted.length === 1) {
        // 동음 또는 한 성부 휴지
        const midi = sorted[0].midi;
        parts[hi].push({ m: e.measure, b: e.beat, d: e.duration, p: midi });
        parts[lo].push({ m: e.measure, b: e.beat, d: e.duration, p: midi });
        (unisonMeasures[hi] ??= []).push(e.measure);
        continue;
      }

      if (sorted.length > 2) {
        // 3성부 이상(divisi). 최고음과 최저음을 채택하고 중간을 버린다.
        // 버린 음이 있음을 반드시 알려야 한다.
        (divisiMeasures[hi] ??= []).push(e.measure);
      }

      parts[hi].push({ m: e.measure, b: e.beat, d: e.duration, p: sorted[0].midi });
      parts[lo].push({
        m: e.measure,
        b: e.beat,
        d: e.duration,
        p: sorted[sorted.length - 1].midi,
      });
    }
  };

  process(upperEvents, "Soprano", "Alto");
  process(lowerEvents, "Tenor", "Bass");

  // 경고 집계
  for (const [part, ms] of Object.entries(unisonMeasures)) {
    const uniq = Array.from(new Set(ms)).sort((a, b) => a - b);
    const ratio = ms.length / Math.max(1, parts[part as Part].length);
    if (ratio > 0.15) {
      warnings.push({
        code: "UNISON_AMBIGUOUS",
        severity: ratio > 0.4 ? "warn" : "info",
        message: `${koPart(part as Part)} 오선에서 음표가 하나뿐인 지점이 ${ms.length}곳 있습니다 (전체의 ${(ratio * 100).toFixed(0)}%). 두 파트가 같은 음을 부르는 것으로 처리했습니다.`,
        measures: uniq.slice(0, 20),
        part: part as Part,
      });
    }
  }
  for (const [part, ms] of Object.entries(divisiMeasures)) {
    const uniq = Array.from(new Set(ms)).sort((a, b) => a - b);
    warnings.push({
      code: "DIVISI_SUSPECTED",
      severity: "warn",
      message: `${koPart(part as Part)} 오선에서 음표가 3개 이상 겹친 지점이 ${ms.length}곳 있습니다. 최고음과 최저음만 사용했고 중간 음은 재생되지 않습니다.`,
      measures: uniq.slice(0, 20),
      part: part as Part,
    });
  }

  return { parts, rests, warnings };
}

/**
 * 4단 개방악보에서 파트를 배정한다.
 *
 * 위에서 아래로 S, A, T, B가 기본이지만 음자리표와 음역으로 검증한다.
 * 검증 없이 순서만 믿으면 파트 순서가 다른 악보에서 전부 틀린다.
 */
export function splitOpenScore(
  staves: Staff[],
  eventsPerStaff: TimedEvent[][],
): { parts: Record<Part, Note[]>; rests: Record<Part, Rest[]>; warnings: Warning[] } {
  const parts: Record<Part, Note[]> = { Soprano: [], Alto: [], Tenor: [], Bass: [] };
  const rests: Record<Part, Rest[]> = { Soprano: [], Alto: [], Tenor: [], Bass: [] };
  const warnings: Warning[] = [];

  // 오선별 중위 음높이
  const medians = eventsPerStaff.map((evs) => {
    const all = evs.flatMap((e) => e.notes.map((n) => n.midi)).sort((a, b) => a - b);
    return all.length ? all[Math.floor(all.length / 2)] : 0;
  });

  // 기본 배정: 위에서 아래로
  const assigned: Part[] = staves.map((_, i) => PART_ORDER[Math.min(i, 3)]);

  // 음역 검증: 배정된 파트의 음역을 크게 벗어나면 경고
  for (let i = 0; i < staves.length && i < 4; i++) {
    const part = assigned[i];
    const range = PART_RANGE[part];
    const med = medians[i];
    if (med > 0 && (med < range.min - 3 || med > range.max + 3)) {
      warnings.push({
        code: "RANGE_VIOLATION",
        severity: "warn",
        message: `${i + 1}번째 오선을 ${koPart(part)}로 배정했으나 중간 음높이(MIDI ${med})가 통상 음역(${range.min}~${range.max})을 벗어납니다.`,
        part,
        detail: { median: med, expected: range },
      });
    }
  }

  // 중위 음높이가 위에서 아래로 단조 감소하지 않으면 순서 이상
  for (let i = 0; i + 1 < Math.min(staves.length, 4); i++) {
    if (medians[i] > 0 && medians[i + 1] > 0 && medians[i] < medians[i + 1]) {
      warnings.push({
        code: "VOICE_CROSSING",
        severity: "warn",
        message: `${i + 1}번째 오선(${koPart(assigned[i])})이 ${i + 2}번째 오선(${koPart(assigned[i + 1])})보다 낮습니다. 파트 순서가 통상과 다를 수 있습니다.`,
        detail: { medians },
      });
    }
  }

  for (let i = 0; i < staves.length && i < 4; i++) {
    const part = assigned[i];
    for (const e of eventsPerStaff[i]) {
      // 개방악보라도 한 오선에 화음이 있으면 최고음을 채택한다
      const sorted = [...e.notes].sort((a, b) => b.midi - a.midi);
      // 음표가 없는 이벤트는 쉼표다. 개방악보는 오선 하나가 파트 하나다.
      if (sorted.length === 0) {
        rests[part].push({ m: e.measure, b: e.beat, d: e.duration });
        continue;
      }
      parts[part].push({ m: e.measure, b: e.beat, d: e.duration, p: sorted[0].midi });
      if (sorted.length > 1) {
        // 개방악보의 화음은 divisi다
      }
    }
  }

  return { parts, rests, warnings };
}

/**
 * 파트 음역 기반 옥타브 보정.
 *
 * 앞선 검증에서 정확도를 44.8%에서 94.8%로 올린 후처리다. 음자리표를
 * 잘못 읽으면 음이 옥타브 단위로 통째로 밀리는데, 이는 개별 음표 오류가
 * 아니라 체계적 오류이므로 파트 전체를 한 번에 되돌릴 수 있다.
 *
 * 벡터 경로에서는 음자리표를 정확히 읽으므로 보통 발동하지 않는다.
 * 발동한다면 그 자체가 인식에 문제가 있다는 신호이므로 경고를 남긴다.
 */
export function normalizeOctave(parts: Record<Part, Note[]>): {
  parts: Record<Part, Note[]>;
  warnings: Warning[];
  shifted: Record<Part, boolean>;
} {
  const warnings: Warning[] = [];
  const out: Record<Part, Note[]> = { Soprano: [], Alto: [], Tenor: [], Bass: [] };
  /** 음역 추측으로 옥타브를 옮긴 파트. 근거가 음자리표가 아님을 뜻한다. */
  const shifted: Record<Part, boolean> = {
    Soprano: false,
    Alto: false,
    Tenor: false,
    Bass: false,
  };

  for (const part of PART_ORDER) {
    const notes = parts[part];
    if (notes.length === 0) {
      out[part] = [];
      continue;
    }
    const range = PART_RANGE[part];
    const pitches = notes.map((n) => n.p).sort((a, b) => a - b);
    const median = pitches[Math.floor(pitches.length / 2)];

    // 이미 음역 안에 있으면 절대 건드리지 않는다.
    // 정상 악보를 훼손하지 않는 것이 놓친 오류를 잡는 것보다 중요하다.
    if (median >= range.min && median <= range.max) {
      out[part] = notes;
      continue;
    }

    // 음역을 벗어난 경우에만, 음역 안으로 들어오게 하는 최소 옥타브 이동을 찾는다
    const center = (range.comfortable[0] + range.comfortable[1]) / 2;
    let bestShift = 0;
    let bestDist = Infinity;
    for (const shift of [-24, -12, 12, 24]) {
      const shifted = median + shift;
      if (shifted < range.min || shifted > range.max) continue;
      const d = Math.abs(shifted - center);
      if (d < bestDist) {
        bestDist = d;
        bestShift = shift;
      }
    }

    if (bestShift !== 0) {
      warnings.push({
        code: "RANGE_VIOLATION",
        severity: "warn",
        message: `${koPart(part)} 파트가 통상 음역에서 ${Math.abs(bestShift) / 12}옥타브 벗어나 있어 자동 보정했습니다. 음자리표 인식에 문제가 있을 수 있으니 확인해 주세요.`,
        part,
        detail: { median, shift: bestShift },
      });
      out[part] = notes.map((n) => ({ ...n, p: n.p + bestShift }));
      shifted[part] = true;
    } else {
      out[part] = notes;
    }
  }

  return { parts: out, warnings, shifted };
}

/**
 * 파트별 음표 수 균형을 검사한다.
 *
 * 한 파트만 음표가 현저히 적으면 성부 분리가 실패한 것이다. 이 검사가
 * 앞선 검증에서 "베이스 45% 소실"을 잡아낸 게이트에 해당한다.
 *
 * 단성부 악보(`layout === "single"`)에는 적용하지 않는다. 파트 연습용으로
 * 한 성부만 뽑은 악보나 독창 악보는 4파트가 없는 것이 정상이다.
 * 실측(single_staff.pdf)에서 이 검사가 error 3건을 내며 신뢰도를 5로
 * 떨어뜨렸는데, 악보 자체는 완벽하게 읽힌 상태였다. 정상 입력을 실패로
 * 보고하는 것은 놓친 오류보다 해롭다 — 사용자가 도구를 불신하게 된다.
 */
export function checkPartBalance(parts: Record<Part, Note[]>, layout?: LayoutType): Warning[] {
  const warnings: Warning[] = [];
  if (layout === "single") return warnings;

  const counts = PART_ORDER.map((p) => parts[p].length);
  const max = Math.max(...counts);
  if (max === 0) return warnings;

  PART_ORDER.forEach((part, i) => {
    const ratio = counts[i] / max;
    if (ratio < 0.6) {
      warnings.push({
        code: "VOICE_MISSING",
        severity: ratio < 0.3 ? "error" : "warn",
        message: `${koPart(part)} 파트의 음표가 ${counts[i]}개로 가장 많은 파트(${max}개)의 ${(ratio * 100).toFixed(0)}%뿐입니다. 성부 분리가 제대로 되지 않았을 수 있습니다.`,
        part,
        detail: { counts: Object.fromEntries(PART_ORDER.map((p, k) => [p, counts[k]])) },
      });
    }
  });

  return warnings;
}

/** 마디 총 음길이가 박자표와 맞는지 검사 */
export function checkMeasureDurations(
  parts: Record<Part, Note[]>,
  rests: Record<Part, Rest[]>,
  timeSignature: { numerator: number; denominator: number },
): { warnings: Warning[]; ratio: number } {
  const expected = (timeSignature.numerator * 4) / timeSignature.denominator;
  const bad: number[] = [];

  /*
   * 쉼표도 마디를 채운다. 음표 길이만 더하면 쉼표로 시작하거나 끝나는
   * 마디가 항상 짧게 나와 거짓 경고가 뜬다. rest_test.pdf의 3/4 마디는
   * 4분쉼표 + 8분음표 4개라 음표만 세면 2.0이고, 쉼표를 넣어야 3.0이다.
   */
  for (const part of PART_ORDER) {
    const byMeasure: Record<number, number> = {};
    for (const n of parts[part]) byMeasure[n.m] = (byMeasure[n.m] ?? 0) + n.d;
    for (const r of rests[part]) byMeasure[r.m] = (byMeasure[r.m] ?? 0) + r.d;
    const measures = Object.keys(byMeasure)
      .map(Number)
      .sort((a, b) => a - b);
    for (const m of measures) {
      // 첫 마디(못갖춘마디)와 마지막 마디는 짧을 수 있으므로 제외
      if (m === measures[0] || m === measures[measures.length - 1]) continue;
      if (Math.abs(byMeasure[m] - expected) > 0.01 && !bad.includes(m)) bad.push(m);
    }
  }

  // 전체 마디 대비 불일치 비율. 신뢰도 계산이 쓴다. docs/OMR.md 6장
  const allMeasures = new Set<number>();
  for (const part of PART_ORDER) {
    for (const n of parts[part]) allMeasures.add(n.m);
    for (const r of rests[part]) allMeasures.add(r.m);
  }
  const ratio = allMeasures.size > 0 ? bad.length / allMeasures.size : 0;

  if (bad.length === 0) return { warnings: [], ratio: 0 };
  return {
    warnings: [
      {
        code: "MEASURE_DURATION_MISMATCH",
        severity: bad.length > 3 ? "warn" : "info",
        message: `${bad.length}개 마디의 총 음길이가 박자표(${timeSignature.numerator}/${timeSignature.denominator})와 맞지 않습니다. 해당 마디의 리듬이 부정확할 수 있습니다.`,
        measures: bad.slice(0, 20),
        detail: { expected, ratio },
      },
    ],
    ratio,
  };
}

/** 한국어 파트명 */
export function koPart(part: Part): string {
  return { Soprano: "소프라노", Alto: "알토", Tenor: "테너", Bass: "베이스" }[part];
}

/** 음자리표 한국어명 (진단 메시지용) */
export function koClef(clef: ClefType): string {
  return {
    treble: "높은음자리표",
    treble8va: "옥타브 높은 높은음자리표",
    treble8vb: "옥타브 낮은 높은음자리표",
    treble15mb: "두 옥타브 낮은 높은음자리표",
    bass: "낮은음자리표",
    bass8vb: "옥타브 낮은 낮은음자리표",
    alto: "알토음자리표",
    tenor: "테너음자리표",
  }[clef];
}
