/**
 * 1단계: PDF에서 원시 기하 정보를 뽑는다.
 *
 * pdfjs의 operator list를 순회하면서 CTM(current transformation matrix)을
 * 직접 추적한다. CTM을 무시하면 좌표가 10배 틀린다 — LilyPond는 전역을
 * 0.1배로 축소한 뒤 텍스트마다 10배로 되돌리기 때문이다.
 *
 * 이 단계는 음악을 전혀 이해하지 않는다. 오직 "무엇이 어디에 있는가"만 뽑는다.
 */

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { resolveGlyph } from "./glyphDict.js";
import type { FilledRect, Glyph, Line } from "./types.js";

/** 3x2 아핀 변환 행렬 [a, b, c, d, e, f] */
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1 을 m2 로 변환 (m1 × m2) */
function mul(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

/** 점을 행렬로 변환 */
function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** 행렬의 스케일 크기 (등방 가정) */
function scaleOf(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}

export type PageGeometry = {
  width: number;
  height: number;
  glyphs: Glyph[];
  /** 수평선 (오선, 덧줄, 이음줄 일부) */
  hLines: Line[];
  /** 수직선 (마디선, 기둥) */
  vLines: Line[];
  /** 채워진 사각형 (기둥, 굵은 마디선) */
  rects: FilledRect[];
  /** 텍스트 (가사, 마디 번호, 파트 이름) */
  texts: { x: number; y: number; text: string; size: number }[];
  /** 사전에 없던 글리프 이름 */
  unknownGlyphNames: string[];
  /**
   * 문자 코드를 유니코드로 신뢰할 수 없었던 폰트 이름들.
   *
   * 비어 있지 않으면 그 PDF의 가사를 읽지 못했다는 뜻이므로, 상위 단계에서
   * 사용자에게 경고를 남긴다. 조용히 가사를 비우면 "왜 가사가 없지"라는
   * 의문만 남는다.
   */
  untrustedTextFonts: string[];
};

/** PDF가 벡터인지(글리프 기반) 판단하는 최소 글리프 수 */
const MIN_GLYPHS_FOR_VECTOR = 10;

export type ExtractResult = {
  pages: PageGeometry[];
  /** 벡터 판정 결과 */
  isVector: boolean;
  /** 판정 근거 */
  vectorReason: string;
};

export async function extractPdfGeometry(data: Uint8Array): Promise<ExtractResult> {
  const doc = await pdfjs.getDocument({
    data,
    // 이 옵션이 핵심이다. 켜지 않으면 differences 배열(글리프 이름)이 노출되지 않는다.
    fontExtraProperties: true,
    // Node 환경에서 불필요한 리소스 로딩 억제
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;

  const OPS = pdfjs.OPS;
  const pages: PageGeometry[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList();

    const geo: PageGeometry = {
      width: viewport.width,
      height: viewport.height,
      glyphs: [],
      hLines: [],
      vLines: [],
      rects: [],
      texts: [],
      unknownGlyphNames: [],
      untrustedTextFonts: [],
    };

    // 그래픽 상태
    let ctm: Matrix = IDENTITY;
    const ctmStack: Matrix[] = [];
    let lineWidth = 1;
    const lwStack: number[] = [];

    // 텍스트 상태
    let textMatrix: Matrix = IDENTITY;
    let textLineMatrix: Matrix = IDENTITY;
    let fontName = "";
    let fontSize = 0;
    let leading = 0;
    /** 현재 폰트의 글리프 이름 배열 (Differences) */
    let differences: string[] = [];
    /** 폰트가 음악 기호 폰트인지 (가사 텍스트와 구분) */
    let isMusicFont = false;
    /**
     * 현재 폰트의 문자 코드를 유니코드로 신뢰할 수 있는지.
     *
     * Identity-H 인코딩 CID 폰트에 ToUnicode CMap이 없으면 pdfjs는 CID를
     * 유니코드로 착각해 엉뚱한 글자를 준다. 실측에서 "주"(U+C8FC)가
     * "횵"(CID 54965)로 나왔다. 깨진 가사를 화면에 올리는 것은
     * 가사를 비우는 것보다 나쁘므로, 이런 폰트의 텍스트는 버린다.
     */
    let unicodeTrustworthy = true;

    // 경로 누적 (constructPath는 여러 개의 subpath를 담을 수 있다)
    let pendingPaths: { pts: number[]; op: number[] }[] = [];

    const loadFont = (name: string) => {
      try {
        const font = page.commonObjs.get(name) as {
          differences?: string[];
          name?: string;
          composite?: boolean;
          toUnicode?: { _map?: unknown[] } | null;
        };
        differences = Array.isArray(font?.differences) ? font.differences : [];
        const fname = font?.name || "";

        // ToUnicode CMap 유무 판정.
        // pdfjs는 CMap이 있으면 toUnicode._map을 채우고, 없으면
        // {firstChar, lastChar}만 남긴다.
        const hasToUnicode =
          Array.isArray(font?.toUnicode?._map) && font.toUnicode._map.length > 0;
        // 합성(CID) 폰트인데 ToUnicode가 없으면 문자 코드를 믿을 수 없다.
        // 단일바이트 폰트는 differences로 해석되므로 이 문제가 없다.
        unicodeTrustworthy = !font?.composite || hasToUnicode;
        if (!unicodeTrustworthy && !geo.untrustedTextFonts.includes(fname)) {
          geo.untrustedTextFonts.push(fname);
        }

        // 음악 폰트 판별: 알려진 악보 폰트 이름 또는 글리프 이름 패턴
        isMusicFont =
          /emmentaler|bravura|leland|maestro|opus|petaluma|gonville|feta|smufl|november|sonata|finale/i.test(
            fname
          ) ||
          differences.some(d =>
            /^(noteheads?|clefs?|rests?|accidentals?|flags?|notehead[A-Z]|gClef|fClef)/.test(d)
          );
      } catch {
        differences = [];
        isMusicFont = false;
        unicodeTrustworthy = true;
      }
    };

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i] as unknown[];

      switch (fn) {
        case OPS.save:
          ctmStack.push(ctm);
          lwStack.push(lineWidth);
          break;

        case OPS.restore:
          ctm = ctmStack.pop() ?? IDENTITY;
          lineWidth = lwStack.pop() ?? 1;
          break;

        case OPS.transform:
          ctm = mul(args as unknown as Matrix, ctm);
          break;

        case OPS.setLineWidth:
          lineWidth = args[0] as number;
          break;

        case OPS.beginText:
          textMatrix = IDENTITY;
          textLineMatrix = IDENTITY;
          break;

        case OPS.setFont: {
          fontName = args[0] as string;
          fontSize = args[1] as number;
          loadFont(fontName);
          break;
        }

        case OPS.setLeading:
          leading = args[0] as number;
          break;

        case OPS.setTextMatrix: {
          const m = args as unknown as Matrix;
          textMatrix = [...m] as Matrix;
          textLineMatrix = [...m] as Matrix;
          break;
        }

        case OPS.moveText: {
          const tx = args[0] as number;
          const ty = args[1] as number;
          textLineMatrix = mul([1, 0, 0, 1, tx, ty], textLineMatrix);
          textMatrix = [...textLineMatrix] as Matrix;
          break;
        }

        case OPS.nextLine: {
          textLineMatrix = mul([1, 0, 0, 1, 0, -leading], textLineMatrix);
          textMatrix = [...textLineMatrix] as Matrix;
          break;
        }

        case OPS.showText: {
          const items = args[0] as (
            | { originalCharCode: number; unicode: string; width: number; isSpace: boolean }
            | number
          )[];
          if (!Array.isArray(items)) break;

          for (const item of items) {
            // 숫자 항목은 커닝 조정값 (텍스트 공간 1/1000 단위)
            if (typeof item === "number") {
              const shift = (-item / 1000) * fontSize;
              textMatrix = mul([1, 0, 0, 1, shift, 0], textMatrix);
              continue;
            }
            if (item.isSpace) {
              const adv = (item.width / 1000) * fontSize;
              textMatrix = mul([1, 0, 0, 1, adv, 0], textMatrix);
              continue;
            }

            const combined = mul(textMatrix, ctm);
            const [gx, gy] = apply(combined, 0, 0);
            const renderSize = fontSize * scaleOf(ctm);

            const glyphName = differences[item.originalCharCode] ?? "";

            if (isMusicFont && glyphName) {
              const kind = resolveGlyph(glyphName);
              if (kind === null) {
                if (!geo.unknownGlyphNames.includes(glyphName)) {
                  geo.unknownGlyphNames.push(glyphName);
                }
              }
              geo.glyphs.push({
                name: glyphName,
                kind,
                x: gx,
                y: gy,
                size: renderSize,
                width: item.width,
              });
            } else if (
              !isMusicFont &&
              unicodeTrustworthy &&
              item.unicode &&
              item.unicode.charCodeAt(0) > 31
            ) {
              // 가사·마디번호·지시어
              geo.texts.push({ x: gx, y: gy, text: item.unicode, size: renderSize });
            }

            // 글리프 전진
            const adv = (item.width / 1000) * fontSize;
            textMatrix = mul([1, 0, 0, 1, adv, 0], textMatrix);
          }
          break;
        }

        case OPS.constructPath: {
          // args = [ops[], coords[], minMax[]]
          const pathOps = args[0] as number[];
          const coords = args[1] as number[];
          pendingPaths.push({ op: pathOps, pts: coords });
          break;
        }

        case OPS.stroke:
        case OPS.closeStroke: {
          const w = lineWidth * scaleOf(ctm);
          for (const p of pendingPaths) {
            emitLines(p, ctm, w, geo);
          }
          pendingPaths = [];
          break;
        }

        case OPS.fill:
        case OPS.eoFill:
        case OPS.closePath: {
          for (const p of pendingPaths) {
            emitRect(p, ctm, geo);
          }
          pendingPaths = [];
          break;
        }

        case OPS.endPath:
          pendingPaths = [];
          break;

        default:
          break;
      }
    }

    pages.push(geo);
    page.cleanup();
  }

  const totalGlyphs = pages.reduce((s, p) => s + p.glyphs.length, 0);
  const totalLines = pages.reduce((s, p) => s + p.hLines.length, 0);
  const isVector = totalGlyphs >= MIN_GLYPHS_FOR_VECTOR && totalLines >= 5;

  await doc.destroy();

  return {
    pages,
    isVector,
    vectorReason: isVector
      ? `음악 글리프 ${totalGlyphs}개, 수평선 ${totalLines}개 검출`
      : `음악 글리프 ${totalGlyphs}개(최소 ${MIN_GLYPHS_FOR_VECTOR}), 수평선 ${totalLines}개(최소 5) — 스캔 이미지로 판단`,
  };
}

/** 수평/수직 여부에 따라 hLines / vLines 에 넣는다 */
function emitLines(
  path: { op: number[]; pts: number[] },
  ctm: Matrix,
  strokeWidth: number,
  geo: PageGeometry
) {
  const { op, pts } = path;
  // pdfjs 경로 연산자: 13=moveTo, 14=lineTo, 19=rectangle, 16=curveTo …
  let idx = 0;
  let cx = 0;
  let cy = 0;

  for (const o of op) {
    if (o === 13) {
      // moveTo
      [cx, cy] = [pts[idx], pts[idx + 1]];
      idx += 2;
    } else if (o === 14) {
      // lineTo
      const nx = pts[idx];
      const ny = pts[idx + 1];
      idx += 2;
      pushLine(cx, cy, nx, ny, ctm, strokeWidth, geo);
      cx = nx;
      cy = ny;
    } else if (o === 19) {
      // rectangle (x, y, w, h) — stroke 되면 테두리이지만 얇으면 선으로 취급
      const [rx, ry, rw, rh] = [pts[idx], pts[idx + 1], pts[idx + 2], pts[idx + 3]];
      idx += 4;
      if (Math.abs(rh) < Math.abs(rw) * 0.2) {
        pushLine(rx, ry + rh / 2, rx + rw, ry + rh / 2, ctm, Math.abs(rh) * scaleOf(ctm), geo);
      } else if (Math.abs(rw) < Math.abs(rh) * 0.2) {
        pushLine(rx + rw / 2, ry, rx + rw / 2, ry + rh, ctm, Math.abs(rw) * scaleOf(ctm), geo);
      }
    } else if (o === 16) {
      idx += 6; // curveTo
    } else if (o === 17 || o === 18) {
      idx += 4; // curveTo2 / curveTo3
    }
  }
}

function pushLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ctm: Matrix,
  w: number,
  geo: PageGeometry
) {
  const [ax, ay] = apply(ctm, x1, y1);
  const [bx, by] = apply(ctm, x2, y2);
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);

  // 기울기 허용치: 완전 수평/수직이 아니어도 매우 가까우면 인정
  if (dy <= 0.6 && dx > 1) {
    geo.hLines.push({ x1: ax, y1: ay, x2: bx, y2: by, width: w });
  } else if (dx <= 0.6 && dy > 1) {
    geo.vLines.push({ x1: ax, y1: ay, x2: bx, y2: by, width: w });
  }
}

