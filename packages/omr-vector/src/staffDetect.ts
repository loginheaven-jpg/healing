/**
 * 2단계: 수평선에서 오선(5줄 묶음)을 찾는다.
 *
 * 실증에서 확인한 대로 벡터 PDF의 오선은 완벽한 등간격 수평선이다.
 * 따라서 딥러닝이나 이미지 처리가 전혀 필요 없고, Y좌표를 클러스터링하면 된다.
 *
 * 오선 간격(spacing)은 이 파이프라인 전체에서 가장 중요한 값이다.
 * 음높이는 "오선 기준선에서 spacing/2 단위로 몇 칸 떨어졌는가"로 계산되므로,
 * spacing이 틀리면 모든 음이 틀린다.
 */

import type { ClefType, Glyph, Line, Staff } from "./types.js";

/** 오선으로 인정할 최소 선 길이 (페이지 폭 대비) */
const MIN_STAFF_LINE_RATIO = 0.25;
/** 등간격 판정 허용 오차 (간격 대비 비율) */
const SPACING_TOLERANCE = 0.18;

/**
 * 수평선 목록에서 오선을 검출한다.
 * 덧줄(ledger line)은 짧으므로 길이 필터로 걸러진다.
 */
export function detectStaves(hLines: Line[], pageWidth: number): Omit<Staff, "clef" | "keyAlters" | "keyFifths">[] {
  const minLen = pageWidth * MIN_STAFF_LINE_RATIO;

  // 충분히 긴 수평선만 후보
  const candidates = hLines
    .filter(l => Math.abs(l.x2 - l.x1) >= minLen)
    .map(l => ({
      y: (l.y1 + l.y2) / 2,
      x1: Math.min(l.x1, l.x2),
      x2: Math.max(l.x1, l.x2),
    }));

  if (candidates.length < 5) return [];

  // 같은 Y에 중복된 선 제거 (0.5pt 이내는 동일선)
  candidates.sort((a, b) => b.y - a.y); // Y 내림차순 = 위에서 아래로
  const dedup: typeof candidates = [];
  for (const c of candidates) {
    const last = dedup[dedup.length - 1];
    if (last && Math.abs(last.y - c.y) < 0.5) {
      // 더 긴 선을 남긴다
      if (c.x2 - c.x1 > last.x2 - last.x1) dedup[dedup.length - 1] = c;
      continue;
    }
    dedup.push(c);
  }

  // 연속 5줄이 등간격인 구간을 찾는다
  const staves: Omit<Staff, "clef" | "keyAlters" | "keyFifths">[] = [];
  let i = 0;

  while (i + 4 < dedup.length) {
    const group = dedup.slice(i, i + 5);
    const gaps: number[] = [];
    for (let k = 0; k < 4; k++) gaps.push(group[k].y - group[k + 1].y);

    const avg = gaps.reduce((s, g) => s + g, 0) / 4;
    const uniform = avg > 1 && gaps.every(g => Math.abs(g - avg) <= avg * SPACING_TOLERANCE);

    if (uniform) {
      staves.push({
        lineYs: group.map(g => g.y),
        spacing: avg,
        topY: group[0].y,
        bottomY: group[4].y,
        x1: Math.min(...group.map(g => g.x1)),
        x2: Math.max(...group.map(g => g.x2)),
      });
      i += 5;
    } else {
      i += 1;
    }
  }

  return staves;
}

/**
 * 각 오선의 음자리표를 판정한다.
 *
 * 음자리표 글리프는 오선 왼쪽 끝에 있고 오선 5줄 전체 높이에 걸친다.
 * `treble8vb`(테너용 옥타브 이동 음자리표)는 글리프 이름으로 구분되지 않는
 * 경우가 있어, 음자리표 아래의 작은 "8" 텍스트로도 판정한다.
 */
