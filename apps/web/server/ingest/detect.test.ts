/**
 * 파일 머리글 판별과 ZIP 검사 회귀.
 *
 * 완료 기준 — 확장자가 `.pdf` 인 ZIP 파일이 이미지 경로로 분기한다.
 * docs/tasks/P2.md 완료 기준 8
 *
 * ZIP 픽스처를 파일로 커밋하지 않고 시험 안에서 만든다. 공격 형태를
 * 여러 가지로 바꿔 가며 넣어야 하는데, 바이너리 픽스처로는 그것을
 * 못 한다. 경로 탈출·압축 폭탄·손상된 헤더를 각각 만들어 본다.
 */

import { describe, expect, it } from "vitest";
import {
  ZIP_LIMITS,
  detectFileKind,
  inspectZip,
  isSafeEntryName,
  zipRejectMessage,
} from "./detect.js";

/* ── 시험용 ZIP 생성기 ────────────────────────────────────────
 * 압축하지 않는다(method=store). docs/TESTLOG.md 1장의 실제 파일도
 * store 였다. 중앙 디렉터리만 읽는 검사를 시험하는 것이 목적이므로
 * 압축 알고리즘은 필요 없다.
 */
type MakeEntry = { name: string; data?: Uint8Array; declaredUncompressed?: number };

function makeZip(entries: MakeEntry[], opts: { entryCountOverride?: number } = {}): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.data ?? new Uint8Array(0);
    const declared = e.declaredUncompressed ?? data.length;

    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version
    lv.setUint16(8, 0, true); // method = store
    lv.setUint32(18, data.length, true); // compressed
    lv.setUint32(22, declared, true); // uncompressed
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true); // method
    cv.setUint32(20, data.length, true); // compressed
    cv.setUint32(24, declared, true); // uncompressed
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true); // local header offset
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  const count = opts.entryCountOverride ?? entries.length;
  ev.setUint16(8, count, true);
  ev.setUint16(10, count, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + cdSize + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const l of locals) {
    out.set(l, p);
    p += l.length;
  }
  for (const c of centrals) {
    out.set(c, p);
    p += c.length;
  }
  out.set(eocd, p);
  return out;
}

/** 아주 작은 유효 JPEG (SOI + APP0 + EOI) */
const TINY_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const bytesOf = (s: string) => new TextEncoder().encode(s);

describe("파일 머리글 판별", () => {
  it("%PDF 를 PDF 로 본다", () => {
    expect(detectFileKind(bytesOf("%PDF-1.7\n...")).kind).toBe("pdf");
  });

  it("PK 를 ZIP 으로 본다", () => {
    expect(detectFileKind(makeZip([{ name: "1.jpg", data: TINY_JPEG }])).kind).toBe("zip");
  });

  it("확장자가 .pdf 라도 내용이 ZIP 이면 ZIP 이다", () => {
    // docs/TESTLOG.md 1장 — 이세상험하고4부.pdf 가 JPEG 7장이 든 ZIP 이었다
    const zip = makeZip(
      Array.from({ length: 7 }, (_, i) => ({ name: `page${i + 1}.jpg`, data: TINY_JPEG })),
    );
    expect(detectFileKind(zip).kind).toBe("zip");

    const inspected = inspectZip(zip);
    expect(inspected.ok).toBe(true);
    if (inspected.ok) expect(inspected.entries.length).toBe(7);
  });

  it("이미지 형식을 알아본다", () => {
    const cases: [Uint8Array, string][] = [
      [new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "jpeg"],
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "png"],
      [new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), "gif"],
      [new Uint8Array([0x42, 0x4d, 0x00, 0x00]), "bmp"],
      [new Uint8Array([0x49, 0x49, 0x2a, 0x00]), "tiff"],
    ];
    for (const [bytes, format] of cases) {
      const d = detectFileKind(bytes);
      expect(d.kind, format).toBe("image");
      expect(d.imageFormat, format).toBe(format);
    }
  });

  it("WebP 는 RIFF 뒤 8바이트까지 봐야 안다", () => {
    const webp = new Uint8Array(16);
    webp.set(bytesOf("RIFF"), 0);
    webp.set(bytesOf("WEBP"), 8);
    expect(detectFileKind(webp).imageFormat).toBe("webp");

    // RIFF 지만 WEBP 가 아닌 것(WAV 등)은 알아보지 못한 것으로 둔다
    const wav = new Uint8Array(16);
    wav.set(bytesOf("RIFF"), 0);
    wav.set(bytesOf("WAVE"), 8);
    expect(detectFileKind(wav).imageFormat).toBeNull();
  });

  it("알아보지 못한 바이트는 형식을 null 로 남긴다", () => {
    // 아무 바이트나 "이미지"로 넘기면 워커가 100초를 쓰고 실패한다.
    // 업로드 시점에 알 수 있어야 한다.
    const d = detectFileKind(bytesOf("hello world, this is not a score"));
    expect(d.kind).toBe("image");
    expect(d.imageFormat).toBeNull();
  });

  it("빈 파일에도 죽지 않는다", () => {
    expect(() => detectFileKind(new Uint8Array(0))).not.toThrow();
    expect(detectFileKind(new Uint8Array(0)).imageFormat).toBeNull();
  });
});

