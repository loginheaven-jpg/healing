/**
 * 인증 회귀.
 *
 * 완료 기준 — 쿠키 없이 부르면 401, 틀린 암호 3회 뒤 4회째가 10초 지연.
 * docs/tasks/P2.md 2.3
 */

import { describe, expect, it } from "vitest";
import { readEnv } from "../env.js";
import { DELAY_MS, FAIL_THRESHOLD, WINDOW_MS, createThrottle } from "./throttle.js";
import {
  SESSION_TTL_SEC,
  issueToken,
  readSessionCookie,
  safeEqual,
  sessionCookie,
  verifyPasskey,
  verifyToken,
} from "./session.js";

const SECRET = "0".repeat(64);

describe("기동 시점 환경변수 검증", () => {
  const full = {
    ACCESS_PASSKEY: "healing",
    SESSION_SECRET: "a".repeat(64),
    DATABASE_URL: "postgres://x",
  };

  it("다 있으면 읽는다", () => {
    expect(readEnv(full).accessPasskey).toBe("healing");
  });

  it("ACCESS_PASSKEY 가 비면 서버가 뜨지 않는다", () => {
    // 가장 나쁜 실패다. 빈 문자열과 비교해 아무나 들어오는 것.
    expect(() => readEnv({ ...full, ACCESS_PASSKEY: "" })).toThrow(/ACCESS_PASSKEY/);
    expect(() => readEnv({ ...full, ACCESS_PASSKEY: "   " })).toThrow(/ACCESS_PASSKEY/);
    const { ACCESS_PASSKEY: _drop, ...without } = full;
    expect(() => readEnv(without)).toThrow(/ACCESS_PASSKEY/);
  });

  it("SESSION_SECRET 이 짧으면 서버가 뜨지 않는다", () => {
    expect(() => readEnv({ ...full, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
  });

  it("빠진 변수를 이름까지 밝힌다", () => {
    // "설정이 잘못됐습니다" 로는 무엇을 고쳐야 할지 알 수 없다
    const { DATABASE_URL: _d, SESSION_SECRET: _s, ...partial } = full;
    expect(() => readEnv(partial)).toThrow(
      /SESSION_SECRET.*DATABASE_URL|DATABASE_URL.*SESSION_SECRET/,
    );
  });
});

describe("타이밍 안전 비교", () => {
  it("같으면 참, 다르면 거짓", () => {
    expect(safeEqual("healing", "healing")).toBe(true);
    expect(safeEqual("healing", "healinh")).toBe(false);
  });

  it("길이가 달라도 던지지 않는다", () => {
    // crypto.timingSafeEqual 은 길이가 다르면 던진다. 먼저 걸러야 한다.
    expect(() => safeEqual("a", "abcdef")).not.toThrow();
    expect(safeEqual("a", "abcdef")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });

  it("한글 암호도 다룬다", () => {
    // 바이트 길이로 비교하므로 멀티바이트에서 깨지면 안 된다
    expect(safeEqual("힐링콰이어", "힐링콰이어")).toBe(true);
    expect(safeEqual("힐링콰이어", "힐링콰이엉")).toBe(false);
  });
});

describe("통행 암호", () => {
  it("맞으면 통과", () => {
    expect(verifyPasskey("healing", "healing")).toBe(true);
  });
  it("틀리면 거절", () => {
    expect(verifyPasskey("Healing", "healing")).toBe(false);
    expect(verifyPasskey("", "healing")).toBe(false);
    expect(verifyPasskey("healing ", "healing")).toBe(false);
  });
});

describe("세션 토큰", () => {
  it("발급한 토큰이 통과한다", () => {
    expect(verifyToken(issueToken(SECRET), SECRET)).toEqual({ valid: true });
  });

  it("서명이 다르면 거절한다", () => {
    const token = issueToken(SECRET);
    expect(verifyToken(token, "9".repeat(64))).toEqual({ valid: false, reason: "badSignature" });
  });

  it("내용을 고치면 거절한다", () => {
    // 만료시각만 뒤로 밀어 영구 토큰을 만들려는 시도
    const token = issueToken(SECRET);
    const forged = `${Number(token.split(".")[0]) + 999999}.${token.split(".")[1]}`;
    expect(verifyToken(forged, SECRET)).toEqual({ valid: false, reason: "badSignature" });
  });

  it("만료되면 거절한다", () => {
    const past = Date.now() - (SESSION_TTL_SEC + 60) * 1000;
    expect(verifyToken(issueToken(SECRET, past), SECRET)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("형태가 어긋나면 거절한다", () => {
    for (const bad of [undefined, "", ".", "abc", "abc.def", ".sig", "12345"]) {
      expect(verifyToken(bad, SECRET).valid, `토큰 ${JSON.stringify(bad)}`).toBe(false);
    }
  });
});

describe("쿠키", () => {
  it("HttpOnly · SameSite=Lax · 30일", () => {
    const c = sessionCookie("tok", true);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
    expect(c).toContain("Secure");
  });

  it("로컬 개발에서는 Secure 를 붙이지 않는다", () => {
    // http 에서 Secure 쿠키는 브라우저가 버린다. 개발이 막힌다.
    expect(sessionCookie("tok", false)).not.toContain("Secure");
  });

  it("여러 쿠키 중에서 우리 것만 꺼낸다", () => {
    expect(readSessionCookie("a=1; hc_session=tok; b=2")).toBe("tok");
    expect(readSessionCookie("a=1; b=2")).toBeUndefined();
    expect(readSessionCookie(undefined)).toBeUndefined();
  });

  it("값에 등호가 들어 있어도 온전히 꺼낸다", () => {
    // base64url 은 = 를 쓰지 않지만, 형식이 바뀌어도 깨지지 않게 한다
    expect(readSessionCookie("hc_session=a=b=c")).toBe("a=b=c");
  });
});

describe("실패 제한", () => {
  it("3회까지는 지연이 없다", () => {
    const t = createThrottle();
    for (let i = 0; i < FAIL_THRESHOLD - 1; i++) {
      t.recordFailure("1.1.1.1");
      expect(t.delayFor("1.1.1.1")).toBe(0);
    }
  });

  it("3회 실패 뒤 4회째가 10초 지연된다", () => {
    const t = createThrottle();
    for (let i = 0; i < FAIL_THRESHOLD; i++) t.recordFailure("1.1.1.1");
    expect(t.delayFor("1.1.1.1")).toBe(DELAY_MS);
  });

  it("IP 마다 따로 센다", () => {
    const t = createThrottle();
    for (let i = 0; i < FAIL_THRESHOLD; i++) t.recordFailure("1.1.1.1");
    expect(t.delayFor("2.2.2.2")).toBe(0);
  });

  it("성공하면 기록이 지워진다", () => {
    const t = createThrottle();
    for (let i = 0; i < FAIL_THRESHOLD; i++) t.recordFailure("1.1.1.1");
    t.clear("1.1.1.1");
    expect(t.delayFor("1.1.1.1")).toBe(0);
  });

  it("시간이 지나면 잊는다", () => {
    // 공용 와이파이처럼 IP 를 나눠 쓰면 남의 실패로 내가 막힌다
    const t = createThrottle();
    const t0 = 1_000_000;
    for (let i = 0; i < FAIL_THRESHOLD; i++) t.recordFailure("1.1.1.1", t0);
    expect(t.delayFor("1.1.1.1", t0)).toBe(DELAY_MS);
    expect(t.delayFor("1.1.1.1", t0 + WINDOW_MS + 1)).toBe(0);
  });

  it("오래된 기록이 쌓이지 않는다", () => {
    const t = createThrottle();
    const t0 = 1_000_000;
    for (let i = 0; i < 50; i++) t.recordFailure(`10.0.0.${i}`, t0);
    expect(t.size()).toBe(50);
    // 창을 넘긴 뒤 새 실패가 들어오면 청소된다
    t.recordFailure("10.1.0.1", t0 + WINDOW_MS + 1);
    expect(t.size()).toBe(1);
  });
});
