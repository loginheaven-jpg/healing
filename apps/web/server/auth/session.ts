/**
 * 통행 암호와 세션 토큰.
 *
 * 1차에는 회원 개념이 없다. 진입 시 통행 암호를 한 번 묻고, 맞으면 서명된
 * 쿠키를 준다. 세션 저장소를 두지 않는다 — 토큰 자체가 유효기간과 서명을
 * 담으므로 서버가 기억할 것이 없다. `docs/ARCHITECTURE.md` 5.1
 *
 * TODO(v2): 접근 통제 재설계.
 *   통행 암호 하나로는 링크 유출이나 검색 노출을 막지 못한다. 암호를 아는
 *   사람이 모두 같은 서재를 본다. 상용 전환 시점에 다시 설계해야 한다.
 *   `docs/SPEC.md` 1.3
 */

import crypto from "node:crypto";

/** 쿠키 이름. 클라이언트가 직접 읽지 않는다(HttpOnly) */
export const SESSION_COOKIE = "hc_session";

/** 세션 유효기간. `docs/SPEC.md` 3.1 — 30일 */
export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;

/**
 * 두 문자열을 타이밍 안전하게 비교한다.
 *
 * `===` 는 첫 다른 글자에서 멈추므로 비교에 걸린 시간이 "앞에서 몇 글자가
 * 맞았는지"를 흘린다. 암호와 서명 둘 다 이 함수로 비교한다.
 *
 * `crypto.timingSafeEqual` 은 길이가 다르면 던지므로 길이를 먼저 본다.
 * 길이 자체는 숨기지 못하지만, 그것은 이 방식의 한계이지 결함이 아니다.
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** 통행 암호가 맞는지 */
export function verifyPasskey(input: string, expected: string): boolean {
  return safeEqual(input, expected);
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * 세션 토큰을 만든다.
 *
 * 형태는 `<만료시각>.<서명>` 이다. 사용자를 식별할 것이 없으므로 담을
 * 내용도 만료시각뿐이다. 회원이 생기면 여기에 식별자가 들어간다.
 */
export function issueToken(secret: string, now: number = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SEC;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload, secret)}`;
}

export type TokenCheck =
  { valid: true } | { valid: false; reason: "malformed" | "badSignature" | "expired" };

/**
 * 세션 토큰을 검증한다.
 *
 * 실패 이유를 나누는 것은 **로그와 시험을 위해서**다. 사용자에게는 어느
 * 경우든 똑같이 암호 화면을 보여준다 — 어느 쪽으로 틀렸는지 알려 주면
 * 공격자에게 힌트가 된다.
 */
export function verifyToken(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): TokenCheck {
  if (!token) return { valid: false, reason: "malformed" };

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { valid: false, reason: "malformed" };

  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);
  if (!/^\d+$/.test(payload)) return { valid: false, reason: "malformed" };

  // 서명을 먼저 본다. 만료 확인은 내용이 진짜일 때만 뜻이 있다.
  if (!safeEqual(given, sign(payload, secret))) return { valid: false, reason: "badSignature" };
  if (Number(payload) * 1000 <= now) return { valid: false, reason: "expired" };

  return { valid: true };
}

/** 쿠키 헤더 문자열을 만든다 */
export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SEC}`,
  ];
  // 로컬 개발은 http 라 Secure 를 붙이면 브라우저가 쿠키를 버린다.
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** 요청 헤더에서 세션 토큰을 꺼낸다 */
export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return undefined;
}