export function assignClefs(
  staves: Omit<Staff, "clef" | "keyAlters" | "keyFifths">[],
  glyphs: Glyph[],
  texts: { x: number; y: number; text: string; size: number }[]
): { clefs: ClefType[]; unrecognized: number[] } {
  const clefs: ClefType[] = [];
  const unrecognized: number[] = [];

  for (let si = 0; si < staves.length; si++) {
    const st = staves[si];
    // 오선 좌측 20% 이내, 오선 상하 범위 ±spacing*2 안의 clef 글리프
    const zoneX = st.x1 + (st.x2 - st.x1) * 0.2;
    const cands = glyphs.filter(
      g =>
        g.kind?.type === "clef" &&
        g.x >= st.x1 - st.spacing * 3 &&
        g.x <= zoneX &&
        g.y >= st.bottomY - st.spacing * 2.5 &&
        g.y <= st.topY + st.spacing * 2.5
    );

    if (cands.length === 0) {
      // 음자리표를 못 찾으면 오선 위치로 추정한다.
      // 4단 개방악보 관례: 위 2단은 treble, 3단은 treble8vb, 아래는 bass
      unrecognized.push(si);
      if (staves.length === 4) {
        clefs.push(si < 2 ? "treble" : si === 2 ? "treble8vb" : "bass");
      } else if (staves.length === 2) {
        clefs.push(si === 0 ? "treble" : "bass");
      } else {
        clefs.push("treble");
      }
      continue;
    }

    // 가장 왼쪽 글리프를 채택
    cands.sort((a, b) => a.x - b.x);
    let clef = (cands[0].kind as { type: "clef"; clef: ClefType }).clef;

    // 옥타브 이동 표시("8")가 음자리표 아래에 있는지 확인
    if (clef === "treble") {
      const cg = cands[0];
      const has8 = texts.some(
        t =>
          t.text === "8" &&
          Math.abs(t.x - cg.x) < st.spacing * 3 &&
          t.y < st.bottomY &&
          t.y > st.bottomY - st.spacing * 3.5
      );
      if (has8) clef = "treble8vb";
    }

    clefs.push(clef);
  }

  return { clefs, unrecognized };
}

/**
 * 음자리표별 기준 정보.
 *
 * refMidi  : 오선 맨 아래 줄에 놓인 음의 MIDI 번호
 * refStep  : 그 음의 절대 diatonic step. `옥타브 × 7 + 음이름인덱스`
 *            음이름 인덱스는 C=0, D=1, E=2, F=3, G=4, A=5, B=6
 *
 * 예) 높은음자리표는 맨 아래 줄이 E4(MIDI 64).
 *     낮은음자리표는 맨 아래 줄이 G2(MIDI 43).
 *     테너용 treble8vb는 높은음자리표를 한 옥타브 낮게 읽으므로 E3(MIDI 52).
 *
 * 실측 검증: closed_chord.pdf에서 낮은음자리표 파트(T/B)가 100% 일치했고
 * 높은음자리표 파트가 정확히 장3도(2계단) 높게 나왔다. 이는 refStep의
 * 음이름 인덱스를 잘못 넣었다는 신호였다. E는 인덱스 2인데 4를 넣어
 * 2계단 밀린 것이다. 아래 값은 수정 후 재검증한 값이다.
 */
export const CLEF_REF: Record<ClefType, { refMidi: number; refStep: number }> = {
  // 맨 아래 줄 = E4. 절대 스텝 = 4×7 + E(2) = 30
  treble: { refMidi: 64, refStep: 4 * 7 + 2 },
  // 맨 아래 줄 = E3 (한 옥타브 아래로 읽음). 3×7 + 2 = 23
  treble8vb: { refMidi: 52, refStep: 3 * 7 + 2 },
  // 맨 아래 줄 = G2. 2×7 + G(4) = 18
  bass: { refMidi: 43, refStep: 2 * 7 + 4 },
  // 알토 음자리표: 맨 아래 줄 = F3. 3×7 + F(3) = 24
  alto: { refMidi: 53, refStep: 3 * 7 + 3 },
  // 테너 음자리표: 맨 아래 줄 = D3. 3×7 + D(1) = 22
  tenor: { refMidi: 50, refStep: 3 * 7 + 1 },
};

/** diatonic step(C=0..B=6) → 옥타브 내 semitone */
export const STEP_SEMITONE = [0, 2, 4, 5, 7, 9, 11];
/** step 인덱스 → 음이름 */
export const STEP_NAME = ["C", "D", "E", "F", "G", "A", "B"];
