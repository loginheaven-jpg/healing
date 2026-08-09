/**
 * 파일 머리글로 실체를 판별한다.
 *
 * **확장자를 믿지 않는다.** 실제로 겪었다 — 업로드된 `이세상험하고4부.pdf`가
 * PDF 가 아니라 JPEG 7장이 든 ZIP 이었다. `docs/TESTLOG.md` 1장
 *
 * ```
 * $ file 이세상험하고4부.pdf
 * Zip archive data, at least v2.0 to extract, compression method=store
 * ```
 *
 * **여기서 벡터 여부를 판정하지 않는다.** 그것은 `parseScorePdf` 가 이미
 * 하고 `VectorParseUnavailable` 을 던진다. 기준을 두 곳에 두면 언젠가
 * 갈라진다. 여기는 "PDF 인가 ZIP 인가 이미지인가"까지만 본다.
 *
 * 이 모듈은 **순수 함수**다. DB 에 쓰지 않는다. 저장은 ingest 가 한다.
 */

export type FileKind = "pdf" | "zip" | "image";

export type Detection = {
  kind: FileKind;
  /** 이미지일 때의 세부 형식. 알아보지 못하면 null */
  imageFormat: "jpeg" | "png" | "gif" | "webp" | "bmp" | "tiff" | null;
};

const startsWith = (bytes: Uint8Array, sig: number[], at = 0): boolean =>
  sig.every((b, i) => bytes[at + i] === b);

/**
 * 머리글(매직 넘버)로 판별한다. `docs/ARCHITECTURE.md` 3장
 *
 *   %PDF → PDF
 *   PK   → ZIP (이미지 묶음)
 *   그 외 → 단일 이미지
 *
 * 이미지 형식을 함께 알아보는 이유는 **알아보지 못한 것을 알아보기 위해서**다.
 * 아무 바이트나 "이미지"로 넘기면 워커가 100초를 쓰고 실패한다.
 * 그보다 업로드 시점에 "악보를 찾지 못했습니다"라고 말하는 편이 낫다.
 */
export function detectFileKind(bytes: Uint8Array): Detection {
  // %PDF
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return { kind: "pdf", imageFormat: null };

  // PK\x03\x04 (일반) · PK\x05\x06 (빈 ZIP) · PK\x07\x08 (분할)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { kind: "zip", imageFormat: null };

  return { kind: "image", imageFormat: detectImageFormat(bytes) };
}

function detectImageFormat(b: Uint8Array): Detection["imageFormat"] {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return "gif";
  // RIFF....WEBP
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8))
    return "webp";
  if (startsWith(b, [0x42, 0x4d])) return "bmp";
  // II*\0 (리틀엔디언) · MM\0* (빅엔디언)
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a]))
    return "tiff";
  return null;
}

/* ────────────────────────────────────────────────────────────────
 * ZIP 검사
 * ──────────────────────────────────────────────────────────────── */

/**
 * ZIP 은 위험한 형식이다. 압축 폭탄과 경로 탈출을 막아야 한다.
 *
 * 상한은 악보 묶음이라는 쓰임에서 나온다. 성가 한 곡은 길어야 몇 쪽이다.
 */
export const ZIP_LIMITS = {
  /** 항목 수. 쪽 수이므로 50이면 넉넉하다 */
  maxEntries: 50,
  /** 항목 하나의 압축 해제 크기. 300DPI 스캔 한 쪽이 이보다 크기 어렵다 */
  maxEntryBytes: 30 * 1024 * 1024,
  /** 전체 압축 해제 크기 */
  maxTotalBytes: 200 * 1024 * 1024,
} as const;

export type ZipEntry = { name: string; compressedSize: number; uncompressedSize: number };

export type ZipInspection =
  | { ok: true; entries: ZipEntry[]; totalUncompressed: number }
  | { ok: false; reason: ZipRejectReason; detail?: Record<string, unknown> };

export type ZipRejectReason =
  | "notZip"
  | "corrupt"
  | "zip64Unsupported"
  | "tooManyEntries"
  | "entryTooLarge"
  | "totalTooLarge"
  | "unsafePath"
  | "noImages";

/**
 * ZIP 을 **풀지 않고** 중앙 디렉터리만 읽어 검사한다.
 *
 * 압축을 풀지 않는 것이 압축 폭탄 방어의 핵심이다. 중앙 디렉터리에는
 * 항목 이름과 압축 해제 크기가 **선언돼** 있으므로, 풀기 전에 상한을
 * 넘는지 알 수 있다.
 *
 * **선언값은 거짓일 수 있다.** 작게 적어 두고 실제로는 크게 풀리는 ZIP 을
 * 만들 수 있다. 그래서 이것은 첫 관문일 뿐이고, 실제로 푸는 P3 워커가
 * 푸는 동안에도 누적 크기를 세어 상한을 지켜야 한다.
 *
 * 라이브러리를 쓰지 않는 이유 — 필요한 것이 중앙 디렉터리 읽기뿐이고,
 * 압축 해제 라이브러리를 들이면 그 자체가 압축 폭탄의 통로가 된다.
 */