describe("ZIP 항목 이름 안전성", () => {
  it("정상 이름을 받아들인다", () => {
    for (const n of ["1.jpg", "pages/1.jpg", "이세상험하고-1.jpg", "a.b.c.png"]) {
      expect(isSafeEntryName(n), n).toBe(true);
    }
  });

  it("경로 탈출을 막는다", () => {
    const attacks = [
      "../evil.jpg",
      "../../etc/passwd",
      "a/../../b.jpg",
      "/etc/passwd",
      "\\windows\\system32",
      "C:/windows/evil.jpg",
      "c:\\evil.jpg",
      "pages\\..\\..\\evil.jpg",
      "a\0b.jpg",
      "",
      "x".repeat(300),
    ];
    for (const n of attacks) {
      expect(isSafeEntryName(n), `공격: ${JSON.stringify(n)}`).toBe(false);
    }
  });

  it("이름에 .. 이 들어가도 조각이 아니면 허용한다", () => {
    // "a..b.jpg" 는 상위로 올라가지 않는다. 과하게 막으면 정상 파일이 거절된다.
    expect(isSafeEntryName("a..b.jpg")).toBe(true);
    expect(isSafeEntryName("pages/a..b.jpg")).toBe(true);
  });
});

describe("ZIP 검사", () => {
  it("정상 묶음을 통과시킨다", () => {
    const zip = makeZip([
      { name: "1.jpg", data: TINY_JPEG },
      { name: "2.jpg", data: TINY_JPEG },
    ]);
    const r = inspectZip(zip);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entries.map((e) => e.name)).toEqual(["1.jpg", "2.jpg"]);
      expect(r.totalUncompressed).toBe(TINY_JPEG.length * 2);
    }
  });

  it("디렉터리 항목은 세지 않는다", () => {
    const zip = makeZip([{ name: "pages/" }, { name: "pages/1.jpg", data: TINY_JPEG }]);
    const r = inspectZip(zip);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entries.length).toBe(1);
  });

  it("경로 탈출이 든 묶음을 거절한다", () => {
    const zip = makeZip([{ name: "../../evil.jpg", data: TINY_JPEG }]);
    const r = inspectZip(zip);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unsafePath");
  });

  it("항목이 너무 많으면 거절한다", () => {
    const zip = makeZip(
      Array.from({ length: ZIP_LIMITS.maxEntries + 1 }, (_, i) => ({ name: `${i}.jpg` })),
    );
    const r = inspectZip(zip);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("tooManyEntries");
  });

  it("압축 폭탄을 풀지 않고 거절한다", () => {
    // 22바이트를 넣고 1GB 로 풀린다고 선언한다.
    // 푸는 순간 메모리가 터지므로 **풀기 전에** 걸러야 한다.
    const zip = makeZip([
      { name: "bomb.jpg", data: TINY_JPEG, declaredUncompressed: 1024 * 1024 * 1024 },
    ]);
    const r = inspectZip(zip);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("entryTooLarge");
  });

  it("항목마다 작아도 합이 크면 거절한다", () => {
    const per = 20 * 1024 * 1024; // 각각은 상한 이하
    const n = Math.ceil(ZIP_LIMITS.maxTotalBytes / per) + 1;
    const zip = makeZip(
      Array.from({ length: n }, (_, i) => ({ name: `${i}.jpg`, declaredUncompressed: per })),
    );
    const r = inspectZip(zip);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("totalTooLarge");
  });

  it("Zip64 는 거절한다", () => {
    const zip = makeZip([{ name: "big.jpg", declaredUncompressed: 0xffffffff }]);
    const r = inspectZip(zip);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("zip64Unsupported");
  });

  it("손상된 묶음을 거절한다", () => {
    const zip = makeZip([{ name: "1.jpg", data: TINY_JPEG }]);
    // EOCD 를 뭉갠다
    const broken = zip.slice(0, zip.length - 10);
    const r = inspectZip(broken);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["corrupt", "notZip"]).toContain(r.reason);
  });

  it("중앙 디렉터리 항목 수가 거짓이면 거절한다", () => {
    const zip = makeZip([{ name: "1.jpg", data: TINY_JPEG }], { entryCountOverride: 5 });
    const r = inspectZip(zip);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("corrupt");
  });

  it("빈 묶음을 거절한다", () => {
    const r = inspectZip(makeZip([]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("noImages");
  });

  it("ZIP 이 아니면 거절한다", () => {
    const r = inspectZip(bytesOf("%PDF-1.7"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("notZip");
  });
});

describe("거절 문구", () => {
  it("모든 이유에 문구가 있다", () => {
    const reasons = [
      "notZip",
      "corrupt",
      "zip64Unsupported",
      "tooManyEntries",
      "entryTooLarge",
      "totalTooLarge",
      "unsafePath",
      "noImages",
    ] as const;
    for (const r of reasons) {
      const msg = zipRejectMessage(r);
      expect(msg.length, r).toBeGreaterThan(0);
      // docs/SPEC.md 2장 — 존대체, 모호한 문구 금지
      expect(msg, r).not.toContain("오류가 발생");
      expect(msg, r).toMatch(/니다|세요/);
    }
  });
});
