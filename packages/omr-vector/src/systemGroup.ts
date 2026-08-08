/**
 * 3단계: 오선을 "시스템"(악보 한 줄) 단위로 묶는다.
 *
 * 실측에서 4단 개방악보 1페이지가 오선 8개로 나왔다. 이는 4단 악보가
 * 두 줄(system)에 걸쳐 있다는 뜻이다. 오선 개수만 보고 "8단 악보"라고
 * 판단하면 완전히 틀린다.
 *
 * 시스템 경계 판정 근거:
 *   1) 같은 시스템 안의 오선은 세로 간격이 좁고 균일하다
 *   2) 시스템이 바뀌면 간격이 뚜렷하게 벌어진다
 *   3) 시스템 시작점의 X좌표가 다르다 (첫 줄은 들여쓰기, 이후는 왼쪽 정렬)
 *   4) 보표 묶음 표시(brace)나 좌측 세로 연결선이 시스템 범위를 알려준다
 */

import type { Line, Staff } from "./types.js";

export type StaffSystem = {
  /** 이 시스템에 속한 오선들. 위에서 아래 순서 */
  staves: Staff[];
  /** 시스템 좌우 범위 */
  x1: number;
  x2: number;
};

/**
 * 오선 목록을 시스템으로 묶는다.
 * 입력은 Y 내림차순(위에서 아래)으로 정렬되어 있다고 가정한다.
 */
export function groupIntoSystems(staves: Staff[], vLines: Line[]): StaffSystem[] {
  if (staves.length === 0) return [];
  if (staves.length === 1) {
    return [{ staves, x1: staves[0].x1, x2: staves[0].x2 }];
  }

  // 인접 오선 사이의 간격(아래 오선 top ~ 위 오선 bottom)
  const gaps: number[] = [];
  for (let i = 0; i < staves.length - 1; i++) {
    gaps.push(staves[i].bottomY - staves[i + 1].topY);
  }

  // 좌측 세로 연결선으로 시스템 범위를 먼저 시도한다.
  // 시스템 시작 부분의 세로선은 그 시스템의 모든 오선을 관통한다.
  const bracketGroups = groupByLeftBracket(staves, vLines);
  if (bracketGroups) return bracketGroups;

  // 연결선이 없으면 간격 분포로 판정한다.
  // 시스템 내 간격들의 중앙값보다 크게 벌어지는 지점을 경계로 본다.
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(median * 1.8, median + staves[0].spacing * 4);

  const systems: StaffSystem[] = [];
  let current: Staff[] = [staves[0]];

  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i] > threshold) {
      systems.push(makeSystem(current));
      current = [staves[i + 1]];
    } else {
      current.push(staves[i + 1]);
    }
  }
  systems.push(makeSystem(current));

  return systems;
}

function makeSystem(staves: Staff[]): StaffSystem {
  return {
    staves,
    x1: Math.min(...staves.map((s) => s.x1)),
    x2: Math.max(...staves.map((s) => s.x2)),
  };
}

/**
 * 시스템 좌측의 세로 연결선을 찾아 오선을 묶는다.
 *
 * 이 방법이 간격 기반보다 신뢰도가 높다. 악보 조판 규칙상 시스템 시작
 * 부분에는 반드시 오선들을 잇는 세로선이 있기 때문이다.
 * 다만 단성부 악보에는 없으므로 실패 시 null을 반환한다.
 *
 * 주의: 시스템마다 좌측 X가 다르다. 실측에서 첫 줄은 x=71(제목/파트명 들여쓰기),
 * 둘째 줄은 x=28.6이었다. 따라서 "페이지 전체의 최소 X" 하나만 기준으로 삼으면
 * 첫 줄의 연결선을 놓친다. 각 오선의 자기 x1을 기준으로 판정해야 한다.
 */