/** 채워진 사각형 추출 (기둥, 굵은 마디선, 음표 빔) */
function emitRect(path: { op: number[]; pts: number[] }, ctm: Matrix, geo: PageGeometry) {
  const { op, pts } = path;
  let idx = 0;
  const poly: [number, number][] = [];

  for (const o of op) {
    if (o === 13 || o === 14) {
      poly.push([pts[idx], pts[idx + 1]]);
      idx += 2;
    } else if (o === 19) {
      const [rx, ry, rw, rh] = [pts[idx], pts[idx + 1], pts[idx + 2], pts[idx + 3]];
      idx += 4;
      const [ax, ay] = apply(ctm, rx, ry);
      const [bx, by] = apply(ctm, rx + rw, ry + rh);
      geo.rects.push({
        x: Math.min(ax, bx),
        y: Math.min(ay, by),
        w: Math.abs(bx - ax),
        h: Math.abs(by - ay),
      });
    } else if (o === 16) {
      idx += 6;
    } else if (o === 17 || o === 18) {
      idx += 4;
    }
  }

  if (poly.length >= 3) {
    const tx = poly.map(p => apply(ctm, p[0], p[1]));
    const xs = tx.map(p => p[0]);
    const ys = tx.map(p => p[1]);
    geo.rects.push({
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    });
  }
}
