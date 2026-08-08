/**
 * @healing/storage — Cloudflare R2 접근.
 *
 * web 과 omr-worker 가 함께 씁니다(`docs/ARCHITECTURE.md` 7.1 — 둘 다 R2_* 를
 * 환경변수로 받습니다). 그래서 앱이 아니라 패키지에 둡니다.
 *
 * `scripts/r2-smoke.ts` 가 P0 에서 이 흐름을 이미 검증했습니다.
 * 그 스크립트는 진단용으로 남기고, 서비스 코드는 이 모듈을 씁니다.
 *
 * **R2 는 S3 API 호환입니다.** 리전 개념이 없어 `region: "auto"` 로 고정합니다.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * 서명 URL 유효기간.
 *
 * **한 곳에서만 정합니다.** 값을 여기저기 적으면 조정할 때 빠뜨립니다.
 *
 * GET 이 1시간인 근거는 `docs/ARCHITECTURE.md` 7.2 입니다. 다만 P4 연습
 * 화면에서 한 곡을 오래 붙들고 있으면 그 사이 만료돼 악보가 사라질 수
 * 있습니다. 그때 조정할 자리가 여기입니다. 클라이언트가 만료를 감지해
 * 곡 상세를 다시 요청하는 방식이 근본 대응이며, P4 에서 판단합니다.
 */
export const SIGNED_URL_TTL = {
  /** 업로드용. 브라우저가 곧바로 쓰므로 짧아도 된다 */
  put: 15 * 60,
  /** 페이지 이미지 조회용 */
  get: 60 * 60,
} as const;

export type StorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

export type Storage = ReturnType<typeof createStorage>;

/** 환경변수에서 설정을 읽는다. 하나라도 비면 이유를 밝히고 던진다 */
export function storageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const keys = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "R2_ENDPOINT",
  ] as const;
  const missing = keys.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`R2 환경변수가 비어 있습니다: ${missing.join(", ")}. .env.example 참조`);
  }
  return {
    accountId: env.R2_ACCOUNT_ID!,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    bucket: env.R2_BUCKET!,
    endpoint: env.R2_ENDPOINT!,
  };
}

export function createStorage(config: StorageConfig) {
  const client = new S3Client({
    // R2 는 리전이 없다. auto 로 고정한다.
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const Bucket = config.bucket;

  return {
    /** 진단용. 자격증명과 버킷 이름이 맞는지 확인한다 */
    async ping(): Promise<void> {
      await client.send(new HeadBucketCommand({ Bucket }));
    },

    /**
     * 브라우저가 직접 올릴 서명 PUT URL.
     *
     * 40MB 파일이 web 서비스를 거치지 않게 합니다. Railway 인스턴스의
     * 메모리와 대역폭을 아낍니다. `docs/ARCHITECTURE.md` 5.3
     *
     * **버킷에 CORS 정책이 있어야 합니다.** 없으면 서명이 맞아도 브라우저가
     * 막습니다. `docs/DEPLOY.md` 1.3
     */
    async signedPutUrl(key: string, contentType: string): Promise<string> {
      return getSignedUrl(
        client,
        new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }),
        {
          expiresIn: SIGNED_URL_TTL.put,
        },
      );
    },

    /** 클라이언트가 페이지 이미지를 볼 서명 GET URL */
    async signedGetUrl(key: string): Promise<string> {
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), {
        expiresIn: SIGNED_URL_TTL.get,
      });
    },

    /** 서버·워커가 원본을 읽는다 */
    async get(key: string): Promise<Uint8Array> {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!res.Body) throw new Error(`R2 객체가 비어 있습니다: ${key}`);
      return new Uint8Array(await res.Body.transformToByteArray());
    },

    /** 서버가 만든 페이지 이미지를 올린다 */
    async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    /** 곡을 지울 때 딸린 객체도 지운다 */
    async delete(key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    destroy(): void {
      client.destroy();
    },
  };
}

/**
 * R2 키 규칙.
 *
 * 한 곳에 모아 둡니다. 곡을 지울 때 접두사로 훑어야 하는데, 키 만드는
 * 규칙이 흩어져 있으면 지우지 못하는 객체가 남습니다.
 */
export const r2Key = {
  /** 업로드 원본 */
  original: (uploadId: string, fileName: string) => `original/${uploadId}/${sanitize(fileName)}`,
  /** 쪽 이미지 (PNG) */
  page: (songId: number, pageNo: number) => `pages/${songId}/${pageNo}.png`,
  /** 곡 하나에 딸린 쪽 이미지 전체의 접두사 */
  pagePrefix: (songId: number) => `pages/${songId}/`,
};

/**
 * 키에 쓸 수 없는 글자를 정리한다.
 *
 * 한글 파일명이 흔하므로 통째로 버리지 않고 위험한 글자만 바꿉니다.
 * 원본 파일명은 DB(`songs.file_name`)에 그대로 남으므로 화면 표시에는
 * 지장이 없습니다.
 */
function sanitize(fileName: string): string {
  return (
    fileName
      .replace(/[^\p{L}\p{N}._-]/gu, "_")
      // 점이 연달아 있으면 하나로 줄인다. R2 키는 파일 경로가 아니라 ".." 이
      // 그 자체로 위험하지는 않지만, P3 워커가 이 이름으로 임시 파일을 쓴다.
      // 그때 상위 디렉터리로 새는 것을 여기서 막는다.
      .replace(/\.{2,}/g, ".")
      .replace(/^\.+/, "")
      .slice(0, 120) || "file"
  );
}
