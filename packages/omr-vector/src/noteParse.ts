/**
 * 4단계: 글리프를 실제 음표로 변환한다.
 *
 * 음높이 계산이 이 파일의 핵심이다. 원리는 단순하다.
 *   1) 음표머리 Y좌표와 오선 맨 아래 줄의 Y좌표 차이를 구한다
 *   2) 그 차이를 (오선 간격 / 2)로 나누면 "계단 수"가 나온다
 *   3) 계단 수는 diatonic step(도레미) 단위이므로 음자리표 기준음에 더한다
 *   4) 조표와 임시표를 적용해 반음을 조정한다
 *
 * 음길이는 글리프 이름(머리 모양)에서 시작하지만, 4분음표와 8분음표가 같은
 * 머리를 쓰므로 꼬리(flag)와 빔(beam)을 함께 봐야 한다.
 */

import { CLEF_REF, STEP_NAME, STEP_SEMITONE } from "./staffDetect.js";
import type { FilledRect, Glyph, Line, Staff } from "./types.js";

/** 음표머리 하나 (음길이 확정 전) */
export type RawNote = {
  x: number;
  y: number;
  /** MIDI 음높이 */
  midi: number;
  /** 글리프에서 얻은 기본 음길이 (4분음표=1.0). 검은 머리는 1.0으로 시작 */
  baseDuration: number;
  /** 부점 개수 */
  dots: number;
  /** 꼬리 개수 (0이면 4분음표 이상) */
  flags: number;
  /** 소속 오선 인덱스 */
  staffIdx: number;
  /** 마디 번호 */
  measure: number;
  /** 확정된 음길이 */
  duration: number;
  /** 음이름 (진단용) */
  name: string;
};

/**
 * 오선 위 Y좌표를 MIDI 음높이로 변환한다.
 *
 * @param y        음표머리 중심 Y (PDF 좌표계, 위로 증가)
 * @param staff    소속 오선
 * @param accidental 이 음에 적용된 임시표 (null이면 조표만 적용)
 */
export function yToMidi(
  y: number,
  staff: Staff,
  accidental: number | null
): { midi: number; name: string; step: number } {
  const half = staff.spacing / 2;
  // 맨 아래 줄에서 몇 계단 위인가 (반올림으로 줄/칸 판정)
  const steps = Math.round((y - staff.bottomY) / half);

  const ref = CLEF_REF[staff.clef];
  const absStep = ref.refStep + steps;

  const octave = Math.floor(absStep / 7);
  const stepInOctave = ((absStep % 7) + 7) % 7;
  const letter = STEP_NAME[stepInOctave];

  // 조표 기본값 → 임시표가 있으면 덮어쓴다
  const keyAlter = staff.keyAlters[letter] ?? 0;
  const alter = accidental !== null ? accidental : keyAlter;

  // MIDI: C-1 = 0 이므로 옥타브 n의 C는 (n+1)*12
  const midi = (octave + 1) * 12 + STEP_SEMITONE[stepInOctave] + alter;

  const accStr = alter === 1 ? "#" : alter === -1 ? "b" : alter === 2 ? "##" : alter === -2 ? "bb" : "";
  return { midi, name: `${letter}${accStr}${octave}`, step: absStep };
}

/**
 * 마디선 X좌표 목록을 구한다.
 *
 * 함정: 음표 기둥(stem)이 우연히 오선 상하 범위를 덮으면 마디선으로 오인된다.
 * 실측에서 낮은음자리표 오선의 마디선이 8개가 아니라 13개로 검출됐고,
 * 그 결과 마디 번호가 밀려 마디 총 음길이가 4.0이 아닌 0.5, 1.0 등으로
 * 깨졌다. 원인은 낮은음자리표 파트의 기둥이 위로 뻗어 오선 높이와
 * 비슷해졌기 때문이다.
 *
 * 구분 근거는 **선 두께**다. 실측값이 명확히 갈렸다.
 *   마디선: 두께 0.95, 길이 19.92 (오선 높이와 정확히 일치)
 *   기둥:   두께 0.25, 길이 21~26 (오선 높이를 넘거나 어긋남)
 *
 * 기둥은 마디선보다 얇게 조판된다. 이는 악보 조판의 보편적 관례이므로
 * LilyPond뿐 아니라 다른 프로그램에서도 성립한다.
 * 또한 마디선은 오선 상하 경계에 **정확히** 맞고, 기둥은 어긋난다.
 */
