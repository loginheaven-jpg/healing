/**
 * 통행 암호 실패 제한.
 *
 * 같은 IP 에서 3회 실패하면 다음 시도를 10초 지연시킨다.
 * `docs/SPEC.md` 4.1 · `docs/ARCHITECTURE.md` 5.1
 *
 * 무차별 시도를 막는 **최소 조치**다. 완전한 방어가 아니다 — 암호가
 * `healing` 하나뿐이므로 결국 시간 문제이며, 진짜 대응은 접근 통제를
 * 다시 설계하는 것이다.
 *
 * TODO(v2): 인스턴스가 늘면 공유 저장소가 필요하다.
 *   지금은 프로세스 메모리에 센다. Railway 가 재시작하면 초기화되고,
 *   인스턴스를 늘리면 각자 따로 세므로 제한이 무의미해진다. 1차는
 *   인스턴스 하나(`apps/web/railway.json` numReplicas 1)이므로 충분하다.
 *   복제를 늘리는 시점에 Redis 나 Postgres 로 옮겨야 한다.
 */

/** 몇 번 실패하면 지연을 걸기 시작하는가 */
export const FAIL_THRESHOLD = 3;

/** 지연 시간(ms) */
export const DELAY_MS = 10_000;

/**
 * 실패 기록을 잊는 시간.
 *
 * 이것이 없으면 한 번 걸린 IP 가 영원히 지연을 받는다. 공용 와이파이처럼
 * IP 를 여럿이 나눠 쓰는 곳에서는 남의 실패로 내가 막힌다.
 */
export const WINDOW_MS = 15 * 60 * 1000;

type Entry = { fails: number; lastAt: number };

export type Throttle = {
  /** 이번 시도에 걸어야 할 지연(ms). 0이면 지연 없음 */
  delayFor(ip: string, now?: number): number;
  /** 실패를 기록한다 */
  recordFailure(ip: string, now?: number): void;
  /** 성공하면 기록을 지운다 */
  clear(ip: string): void;
  /** 시험용 — 현재 기록 수 */
  size(): number;
};

export function createThrottle(): Throttle {
  const entries = new Map<string, Entry>();

  /** 오래된 기록을 치운다. 메모리가 무한히 늘지 않게 한다 */
  const sweep = (now: number) => {
    for (const [ip, e] of entries) {
      if (now - e.lastAt > WINDOW_MS) entries.delete(ip);
    }
  };

  return {
    delayFor(ip, now = Date.now()) {
      const e = entries.get(ip);
      if (!e) return 0;
      if (now - e.lastAt > WINDOW_MS) {
        entries.delete(ip);
        return 0;
      }
      return e.fails >= FAIL_THRESHOLD ? DELAY_MS : 0;
    },

    recordFailure(ip, now = Date.now()) {
      sweep(now);
      const e = entries.get(ip);
      if (e && now - e.lastAt <= WINDOW_MS) {
        e.fails += 1;
        e.lastAt = now;
      } else {
        entries.set(ip, { fails: 1, lastAt: now });
      }
    },

    clear(ip) {
      entries.delete(ip);
    },

    size() {
      return entries.size;
    },
  };
}
