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

/** 정확 일치 사전 */
const EXACT: Record<string, GlyphKind> = {
  // ── LilyPond / Emmentaler ─────────────────────────────
  // noteheads.sN : N은 음길이 지수. s0=온음표, s1=2분음표, s2=4분음표 이하
  // 4분음표와 8분음표는 같은 머리를 쓰고 꼬리(flag)로 구분한다.
  "noteheads.s0": { type: "notehead", duration: 4 },
  "noteheads.s1": { type: "notehead", duration: 2 },
  "noteheads.s2": { type: "notehead", duration: 1 },
  "noteheads.d0": { type: "notehead", duration: 4 },
  "noteheads.d1": { type: "notehead", duration: 2 },
  "noteheads.d2": { type: "notehead", duration: 1 },
  "noteheads.u0": { type: "notehead", duration: 4 },
  "noteheads.u1": { type: "notehead", duration: 2 },
  "noteheads.u2": { type: "notehead", duration: 1 },
  "noteheads.s0harmonic": { type: "notehead", duration: 4 },

  "clefs.G": { type: "clef", clef: "treble" },
  "clefs.G_change": { type: "clef", clef: "treble" },
  "clefs.F": { type: "clef", clef: "bass" },
  "clefs.F_change": { type: "clef", clef: "bass" },
  "clefs.C": { type: "clef", clef: "alto" },
  "clefs.C_change": { type: "clef", clef: "alto" },

  "rests.0": { type: "rest", duration: 4 },
  "rests.1": { type: "rest", duration: 2 },
  "rests.2": { type: "rest", duration: 1 },
  "rests.3": { type: "rest", duration: 0.5 },
  "rests.4": { type: "rest", duration: 0.25 },
  "rests.M1": { type: "rest", duration: 4 },

  "accidentals.sharp": { type: "accidental", alter: 1 },
  "accidentals.flat": { type: "accidental", alter: -1 },
  "accidentals.natural": { type: "accidental", alter: 0 },
  "accidentals.doublesharp": { type: "accidental", alter: 2 },
  "accidentals.flatflat": { type: "accidental", alter: -2 },

  dots: { type: "dot" },
  "dots.dot": { type: "dot" },

  "brace.large": { type: "brace" },
  "brackettips.up": { type: "brace" },
  "brackettips.down": { type: "brace" },

  // LilyPond 통합 박자표 글리프 (숫자 두 개를 한 글리프로 그림)
  "timesig.C44": { type: "timesig", digit: -1 },
  "timesig.C22": { type: "timesig", digit: -2 },

  // ── SMuFL 표준 (MuseScore 4, Bravura, Leland) ──────────
  noteheadDoubleWhole: { type: "notehead", duration: 8 },
  noteheadWhole: { type: "notehead", duration: 4 },
  noteheadHalf: { type: "notehead", duration: 2 },
  noteheadBlack: { type: "notehead", duration: 1 },

  gClef: { type: "clef", clef: "treble" },
  gClef8vb: { type: "clef", clef: "treble8vb" },
  gClefChange: { type: "clef", clef: "treble" },
  fClef: { type: "clef", clef: "bass" },
  fClefChange: { type: "clef", clef: "bass" },
  cClef: { type: "clef", clef: "alto" },

  restWhole: { type: "rest", duration: 4 },
  restHalf: { type: "rest", duration: 2 },
  restQuarter: { type: "rest", duration: 1 },
  rest8th: { type: "rest", duration: 0.5 },
  rest16th: { type: "rest", duration: 0.25 },

  accidentalSharp: { type: "accidental", alter: 1 },
  accidentalFlat: { type: "accidental", alter: -1 },
  accidentalNatural: { type: "accidental", alter: 0 },
  accidentalDoubleSharp: { type: "accidental", alter: 2 },
  accidentalDoubleFlat: { type: "accidental", alter: -2 },

  augmentationDot: { type: "dot" },

  flag8thUp: { type: "flag", count: 1 },
  flag8thDown: { type: "flag", count: 1 },
  flag16thUp: { type: "flag", count: 2 },
  flag16thDown: { type: "flag", count: 2 },
  flag32ndUp: { type: "flag", count: 3 },
  flag32ndDown: { type: "flag", count: 3 },

  brace: { type: "brace" },
  bracketTop: { type: "brace" },
  bracketBottom: { type: "brace" },
};