export function detectBarlines(vLines: Line[], staff: Staff): number[] {
  const h = staff.topY - staff.bottomY; // 오선 5줄 전체 높이
  // 마디선은 오선 경계에 정확히 맞으므로 허용 오차를 좁게 둔다
  const tol = staff.spacing * 0.35;

  const candidates = vLines
    .filter(l => {
      const top = Math.max(l.y1, l.y2);
      const bot = Math.min(l.y1, l.y2);
      return (
        Math.abs(top - staff.topY) < tol &&
        Math.abs(bot - staff.bottomY) < tol &&
        Math.abs(top - bot - h) < tol
      );
    })
    .map(l => ({ x: (l.x1 + l.x2) / 2, w: l.width }));

  if (candidates.length === 0) return [];

  // 두께 분포로 기둥을 걸러낸다.
  //
  // 최대값 기준 비율은 쓸 수 없다. 곡 마지막의 겹세로줄(final barline)은
  // 훨씬 굵기 때문이다. 실측에서 마지막 마디선만 2.99이고 나머지는 0.95였고,
  // `maxW*0.6 = 1.79` 필터가 정상 마디선 전부를 걸러내 마디 1개만 남았다.
  //
  // 대신 **최빈 두께**를 쓴다. 마디선은 같은 두께로 여러 개 반복되고,
  // 기둥은 그보다 얇다. 최빈값 이상만 남기면 기둥은 빠지고 겹세로줄은 남는다.
  const widths = candidates.map(c => c.w).sort((a, b) => a - b);
  const modeW = mostCommon(widths, 0.15);
  const bars = candidates.filter(c => c.w >= modeW * 0.75);

  const xs = bars.map(c => c.x);

  // 중복 제거 (굵은 마디선은 여러 선으로 그려진다)
  xs.sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of xs) {
    if (out.length === 0 || x - out[out.length - 1] > staff.spacing) out.push(x);
  }
  return out;
}

/**
 * 근사 최빈값. 값들을 tolerance 비율로 묶어 가장 큰 묶음의 평균을 반환한다.
 * 부동소수 두께 값은 정확히 일치하지 않으므로 구간으로 묶어야 한다.
 */
function mostCommon(sorted: number[], tolRatio: number): number {
  if (sorted.length === 0) return 0;
  let best = { count: 0, sum: 0, n: 0 };
  for (let i = 0; i < sorted.length; i++) {
    const base = sorted[i];
    let count = 0;
    let sum = 0;
    for (let j = i; j < sorted.length; j++) {
      if (sorted[j] > base * (1 + tolRatio)) break;
      count++;
      sum += sorted[j];
    }
    if (count > best.count) best = { count, sum, n: count };
  }
  return best.n > 0 ? best.sum / best.n : sorted[0];
}

/**
 * 시스템 내 모든 오선의 마디선을 통합한다.
 *
 * 같은 시스템의 오선들은 마디선 X좌표가 동일해야 한다. 한 오선에서
 * 놓친 마디선을 다른 오선이 보완하므로, 통합하면 검출이 안정된다.
 * 이것이 오선별로 따로 계산하는 것보다 신뢰도가 높다.
 */
export function unifyBarlines(perStaff: number[][], spacing: number): number[] {
  const all = perStaff.flat().sort((a, b) => a - b);
  if (all.length === 0) return [];

  // 근접한 값끼리 묶어 평균을 낸다
  const clusters: number[][] = [[all[0]]];
  for (let i = 1; i < all.length; i++) {
    const last = clusters[clusters.length - 1];
    if (all[i] - last[last.length - 1] <= spacing) last.push(all[i]);
    else clusters.push([all[i]]);
  }

  // 과반 오선에서 검출된 마디선만 채택 (오검출 억제)
  const minVotes = Math.max(1, Math.ceil(perStaff.length / 2));
  return clusters
    .filter(c => c.length >= minVotes)
    .map(c => c.reduce((s, v) => s + v, 0) / c.length);
}