export function inspectZip(bytes: Uint8Array): ZipInspection {
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) return { ok: false, reason: "notZip" };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes);
  if (eocd < 0) return { ok: false, reason: "corrupt", detail: { at: "EOCD" } };

  const entryCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  // Zip64 는 이 값들이 0xFFFF/0xFFFFFFFF 로 넘친다. 악보 묶음에 4GB 는 없다.
  if (entryCount === 0xffff || cdOffset === 0xffffffff) {
    return { ok: false, reason: "zip64Unsupported" };
  }
  if (entryCount > ZIP_LIMITS.maxEntries) {
    return { ok: false, reason: "tooManyEntries", detail: { entryCount } };
  }

  const entries: ZipEntry[] = [];
  let total = 0;
  let p = cdOffset;

  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > bytes.length)
      return { ok: false, reason: "corrupt", detail: { at: `entry ${i}` } };
    if (view.getUint32(p, true) !== 0x02014b50) {
      return { ok: false, reason: "corrupt", detail: { at: `entry ${i} signature` } };
    }

    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);

    if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff) {
      return { ok: false, reason: "zip64Unsupported" };
    }

    const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
    const name = new TextDecoder("utf-8").decode(nameBytes);

    if (!isSafeEntryName(name)) {
      return { ok: false, reason: "unsafePath", detail: { name } };
    }
    if (uncompressedSize > ZIP_LIMITS.maxEntryBytes) {
      return { ok: false, reason: "entryTooLarge", detail: { name, uncompressedSize } };
    }

    total += uncompressedSize;
    if (total > ZIP_LIMITS.maxTotalBytes) {
      return { ok: false, reason: "totalTooLarge", detail: { total } };
    }

    // 디렉터리 항목(이름이 / 로 끝남)은 세지 않는다
    if (!name.endsWith("/")) entries.push({ name, compressedSize, uncompressedSize });
    p += 46 + nameLen + extraLen + commentLen;
  }

  if (entries.length === 0) return { ok: false, reason: "noImages" };
  return { ok: true, entries, totalUncompressed: total };
}

/**
 * 항목 이름이 안전한가.
 *
 * `packages/storage` 의 파일명 정리와 같은 태도다. 지금 위험하지 않아도
 * P3 워커가 이 이름으로 파일을 쓰는 순간 위험해진다.
 */
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false;
  // 절대 경로
  if (name.startsWith("/") || name.startsWith("\\")) return false;
  // 윈도 드라이브 (C:\...)
  if (/^[a-zA-Z]:/.test(name)) return false;
  // 역슬래시는 구분자로 쓰일 수 있으므로 통째로 막는다
  if (name.includes("\\")) return false;
  // 상위로 올라가는 조각
  if (name.split("/").some((seg) => seg === "..")) return false;
  // 널 바이트
  if (name.includes("\0")) return false;
  return true;
}

/** EOCD(End of Central Directory) 위치를 뒤에서부터 찾는다 */
function findEocd(bytes: Uint8Array): number {
  // 주석은 최대 65535바이트. EOCD 자체가 22바이트.
  const minPos = Math.max(0, bytes.length - (0xffff + 22));
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * 거절 이유를 사용자 문구로 옮긴다.
 *
 * `docs/SPEC.md` 2장 — 무엇이 잘못됐고 어떻게 고치는지 말한다.
 * "오류가 발생했습니다"는 금지다.
 */
export function zipRejectMessage(reason: ZipRejectReason): string {
  switch (reason) {
    case "notZip":
    case "corrupt":
      return "파일이 손상되어 열지 못했습니다. 다시 내보내신 뒤 올려 주세요.";
    case "zip64Unsupported":
      return "파일이 너무 큽니다. 쪽을 나눠 올려 주세요.";
    case "tooManyEntries":
      return `묶음 안의 파일이 너무 많습니다. ${ZIP_LIMITS.maxEntries}개까지 올리실 수 있습니다.`;
    case "entryTooLarge":
    case "totalTooLarge":
      return "파일이 너무 큽니다. 300DPI 회색조로 다시 스캔하시면 크기가 줄어듭니다.";
    case "unsafePath":
      return "묶음 안의 파일 이름에 쓸 수 없는 글자가 있습니다. 다시 압축해 올려 주세요.";
    case "noImages":
      return "묶음 안에 악보 이미지가 없습니다. 스캔한 그림 파일을 넣어 주세요.";
  }
}