function groupByLeftBracket(staves: Staff[], vLines: Line[]): StaffSystem[] | null {
  const spacing = staves[0].spacing;

  // 어떤 오선이든 그 오선의 좌측 끝 근처에 있는 긴 세로선을 후보로 삼는다.
  const connectors = vLines
    .filter((l) => {
      const x = (l.x1 + l.x2) / 2;
      const len = Math.abs(l.y2 - l.y1);
      if (len <= spacing * 5) return false;
      // 오선 1개 높이(spacing*4)보다 확실히 길어야 여러 오선을 잇는 선이다.
      // 세로선의 X가 어느 오선의 좌측 끝과 가까운지 확인한다.
      return staves.some((s) => Math.abs(x - s.x1) < spacing * 4);
    })
    .map((l) => ({
      top: Math.max(l.y1, l.y2),
      bottom: Math.min(l.y1, l.y2),
    }))
    .sort((a, b) => b.top - a.top);

  if (connectors.length === 0) return null;

  // 겹치는 연결선 병합 (brace와 세로 연결선이 이중으로 그려지는 경우가 많다)
  const merged: { top: number; bottom: number }[] = [];
  for (const c of connectors) {
    const last = merged[merged.length - 1];
    // 두 범위가 겹치거나 매우 인접하면 같은 시스템의 연결선으로 본다
    if (last && c.top >= last.bottom - spacing * 0.5) {
      last.bottom = Math.min(last.bottom, c.bottom);
      last.top = Math.max(last.top, c.top);
    } else {
      merged.push({ ...c });
    }
  }

  const systems: StaffSystem[] = [];
  const used = new Set<number>();

  for (const range of merged) {
    const group: Staff[] = [];
    staves.forEach((s, i) => {
      if (used.has(i)) return;
      const mid = (s.topY + s.bottomY) / 2;
      if (mid <= range.top + spacing && mid >= range.bottom - spacing) {
        group.push(s);
        used.add(i);
      }
    });
    if (group.length > 0) systems.push(makeSystem(group));
  }

  // 연결선에 속하지 않은 오선이 있으면 이 방법은 신뢰할 수 없다
  if (used.size !== staves.length) return null;
  // 시스템마다 오선 개수가 다르면 조판 구조를 잘못 읽은 것이다.
  // (마지막 시스템만 짧은 경우는 정상이나, 그런 악보는 간격 기반으로 넘긴다)
  const counts = new Set(systems.map((s) => s.staves.length));
  if (counts.size > 1) return null;
  // 시스템이 1개뿐이면 연결선 기반 판정이 의미가 없다.
  // 실제로 한 줄짜리 악보일 수도 있으므로 오선 수로 재확인한다.
  if (systems.length === 1 && staves.length > 4) return null;

  return systems;
}

/**
 * 조표를 읽는다.
 *
 * 조표는 음자리표 바로 뒤에 sharp 또는 flat 글리프가 나열된 형태다.
 * 개수만 세면 조를 알 수 있다 (sharp 2개 = D장조, flat 1개 = F장조).
 * 어떤 음에 붙는지는 조표 순서가 고정이므로 개수로 결정된다.
 */
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

export function readKeySignature(
  staff: Staff,
  glyphs: { kind: { type: string; alter?: number } | null; x: number; y: number }[],
): { fifths: number; alters: Record<string, number> } {
  // 음자리표 뒤 ~ 오선 폭의 25% 이내 구간
  const zoneEnd = staff.x1 + (staff.x2 - staff.x1) * 0.25;

  /*
   * 조표와 임시표를 구분해야 한다.
   *
   * 위치만으로는 구분할 수 없다. 첫 마디 첫 음표의 임시표는 조표 구간
   * 안에 놓인다. accidental.pdf(다장조, 조표 없음)에서 1마디 첫 음표의
   * sharp가 조표로 오인되어 fifths=1(사장조)로 읽혔고, 그 결과 모든
   * F가 F#으로 계산되어 2마디 F(정답 77)가 78이 되었다.
   *
   * 구분 기준: 조표의 임시표는 오른쪽에 자기 음표를 데리고 있지 않다.
   * 임시표는 반드시 자기 음표 바로 왼쪽에 붙는다.
   */
  const heads = glyphs.filter(
    (g) =>
      g.kind?.type === "notehead" &&
      g.y >= staff.bottomY - staff.spacing * 4 &&
      g.y <= staff.topY + staff.spacing * 4,
  );
  const hasOwnNote = (a: { x: number; y: number }) =>
    heads.some(
      (h) =>
        h.x > a.x && h.x - a.x < staff.spacing * 2.6 && Math.abs(h.y - a.y) < staff.spacing / 3,
    );

  const accs = glyphs.filter(
    (g) =>
      g.kind?.type === "accidental" &&
      g.x >= staff.x1 &&
      g.x <= zoneEnd &&
      g.y >= staff.bottomY - staff.spacing * 2 &&
      g.y <= staff.topY + staff.spacing * 2 &&
      !hasOwnNote(g),
  );

  let sharps = 0;
  let flats = 0;
  for (const a of accs) {
    const alter = (a.kind as { alter?: number }).alter ?? 0;
    if (alter > 0) sharps++;
    else if (alter < 0) flats++;
  }

  const fifths = sharps > 0 ? sharps : flats > 0 ? -flats : 0;
  const alters: Record<string, number> = {};

  if (fifths > 0) {
    for (let i = 0; i < Math.min(fifths, 7); i++) alters[SHARP_ORDER[i]] = 1;
  } else if (fifths < 0) {
    for (let i = 0; i < Math.min(-fifths, 7); i++) alters[FLAT_ORDER[i]] = -1;
  }

  return { fifths, alters };
}