/**
 * 음표머리를 추출하고 음높이·음길이를 계산한다.
 *
 * @param staffIdx 이 오선의 인덱스 (여러 오선을 순회하며 호출)
 */
export function parseNotesOnStaff(
  staff: Staff,
  staffIdx: number,
  glyphs: Glyph[],
  rects: FilledRect[],
  barlines: number[],
  /**
   * 인접 오선의 몸통 Y범위. 개방악보에서 오선 간격이 좁으면 덧줄 허용범위가
   * 이웃 오선까지 침범해 다른 파트의 음표를 흡수한다.
   *
   * 실측에서 이 문제를 겪었다. 테너 오선(bottomY=667.6)에 알토 오선의
   * 음표(y=702~707)가 섞여 들어왔다. 알토 오선의 bottomY는 712.4로
   * 테너 오선 위 45pt(= 9 × spacing)에 있는데, 덧줄 허용범위 5칸
   * (=25pt)에 알토 음표 일부가 걸린 것이다.
   *
   * 중간선으로 딱 잘라내는 방식은 실패했다. 오선 간격이 좁으면 중간선이
   * 오선에 너무 가까워져 정상적인 덧줄 음표까지 잘려나간다.
   * 대신 **최근접 오선 판정**을 쓴다 (belongsToThisStaff 참고).
   */
  neighborBounds?: {
    above?: { bottomY: number; topY: number };
    below?: { bottomY: number; topY: number };
  }
): RawNote[] {
  const sp = staff.spacing;

  // 기본 허용범위: 오선 상하로 덧줄 5칸
  const yMin = staff.bottomY - sp * 5;
  const yMax = staff.topY + sp * 5;

  /**
   * 이 음표가 정말 이 오선의 것인지 판정한다.
   *
   * **최근접 오선 판정**: 음표가 이 오선보다 이웃 오선에 더 가까우면
   * 이웃의 것이다. 오선 간격에 무관하게 동작하고, 덧줄 음표도 자기 오선에
   * 더 가까운 한 살아남는다.
   *
   * 거리는 오선 몸통(bottomY~topY)까지의 거리로 잰다. 몸통 안이면 0.
   *
   * 순수 Y거리만으로는 부족하다. 실측에서 테너 오선 위 17.4pt(3.5칸)에
   * 있는 음표가 알토 오선(14.3pt)에 더 가까워 탈락했는데, 실제로는
   * 테너의 높은 음이었다. 오선 간 간격이 좁으면 정상적인 덧줄 음표가
   * 이웃에 더 가까워질 수 있다.
   *
   * 그래서 **같은 X 위치에 이웃 오선의 음표가 이미 있는지**를 함께 본다.
   * 이웃이 그 위치에 자기 음표를 갖고 있다면 이 음표는 이웃 것이 아니다
   * (한 성부는 한 시점에 한 음이므로). 이 판단이 Y거리보다 강하다.
   */
  const dist = (y: number, s: { bottomY: number; topY: number }): number => {
    if (y >= s.bottomY && y <= s.topY) return 0;
    return y < s.bottomY ? s.bottomY - y : y - s.topY;
  };

  // 이웃 오선 몸통 안에 확실히 들어있는 음표들의 X좌표를 미리 수집한다.
  // 이들은 이웃의 것이 확실하므로, 같은 X에 있는 애매한 음표는 내 것이다.
  const neighborOwnX: { above: number[]; below: number[] } = { above: [], below: [] };
  for (const key of ["above", "below"] as const) {
    const nb = neighborBounds?.[key];
    if (!nb) continue;
    neighborOwnX[key] = glyphs
      .filter(g => g.kind?.type === "notehead" && g.y >= nb.bottomY && g.y <= nb.topY)
      .map(g => g.x);
  }

  const hasNeighborNoteAt = (x: number, key: "above" | "below"): boolean =>
    neighborOwnX[key].some(nx => Math.abs(nx - x) < sp * 0.8);

  const belongsToThisStaff = (y: number, x: number): boolean => {
    if (y < yMin || y > yMax) return false;
    const dOwn = dist(y, staff);
    if (dOwn === 0) return true;

    for (const key of ["above", "below"] as const) {
      const nb = neighborBounds?.[key];
      if (!nb) continue;
      const dNb = dist(y, nb);
      if (dNb >= dOwn) continue;
      // 이웃 오선 **몸통 안**에 있는 음표는 무조건 이웃 것이다.
      // 실측에서 알토 오선 첫째 줄(y=712.4) 위에 정확히 놓인 알토 음표를
      // 테너가 흡수해 Bb5로 잘못 읽었다. 몸통 안이면 예외를 두지 않는다.
      if (dNb === 0) return false;
      // 이웃이 더 가깝지만, 이웃이 이 X에 이미 자기 음표를 갖고 있으면
      // 이 음표는 이웃 것이 아니다.
      if (hasNeighborNoteAt(x, key)) continue;
      return false;
    }
    return true;
  };

  // 조표·박자표 영역을 지나친 지점부터 음표로 인정
  const musicStartX = findMusicStartX(staff, glyphs, barlines);

  const heads = glyphs.filter(
    g =>
      g.kind?.type === "notehead" &&
      belongsToThisStaff(g.y, g.x) &&
      g.x >= musicStartX &&
      g.x <= staff.x2 + sp
  );

  /*
   * 임시표 후보.
   *
   * musicStartX를 하한으로 쓰면 안 된다. 첫 음표에 붙은 임시표는
   * 그 음표보다 왼쪽에 있으므로 musicStartX 바로 앞에 놓인다.
   * accidental.pdf 실측: musicStartX=112.6인데 첫 음표(x=117.9)의
   * sharp는 x=110.7에 있어 제외되었고, 1마디 F#가 F로 읽혔다.
   *
   * 조표는 아래 findMusicStartX에서 이미 걸러지므로(오른쪽에 자기 음표가
   * 없는 것) 여기서는 첫 음표 왼쪽 2.6sp까지 여유를 준다.
   */
  const accs = glyphs.filter(
    g =>
      g.kind?.type === "accidental" &&
      belongsToThisStaff(g.y, g.x) &&
      g.x >= musicStartX - sp * 2.6
  );

  // 부점: 음표 오른쪽 근처
  const dots = glyphs.filter(g => g.kind?.type === "dot" && belongsToThisStaff(g.y, g.x));

  // 꼬리: 기둥 끝에 붙는다
  const flags = glyphs.filter(g => g.kind?.type === "flag" && g.y >= yMin - sp * 3 && g.y <= yMax + sp * 3);

  // 빔: 굵은 수평 사각형.
  //
  // 실측 주의: 빔은 기울어질 수 있어 bounding box 높이가 실제 두께보다 크다.
  // closed_chord.pdf에서 빔의 box가 42.69 × 6.97 (= 8.57sp × 1.40sp)로 나왔다.
  // 처음에 상한을 1.2sp로 두어 빔을 전부 놓쳤고, 그 결과 8분음표가 모두
  // 4분음표로 인식되어 마디 총 음길이가 4.0이 아니라 6.0이 되었다.
  //
  // 기둥과의 구분은 종횡비로 한다. 빔은 가로로 길고(w > h), 기둥은 세로로
  // 길다(h >> w). 실측에서 기둥은 0.05sp × 5.23sp 였으므로 명확히 갈린다.
  const beams = rects.filter(r => {
    const cy = r.y + r.h / 2;
    return (
      r.w > sp * 1.2 &&
      r.w > r.h * 1.5 &&
      r.h >= sp * 0.3 &&
      r.h <= sp * 2.4 &&
      cy >= yMin - sp * 4 &&
      cy <= yMax + sp * 4
    );
  });

  // 기둥: 얇은 세로 사각형 (실측 0.05sp × 5.23sp)
  const stems = rects.filter(r => {
    const cx = r.x + r.w / 2;
    return (
      r.w <= sp * 0.6 &&
      r.h > sp * 1.2 &&
      r.h > r.w * 3 &&
      cx >= musicStartX &&
      cx <= staff.x2 + sp
    );
  });

  const notes: RawNote[] = [];

  /*
   * 임시표 누적 상태.
   *
   * 서양 기보법에서 임시표는 그 음표 하나에만 적용되는 것이 아니다.
   * 같은 마디 안에서 같은 높이의 음에 계속 유효하고, 마디선을 넘으면
   * 초기화된다. 조판은 이 규칙에 기대어 임시표를 한 번만 그린다.
   *
   * accidental.pdf 실측: 1마디에 fis가 3번 나오지만 sharp 글리프는 1개뿐이었다.
   * 이 규칙 없이 글리프에만 의존하면 2·3번째 fis가 f로 읽혀 반음 낮아진다.
   * 실제로 상단 오선 정확도가 18.8%였다.
   *
   * 키는 absStep(옥타브를 포함한 온음계 계단 번호)을 쓴다. 음이름만 쓰면
   * F4에 붙은 샾이 F5까지 번지는데, 표준 규칙은 같은 옥타브에만 적용된다.
   */
  const measureOf = (x: number): number => {
    let m = 1;
    for (const bx of barlines) {
      if (x > bx + sp * 0.5) m++;
      else break;
    }
    return m;
  };

  /*
   * absStep → alter. 마디가 바뀌는 순간 비운다.
   *
   * 처음에는 마디를 키로 하는 중첩 Map으로 구현했는데, 화음(같은 x에
   * 여러 음표)을 처리하면서 같은 마디를 여러 번 오가면 상태가 남았다.
   * 왼쪽에서 오른쪽으로 훑으며 마디 전환을 감지해 비우는 방식이 단순하고
   * 조판 순서와도 일치한다.
   */
  const state = new Map<number, number>();
  let curMeasure = -1;

  // 왼쪽에서 오른쪽으로 처리해야 누적이 성립한다
  const ordered = [...heads].sort((a, b) => a.x - b.x || b.y - a.y);

  for (const h of ordered) {
    const measure = measureOf(h.x);
    if (measure !== curMeasure) {
      state.clear();
      curMeasure = measure;
    }

    // 이 음표의 온음계 위치를 먼저 구한다 (임시표와 무관하게 결정된다)
    const { step } = yToMidi(h.y, staff, null);

    /*
     * 임시표 매칭.
     *
     * find가 아니라 filter + 최근접으로 고른다. 같은 높이에 임시표가
     * 여러 개 있을 수 있고(이전 마디의 것 등), 그중 이 음표에 붙은 것은
     * 가장 가까운 것이다. 또한 같은 마디 안의 것만 인정한다.
     */
    const own = accs
      .filter(
        a =>
          Math.abs(a.y - h.y) < sp / 3 &&
          a.x < h.x &&
          h.x - a.x < sp * 2.6 &&
          measureOf(a.x) === measure
      )
      .sort((a, b) => b.x - a.x)[0];

    let accAlter: number | null;
    if (own) {
      // 표기된 임시표: 적용하고 이 마디의 상태로 기억한다
      accAlter = (own.kind as { alter: number }).alter ?? 0;
      state.set(step, accAlter);
    } else if (state.has(step)) {
      // 앞서 같은 마디·같은 높이에 표기된 임시표가 지속된다
      accAlter = state.get(step)!;
    } else {
      // 표기도 누적도 없으면 조표를 따른다
      accAlter = null;
    }

    const { midi, name } = yToMidi(h.y, staff, accAlter);

    // 부점: 같은 높이(±spacing/2), 오른쪽 spacing*2 이내
    const dotCount = dots.filter(
      d => Math.abs(d.y - h.y) < sp * 0.7 && d.x > h.x && d.x - h.x < sp * 2.2
    ).length;

    const baseDuration = (h.kind as { duration: number }).duration;

    // 기둥 찾기: 음표머리 좌우 끝에 붙는다
    const stem = stems.find(s => {
      const cx = s.x + s.w / 2;
      const nearX = Math.abs(cx - h.x) < sp * 1.4;
      if (!nearX) return false;
      // 기둥은 머리에서 위 또는 아래로 뻗는다
      return h.y >= s.y - sp * 0.8 && h.y <= s.y + s.h + sp * 0.8;
    });

    // 꼬리 개수
    let flagCount = 0;
    if (stem) {
      const stemTop = stem.y + stem.h;
      const stemBottom = stem.y;
      const cx = stem.x + stem.w / 2;
      const f = flags.find(
        g =>
          Math.abs(g.x - cx) < sp * 1.6 &&
          (Math.abs(g.y - stemTop) < sp * 1.6 || Math.abs(g.y - stemBottom) < sp * 1.6)
      );
      if (f) flagCount = (f.kind as { count: number }).count;

      // 꼬리가 없으면 빔을 센다 (빔으로 이어진 음표는 꼬리를 그리지 않는다)
      if (flagCount === 0) {
        // 빔은 기울어질 수 있으므로, 기둥 X에서의 빔 Y를 선형 보간으로 추정한다.
        // box 상하 어느 쪽이 이 기둥에 걸리는지 알 수 없어 범위로 판정한다.
        const overlapping = beams.filter(b => {
          const withinX = cx >= b.x - sp * 0.4 && cx <= b.x + b.w + sp * 0.4;
          if (!withinX) return false;
          // 빔 box가 기둥 끝을 포함하는지 확인 (기울기 허용)
          const pad = sp * 0.8;
          const bTop = b.y + b.h + pad;
          const bBot = b.y - pad;
          return (
            (stemTop <= bTop && stemTop >= bBot) || (stemBottom <= bTop && stemBottom >= bBot)
          );
        });
        // 같은 위치에 겹친 빔의 개수가 곧 분할 수준이다 (1개=8분, 2개=16분).
        // 다만 서로 다른 그룹의 빔이 X범위만 겹칠 수 있으므로 Y로 한 번 더 묶는다.
        if (overlapping.length > 0) {
          const ys = overlapping.map(b => b.y + b.h / 2).sort((a, b) => a - b);
          let layers = 1;
          for (let k = 1; k < ys.length; k++) {
            if (ys[k] - ys[k - 1] > sp * 0.35) layers++;
          }
          flagCount = layers;
        }
      }
    }

    // 음길이 확정
    let duration = baseDuration;
    if (baseDuration === 1 && flagCount > 0) {
      duration = 1 / Math.pow(2, flagCount);
    }
    // 부점 적용: 점 1개=1.5배, 2개=1.75배
    for (let d = 0; d < dotCount; d++) {
      duration *= 1 + 1 / Math.pow(2, d + 1);
    }

    notes.push({
      x: h.x,
      y: h.y,
      midi,
      baseDuration,
      dots: dotCount,
      flags: flagCount,
      staffIdx,
      measure,
      duration,
      name,
    });
  }

  notes.sort((a, b) => a.x - b.x || b.y - a.y);
  return notes;
}

