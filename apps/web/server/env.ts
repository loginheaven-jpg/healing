/**
 * 환경변수 검증.
 *
 * **기동 시점에 확인하고, 없으면 죽는다.**
 *
 * 가장 나쁜 실패는 `ACCESS_PASSKEY` 를 빠뜨렸을 때 조용히 빈 문자열과
 * 비교해 아무나 들어오는 것이다. 그런 서버는 떠 있어도 안 떠 있는 것만
 * 못하다. 빠진 변수를 이름까지 밝히고 종료한다.
 */

export type Env = {
  port: number;
  nodeEnv: string;
  accessPasskey: string;
  sessionSecret: string;
  databaseUrl: string;
  publicBaseUrl: string;
};

/** 이것이 없으면 서버가 뜨면 안 되는 변수들 */
const REQUIRED = ["ACCESS_PASSKEY", "SESSION_SECRET", "DATABASE_URL"] as const;

export function readEnv(src: NodeJS.ProcessEnv = process.env): Env {
  const missing = REQUIRED.filter((k) => !src[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `환경변수가 비어 있어 서버를 시작할 수 없습니다: ${missing.join(", ")}\n` +
        `.env.example 을 보고 채워 주십시오. ` +
        `특히 ACCESS_PASSKEY 가 비면 인증이 무력해집니다.`,
    );
  }

  /*
   * 세션 서명 키가 짧으면 HMAC 의 의미가 없다.
   * .env.example 은 32바이트 무작위 16진수(64글자)를 안내한다.
   */
  const sessionSecret = src.SESSION_SECRET!.trim();
  if (sessionSecret.length < 32) {
    throw new Error(
      `SESSION_SECRET 이 너무 짧습니다(${sessionSecret.length}글자). 32글자 이상이어야 합니다.\n` +
        `  node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`,
    );
  }

  return {
    port: Number(src.PORT ?? 8080),
    nodeEnv: src.NODE_ENV ?? "development",
    accessPasskey: src.ACCESS_PASSKEY!.trim(),
    sessionSecret,
    databaseUrl: src.DATABASE_URL!.trim(),
    publicBaseUrl: src.PUBLIC_BASE_URL?.trim() ?? "",
  };
}