/**
 * 박자표를 읽는다.
 *
 * LilyPond는 4/4를 `timesig.C44` 같은 통합 글리프로 그리는 경우가 있어
 * 숫자를 개별로 읽을 수 없다. 이런 경우 이름에서 숫자를 파싱한다.
 * 실패하면 4/4로 가정하되 경고를 남긴다.
 */
export function readTimeSignature(
  glyphs: { name: string; kind: { type: string; digit?: number } | null; x: number; y: number }[],
  staff: Staff,
): { numerator: number; denominator: number; confident: boolean } {
  const zoneEnd = staff.x1 + (staff.x2 - staff.x1) * 0.3;
  const cands = glyphs.filter(
    (g) =>
      g.kind?.type === "timesig" &&
      g.x >= staff.x1 &&
      g.x <= zoneEnd &&
      g.y >= staff.bottomY - staff.spacing * 2 &&
      g.y <= staff.topY + staff.spacing * 2,
  );

  // 통합 글리프 이름에서 숫자 추출: timesig.C44 → 4/4
  for (const c of cands) {
    const m = c.name.match(/timesig\.C?(\d)(\d)/);
    if (m) {
      return { numerator: Number(m[1]), denominator: Number(m[2]), confident: true };
    }
    if (/timesig\.C\b/.test(c.name)) {
      return { numerator: 4, denominator: 4, confident: true };
    }
  }

  /*
   * 개별 숫자 글리프: 위가 분자, 아래가 분모.
   *
   * 오선 중앙선과 비교해 위아래를 가르면 안 된다. 글리프의 y는 글자 밑선이고,
   * LilyPond는 분자의 밑선을 정확히 중앙선에 얹는다. rest_test.pdf에서
   * 분자 "3"이 y=789, 중앙선도 789라 `y > mid`가 거짓이 되어 분자가 통째로
   * 분모 쪽으로 몰렸고, 3/4 악보가 4/4로 읽혔다.
   *
   * 두 숫자를 서로 비교해야 한다. y로 행을 묶고, 위 행이 분자다.
   * 12/8처럼 자릿수가 둘인 박자표는 한 행에 숫자가 여러 개 오므로
   * 행 안에서 x순으로 이어 붙인다.
   */
  const digits = cands
    .filter((c) => ((c.kind as { digit?: number }).digit ?? -1) >= 0)
    .map((c) => ({ d: (c.kind as { digit: number }).digit, y: c.y, x: c.x }));

  if (digits.length >= 2) {
    // 같은 행으로 볼 y 허용 오차. 분자와 분모는 오선 간격의 2배쯤 떨어진다.
    const rowTol = staff.spacing * 0.9;
    const rows: { y: number; items: { d: number; x: number }[] }[] = [];
    for (const g of [...digits].sort((a, b) => b.y - a.y)) {
      const row = rows.find((r) => Math.abs(r.y - g.y) <= rowTol);
      if (row) row.items.push({ d: g.d, x: g.x });
      else rows.push({ y: g.y, items: [{ d: g.d, x: g.x }] });
    }

    if (rows.length >= 2) {
      const join = (r: { items: { d: number; x: number }[] }) =>
        Number(
          [...r.items]
            .sort((a, b) => a.x - b.x)
            .map((i) => i.d)
            .join(""),
        );
      const num = join(rows[0]);
      const den = join(rows[1]);
      // 분모는 2의 거듭제곱이어야 한다. 손가락 번호 같은 잡음을 거르는 최소 검사.
      if (num > 0 && den > 0 && (den & (den - 1)) === 0) {
        return { numerator: num, denominator: den, confident: true };
      }
    }
  }

  return { numerator: 4, denominator: 4, confident: false };
}