/**
 * 음악이 시작되는 X좌표를 찾는다.
 * 음자리표·조표·박자표를 음표로 오인하지 않기 위해 필요하다.
 */
function findMusicStartX(staff: Staff, glyphs: Glyph[], barlines: number[]): number {
  const sp = staff.spacing;
  let x = staff.x1;

  const inStaffZone = (g: Glyph) =>
    g.y >= staff.bottomY - sp * 3 && g.y <= staff.topY + sp * 3;

  // 음자리표 오른쪽 끝
  const clefs = glyphs.filter(g => g.kind?.type === "clef" && inStaffZone(g) && g.x < staff.x1 + (staff.x2 - staff.x1) * 0.25);
  for (const c of clefs) x = Math.max(x, c.x + sp * 2.2);

  /*
   * 조표 오른쪽 끝.
   *
   * 함정: "음자리표 직후 구간의 accidental은 조표"라고 단순 가정하면,
   * 첫 마디 첫 음표에 붙은 임시표를 조표로 오인한다. accidental.pdf에서
   * 실제로 이 일이 벌어졌다. sharp(x=110.7)가 조표로 판정되어
   * musicStartX가 118.67로 밀렸고, 첫 음표머리(x=117.9)가 잘려나가
   * 상단 오선 음표가 16개 중 15개만 검출됐다. 배열이 한 칸 밀리면서
   * 이후 모든 음이 어긋났다.
   *
   * 구분 기준: 조표의 임시표는 오른쪽에 바로 붙는 음표머리가 없다.
   * 임시표는 반드시 자기 음표를 오른쪽에 데리고 있다. 따라서
   * "오른쪽 2.6sp 안에 같은 높이의 음표머리가 있으면 조표가 아니다".
   */
  const heads = glyphs.filter(g => g.kind?.type === "notehead" && inStaffZone(g));
  const isKeySignature = (a: Glyph) =>
    !heads.some(h => h.x > a.x && h.x - a.x < sp * 2.6 && Math.abs(h.y - a.y) < sp / 3);

  const keyAccs = glyphs.filter(
    g =>
      g.kind?.type === "accidental" &&
      inStaffZone(g) &&
      g.x < x + sp * 6 &&
      isKeySignature(g)
  );
  for (const a of keyAccs) x = Math.max(x, a.x + sp * 1.6);

  // 박자표 오른쪽 끝
  const ts = glyphs.filter(g => g.kind?.type === "timesig" && inStaffZone(g));
  for (const t of ts) x = Math.max(x, t.x + sp * 3);

  return x;
}

