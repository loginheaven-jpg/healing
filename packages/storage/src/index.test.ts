/**
 * 키 규칙과 설정 읽기 회귀.
 *
 * R2 자체와 통신하는 부분은 자격증명이 있어야 하므로 여기서 시험하지 않는다.
 * 그 흐름은 `pnpm r2:smoke` 가 실제 R2 를 상대로 검증한다(P0 완료 기준 4).
 * 여기서는 자격증명 없이도 확인할 수 있는 것만 본다.
 */

import { describe, expect, it } from "vitest";
import { SIGNED_URL_TTL, r2Key, storageConfigFromEnv } from "./index.js";

describe("R2 키 규칙", () => {
  it("쪽 이미지 키가 접두사와 맞물린다", () => {
    // 곡을 지울 때 접두사로 훑어 지운다. 어긋나면 객체가 남는다.
    const key = r2Key.page(42, 3);
    expect(key.startsWith(r2Key.pagePrefix(42))).toBe(true);
    expect(key).toBe("pages/42/3.png");
  });

  it("한글 파일명을 버리지 않는다", () => {
    const key = r2Key.original("abc", "이 세상 험하고.pdf");
    expect(key).toContain("이_세상_험하고.pdf");
  });

  it("경로 탈출 문자를 지운다", () => {
    const key = r2Key.original("abc", "../../etc/passwd");
    expect(key).not.toContain("..");
    expect(key).not.toContain("/etc/");
  });

  it("아주 긴 파일명을 자른다", () => {
    const key = r2Key.original("abc", "가".repeat(500) + ".pdf");
    expect(key.length).toBeLessThan(200);
  });
});

describe("설정 읽기", () => {
  const full = {
    R2_ACCOUNT_ID: "a",
    R2_ACCESS_KEY_ID: "b",
    R2_SECRET_ACCESS_KEY: "c",
    R2_BUCKET: "d",
    R2_ENDPOINT: "e",
  };

  it("다 있으면 읽는다", () => {
    expect(storageConfigFromEnv(full).bucket).toBe("d");
  });

  it("빈 것이 있으면 무엇이 없는지 밝히고 던진다", () => {
    // "설정이 잘못됐습니다" 같은 문구는 원인을 못 찾게 만든다
    const { R2_BUCKET: _drop, ...partial } = full;
    expect(() => storageConfigFromEnv(partial)).toThrow(/R2_BUCKET/);
  });
});

describe("서명 URL 유효기간", () => {
  it("한 곳에서만 정한다", () => {
    // 값 자체보다 "여기가 유일한 자리"라는 사실이 중요하다
    expect(SIGNED_URL_TTL.get).toBe(3600);
    expect(SIGNED_URL_TTL.put).toBeLessThan(SIGNED_URL_TTL.get);
  });
});