/** 접두사 기반 규칙. EXACT에서 못 찾으면 순서대로 시도한다. */
const PREFIX_RULES: { test: RegExp; resolve: (m: RegExpMatchArray) => GlyphKind }[] = [
  // LilyPond 꼬리: flags.u3 (8분 위), flags.d4 (16분 아래)
  // 숫자 3=8분음표, 4=16분음표, 5=32분음표 …
  {
    test: /^flags\.[ud](\d)$/,
    resolve: m => ({ type: "flag", count: Math.max(1, Number(m[1]) - 2) }),
  },
  // LilyPond 숫자 (박자표): zero, one, two, three, four…
  {
    test: /^(zero|one|two|three|four|five|six|seven|eight|nine)$/,
    resolve: m => ({
      type: "timesig",
      digit: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"].indexOf(m[1]),
    }),
  },
  // SMuFL 박자표 숫자: timeSig4
  { test: /^timeSig(\d)$/, resolve: m => ({ type: "timesig", digit: Number(m[1]) }) },
  /*
   * 이름 없이 그려진 음악 폰트 숫자. pdfExtract가 unicode로 이름을 지어 준다.
   *
   * LilyPond는 3/4·6/8 같은 숫자 박자표를 Differences에 이름 없이 그린다.
   * 통합 글리프(timesig.C44)를 쓰는 4/4·2/2만 예전에도 읽혔던 이유가 이것이다.
   *
   * 박자표 외의 숫자(손가락 번호·잇단음표 숫자)도 여기에 걸리지만,
   * readTimeSignature가 음자리표 오른쪽 구간과 오선 안쪽으로 범위를 좁히므로
   * 엉뚱한 숫자가 박자표로 채택되지는 않는다.
   */
  { test: /^digit\.(\d)$/, resolve: m => ({ type: "timesig", digit: Number(m[1]) }) },
  // LilyPond 박자표: timesig.C44, timesig.C34 등
  { test: /^timesig\./, resolve: () => ({ type: "timesig", digit: -1 }) },
  // SMuFL 음표머리 변형: noteheadBlackSmall 등
  { test: /^noteheadBlack/, resolve: () => ({ type: "notehead", duration: 1 }) },
  { test: /^noteheadHalf/, resolve: () => ({ type: "notehead", duration: 2 }) },
  { test: /^noteheadWhole/, resolve: () => ({ type: "notehead", duration: 4 }) },
  // 일반 접두사
  { test: /^noteheads?\./, resolve: () => ({ type: "notehead", duration: 1 }) },
  { test: /^rests?\./, resolve: () => ({ type: "rest", duration: 1 }) },
  { test: /^accidentals?\./, resolve: () => ({ type: "accidental", alter: 0 }) },
  { test: /^clefs?\./, resolve: () => ({ type: "clef", clef: "treble" }) },
  { test: /^dots?\b/, resolve: () => ({ type: "dot" }) },
];

/**
 * 무시해도 안전한 글리프 이름 접두사.
 *
 * 음악적 의미가 없어 파싱에 쓰이지 않는 장식·구조 기호다.
 * 이런 것이 UNKNOWN_GLYPH로 올라오면 **진짜 미해석 기호가 잡음에 묻힌다.**
 * rest_test.pdf의 UNKNOWN_GLYPH 원인이 큰괄호 brace210 하나였다.
 *
 * LilyPond의 brace·bracket 글리프는 크기별로 번호가 붙는다
 * (brace210, brace178 …). 그래서 정확 일치가 아니라 접두사로 잡는다.
 * docs/tasks/P1.md 3.8
 */
const IGNORE_PREFIX = [
  /^brace/, // 큰괄호 (크기별 번호가 붙는다)
  /^bracket/, // 대괄호와 그 끝단
  /^pedal\./, // 페달 표시
  /^scripts\./, // 아티큘레이션·늘임표
  /^dynamic/, // 셈여림
  /^artic/,
  /^fermata/,
  /^ornament/,
  /^tuplet/,
  /^arpeggio/,
];

/** 무시해도 안전한 글리프 (경고를 발생시키지 않음) */
const IGNORE = new Set([
  "space",
  "pedal.Ped",
  "pedal.*",
  "scripts.ufermata",
  "scripts.dfermata",
  "scripts.staccato",
  "scripts.tenuto",
  "scripts.accent",
  "scripts.marcato",
  "scripts.upbow",
  "scripts.downbow",
  "scripts.trill",
  "scripts.segno",
  "scripts.coda",
  "fermataAbove",
  "fermataBelow",
  "articStaccatoAbove",
  "articStaccatoBelow",
  "articAccentAbove",
  "articAccentBelow",
  "articTenutoAbove",
  "articTenutoBelow",
  "dynamicPiano",
  "dynamicForte",
  "dynamicMezzo",
  "dynamicSforzando",
  "dynamicRinforzando",
]);

/**
 * 글리프 이름을 음악적 의미로 해석한다.
 * 해석 실패 시 null을 반환하고, 호출자가 UNKNOWN_GLYPH 경고를 올린다.
 */
export function resolveGlyph(name: string): GlyphKind | null {
  if (!name) return null;

  const exact = EXACT[name];
  if (exact) return exact;

  for (const rule of PREFIX_RULES) {
    const m = name.match(rule.test);
    if (m) return rule.resolve(m);
  }

  // 알파벳 한 글자 또는 한글 등은 가사·마디번호·지시어 텍스트다.
  if (/^[A-Za-z0-9]$/.test(name)) return { type: "other" };
  if (/^uni[0-9A-Fa-f]{4}$/.test(name)) return { type: "other" };

  if (IGNORE.has(name)) return { type: "other" };
  if (IGNORE_PREFIX.some(re => re.test(name))) return { type: "other" };

  return null;
}

/** 사전 등록 여부 (테스트·진단용) */
export function isKnownGlyph(name: string): boolean {
  return resolveGlyph(name) !== null;
}
