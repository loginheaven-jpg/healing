/**
 * R2 연결 확인.
 *
 * docs/TASKS.md P0 완료 기준:
 *   "R2 버킷에 파일을 올리고 서명 URL로 읽어 오는 스크립트가 동작한다."
 *
 * 실행:  pnpm r2:smoke
 * 필요:  .env 또는 셸 환경에 R2_* 가 채워져 있어야 합니다. (.env.example 참조)
 *
 * 하는 일 — 실제 업로드 경로와 실제 읽기 경로를 그대로 밟습니다.
 *   1. 서명 PUT URL 을 발급받아 **HTTP 로** 올린다 (클라이언트가 하는 방식 그대로)
 *   2. 서명 GET URL 을 발급받아 **HTTP 로** 내려받는다 (악보 뷰가 하는 방식 그대로)
 *   3. 올린 내용과 내려받은 내용이 같은지 확인한다
 *   4. 지운다
 *
 * SDK 로만 확인하지 않는 이유 — 서명 URL 이 실제로 통하는지가 요점입니다.
 * 자격증명이 맞아도 엔드포인트나 서명 방식이 어긋나면 SDK 호출은 되고
 * 서명 URL 은 403 이 납니다.
 */

import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_ENDPOINT",
] as const;

function readEnv(): Record<(typeof REQUIRED)[number], string> {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`환경변수가 비어 있습니다: ${missing.join(", ")}`);
    console.error(".env.example 을 보고 .env 를 채우거나 셸에 넣어 주십시오.");
    process.exit(1);
  }
  return Object.fromEntries(REQUIRED.map((k) => [k, process.env[k]!])) as Record<
    (typeof REQUIRED)[number],
    string
  >;
}

function step(n: number, msg: string) {
  console.log(`  ${n}. ${msg}`);
}

async function main() {
  const env = readEnv();

  const s3 = new S3Client({
    region: "auto", // R2 는 리전 개념이 없습니다. auto 로 고정합니다.
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  const key = `_smoke/${randomUUID()}.txt`;
  const body = `힐링콰이어 R2 확인 ${new Date().toISOString()}\n`;

  console.log(`버킷 ${env.R2_BUCKET} · 엔드포인트 ${env.R2_ENDPOINT}`);

  try {
    step(1, "버킷 접근 확인");
    await s3.send(new HeadBucketCommand({ Bucket: env.R2_BUCKET }));

    step(2, "서명 PUT URL 발급 (유효기간 5분)");
    const putUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: "text/plain" }),
      { expiresIn: 300 },
    );

    step(3, "서명 URL 로 업로드");
    const put = await fetch(putUrl, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body,
    });
    if (!put.ok) throw new Error(`업로드 실패 ${put.status} ${await put.text()}`);

    step(4, "서명 GET URL 발급 (유효기간 1시간 — 곡 상세와 같은 값)");
    const getUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
      { expiresIn: 3600 },
    );

    step(5, "서명 URL 로 내려받기");
    const got = await fetch(getUrl);
    if (!got.ok) throw new Error(`내려받기 실패 ${got.status} ${await got.text()}`);
    const back = await got.text();
    if (back !== body) {
      throw new Error(`내용이 다릅니다.\n  올린 것  : ${body.trim()}\n  받은 것  : ${back.trim()}`);
    }

    step(6, "확인용 객체 삭제");
    await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));

    console.log(`\n통과. 업로드 · 서명 URL 읽기 · 삭제가 모두 동작합니다. (키 ${key})`);
  } catch (err) {
    console.error(`\n실패: ${err instanceof Error ? err.message : String(err)}`);
    console.error("\n확인할 곳:");
    console.error("  · R2_ENDPOINT 가 https://<account>.r2.cloudflarestorage.com 형태인지");
    console.error("  · S3 API 토큰에 해당 버킷의 읽기·쓰기 권한이 있는지");
    console.error("  · R2_BUCKET 이름이 정확한지");
    process.exitCode = 1;
  } finally {
    s3.destroy();
  }
}

await main();