/**
 * 음표를 마디 내 박 위치(beat)로 변환한다.
 *
 * 여기서 화음(동일 X에 여러 음표)을 하나의 "시각 이벤트"로 묶는다.
 * 화음 내 음표들은 같은 b(시작 위치)를 갖는다.
 */
export type TimedEvent = {
  measure: number;
  /** 마디 내 시작 위치. 4분음표 = 1.0 */
  beat: number;
  /** 음길이 */
  duration: number;
  /** 이 시점에 울리는 음들 (Y 내림차순 = 높은음부터) */
  notes: RawNote[];
  /** 원본 X (진단용) */
  x: number;
};

/**
 * 같은 X에 있는 음표를 묶고, 마디 내 박 위치를 계산한다.
 *
 * 박 위치는 각 이벤트의 음길이를 누적해서 구한다. 이것이 신뢰할 수 있는
 * 이유는 악보가 시간 순서대로 왼쪽에서 오른쪽으로 배치되기 때문이다.
 * X좌표 비례로 계산하면 조판 여백 때문에 틀린다.
 */
export function toTimedEvents(notes: RawNote[], spacing: number): TimedEvent[] {
  if (notes.length === 0) return [];

  // X로 묶기 (화음 판정 허용 오차)
  const xTol = spacing * 0.9;
  const groups: RawNote[][] = [];

  for (const n of notes) {
    const last = groups[groups.length - 1];
    if (last && n.measure === last[0].measure && Math.abs(n.x - last[0].x) <= xTol) {
      last.push(n);
    } else {
      groups.push([n]);
    }
  }

  const events: TimedEvent[] = [];
  let currentMeasure = -1;
  let beat = 0;

  for (const g of groups) {
    if (g[0].measure !== currentMeasure) {
      currentMeasure = g[0].measure;
      beat = 0;
    }
    // 화음 내 음길이가 다르면 가장 짧은 것을 채택한다.
    // 긴 것을 채택하면 다음 음이 밀려 전체 타이밍이 깨진다.
    const dur = Math.min(...g.map(n => n.duration));
    g.sort((a, b) => b.y - a.y);

    events.push({
      measure: currentMeasure,
      beat,
      duration: dur,
      notes: g,
      x: g[0].x,
    });
    beat += dur;
  }

  return events;
}
