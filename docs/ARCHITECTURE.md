# ARCHITECTURE — 시스템 설계

## 1. 전체 구성

```
                         ┌─────────────────────────────┐
   브라우저 ─────────────▶│  Cloudflare                 │
                         │  DNS · CDN · WAF            │
                         └──────────┬──────────────────┘
                                    │
                    ┌───────────────┴────────────────┐
                    │           Railway              │
                    │                                │
                    │  ┌──────────────────────────┐  │
                    │  │ web                      │  │
                    │  │ Node 22 · Hono + tRPC    │  │
                    │  │ React 19 (Vite) 정적 제공 │  │
                    │  │ 벡터 PDF 파싱 (인라인)     │  │
                    │  └───────┬──────────────────┘  │
                    │          │                     │
                    │  ┌───────▼──────────────────┐  │
                    │  │ Postgres                 │  │
                    │  │ Drizzle · pg-boss(큐)    │  │
                    │  └───────┬──────────────────┘  │
                    │          │ 작업 폴링             │
                    │  ┌───────▼──────────────────┐  │
                    │  │ omr-worker               │  │
                    │  │ Node 22 + JVM 21         │  │
                    │  │ Audiveris 5.9.0          │  │
                    │  │ Tesseract 5 (kor+eng)    │  │
                    │  └──────────────────────────┘  │
                    └────────────────┬───────────────┘
                                     │ S3 API
                          ┌──────────▼──────────┐
                          │  Cloudflare R2      │
                          │  원본 · 페이지 이미지  │
                          └─────────────────────┘
```

### 1.1 서비스가 셋인 이유

| 서비스 | 성격 | 왜 분리하는가 |
|---|---|---|
| web | 요청·응답, 밀리초 단위 | 워커의 무거운 작업에 막히면 안 된다 |
| omr-worker | 배치, 100초 단위, JVM 필요 | 자원 요구가 완전히 다르다. 독립 확장 |
| Postgres | 상태 | — |

**Cloudflare Workers를 앱 본체로 쓰지 않는 이유** — Audiveris가 JVM과 파일시스템, 수십 초 실행을 요구한다. Workers 실행 모델에 맞지 않는다. 경로를 둘로 나누면 운영이 복잡해지므로 한 플랫폼에 둔다.

**omr-worker를 분리하는 두 번째 이유** — Audiveris는 AGPL-3.0이다. 별도 프로세스로 격리하고 CLI로만 호출하면, 라이선스 판단이 어느 쪽으로 나든 영향 범위가 그 컨테이너 하나에 그친다. `docs/decisions/001-omr-engine.md` 참조.

---

## 2. 기술 선택

| 계층 | 선택 | 버전 | 대안을 쓰지 않는 이유 |
|---|---|---|---|
| 런타임 | Node | 22 LTS | — |
| 서버 프레임워크 | Hono | 4.x | Express보다 가볍고 타입이 낫다 |
| API | tRPC | 11.x | 클라이언트·서버 타입 공유. 이전 버전에서도 사용 |
| 클라이언트 | React + Vite | 19 / 7 | — |
| 스타일 | Tailwind | 4.x | 시안의 CSS 변수를 토큰으로 매핑 |
| DB | Postgres | 16 | JSONB로 인식 결과를 통째 저장. MySQL도 가능하나 이점이 적다 |
| ORM | Drizzle | 최신 | 이전 버전에서 사용. 마이그레이션 도구 포함 |
| 작업 큐 | pg-boss | 10.x | Postgres 기반. Redis를 따로 띄우지 않는다 |
| 객체 저장 | Cloudflare R2 | — | 이그레스 무료. 악보 이미지는 반복 조회가 많다 |
| R2 접근 | @aws-sdk/client-s3 | 3.x | R2가 S3 API 호환 |
| PDF 파싱 | pdfjs-dist | **4.10.38 고정** | 5.x에서 API가 바뀌어 동작하지 않는다. 3장 참조 |
| 이미지 OMR | Audiveris | 5.9.0 | `docs/OMR.md` 3장 |
| OCR | Tesseract | 5.x + **레거시 traineddata** | 3.4절 참조 |
| 오디오 | Tone.js | 15.x | Web Audio 위 Sampler |
| 악보 렌더 | pdfjs-dist (벡터) / `<img>` (스캔) | — | 원본을 그대로 보여준다 |
| 테스트 | Vitest | 최신 | 이전 버전에서 사용 |

### 2.1 pdfjs 버전 고정

이전 버전은 `pdfjs-dist@4.10.38`을 씁니다. 검증 중 5.x로 올렸더니 두 가지가 깨졌습니다.

1. `doc.destroy()`가 사라졌다 — `TypeError: doc.destroy is not a function`
2. 선 그리기 연산자가 다르게 노출되어 `hLines`가 0개로 나온다 → "벡터 PDF가 아닙니다"로 오판

**package.json에 정확한 버전으로 고정하고 `^`를 쓰지 마십시오.** 올릴 때는 `packages/omr-vector/fixtures/`의 회귀 테스트를 전부 통과시킨 뒤에만 올립니다.

---

## 3. 인식 두 경로

```
업로드 파일
   │
   ├─ 파일 머리글(매직 넘버) 판별
   │     %PDF → PDF
   │     PK   → ZIP (이미지 묶음)
   │     그 외 → 단일 이미지
   │
   ├─ PDF인 경우: 글리프 수 · 수평선 수로 벡터 여부 판정
   │     글리프 10개 이상 AND 수평선 5개 이상 → 벡터
   │
   ├─[벡터 경로] web 서비스 안에서 즉시 처리 (1초 내)
   │     pdfExtract → glyphDict → staffDetect → systemGroup
   │     → noteParse → voiceSplit → ParseResult
   │
   └─[이미지 경로] 작업 큐에 등록 → omr-worker
         전처리(기울기 보정·해상도 보정·대비 정규화)
         → 품질 진단 (여기서 거부 가능)
         → Audiveris CLI → MusicXML
         → ParseResult로 변환
```

**두 경로는 같은 `ParseResult`를 만든다.** 이것이 이 설계의 핵심 규칙이다. 뒤쪽(저장·재생·화면)은 어느 경로로 왔는지 알 필요가 없다.

### 3.1 이미지 경로 전처리 규격

| 단계 | 방법 | 값 |
|---|---|---|
| 회색조 변환 | `cv2.cvtColor` | — |
| 기울기 보정 | `minAreaRect` 기반. 0.2도 미만이거나 10도 초과면 무시 | — |
| 오선 간격 측정 | 수평 형태학 열림 + 수평 투영, 인접 행 묶기, 내부 간격 중앙값 | px |
| 해상도 보정 | 추정 DPI가 300 미만이면 300/DPI 배로 확대 (INTER_CUBIC) | — |
| 대비 정규화 | CLAHE (clipLimit 2.0, tile 8×8) | — |
| 샤프닝 | 확대한 경우에만 가우시안 언샤프 (1.5, -0.5) | — |

추정 DPI = 페이지 폭 픽셀 ÷ 8.27 (A4 폭 인치).

### 3.2 품질 판정 기준

| 오선 간격(원본) | 판정 | 동작 |
|---|---|---|
| 10px 이상 | 양호 | 그대로 진행 |
| 8~9px | 경계 | 경고 후 진행 |
| 7px 이하 | 불량 | 경고 + 사용자 선택 |
| 검출 실패 | 불가 | 거부 |

**Audiveris 자체가 오선 간격 8px 미만에서 처리를 중단합니다.** 실측 로그: "With a too low interline value of 8 pixels ... try 300 DPI. This interline value is NOT RELIABLE!" 전처리 확대로 임계값을 넘길 수는 있으나 정보가 늘어나지는 않습니다. 사용자에게 사실대로 알리는 것이 옳습니다.

### 3.3 Audiveris 호출 규격

```bash
TESSDATA_PREFIX=/opt/tessdata \
/opt/audiveris/bin/Audiveris \
  -batch -transcribe -export \
  -constant org.audiveris.omr.text.Language.defaultSpecification=kor+eng \
  -output <출력디렉터리> \
  <전처리된PNG>
```

산출물은 `<파일명>.mxl` (압축 MusicXML)입니다. 자원 요구는 CPU 1코어 · 메모리 4GB로 충분하며, 쪽당 약 100초 걸립니다.

### 3.4 Tesseract 언어 데이터 (중요)

**`apt install tesseract-ocr-kor`로 설치되는 언어팩은 쓸 수 없습니다.** LSTM 전용이라 Audiveris가 요구하는 레거시 엔진 구성 요소가 없습니다. 실제 오류:

```
Error: Tesseract (legacy) engine requested, but components are not present
       in .../kor.traineddata!!
Failed loading language 'kor'
```

**레거시 포함 버전을 내려받아야 합니다.**

```
https://github.com/tesseract-ocr/tessdata/raw/main/kor.traineddata   (약 15MB)
https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata   (약 23MB)
```

`tessdata_best`나 `tessdata_fast`가 아니라 **`tessdata` 본체**여야 합니다. 파일 크기로 확인할 수 있습니다. apt 버전 kor은 약 1.7MB, 올바른 것은 약 15MB입니다.

### 3.5 omr-worker Dockerfile 요지

```dockerfile
FROM node:22-bookworm

# JVM
RUN apt-get update && apt-get install -y --no-install-recommends \
      openjdk-21-jre-headless tesseract-ocr libtesseract5 \
      python3 python3-opencv poppler-utils curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Audiveris (postinst 스크립트가 실패하지만 본체는 정상 설치된다)
RUN curl -sL -o /tmp/audiveris.deb \
      https://github.com/Audiveris/audiveris/releases/download/5.9.0/Audiveris-5.9.0-ubuntu24.04-x86_64.deb \
    && (dpkg -i /tmp/audiveris.deb || true) \
    && rm /tmp/audiveris.deb

# 레거시 포함 언어 데이터
RUN mkdir -p /opt/tessdata \
    && curl -sL -o /opt/tessdata/kor.traineddata \
       https://github.com/tesseract-ocr/tessdata/raw/main/kor.traineddata \
    && curl -sL -o /opt/tessdata/eng.traineddata \
       https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata
ENV TESSDATA_PREFIX=/opt/tessdata
```

`dpkg -i ... || true`가 필요한 이유: 배포판의 후처리 스크립트가 종료 코드 3으로 실패하지만 `/opt/audiveris/bin/Audiveris`는 정상 배치됩니다. 실측으로 확인했습니다.

---

## 4. 데이터 모델

### 4.1 공통 타입

```ts
type Part = "Soprano" | "Alto" | "Tenor" | "Bass";

type LayoutType =
  | "closed-2staff"   // 2단 축소악보 (S+A / T+B)
  | "open-4staff"     // 4단 개방악보
  | "mixed-3staff"    // 3단 혼합
  | "single"          // 단성부
  | "unknown";

/** 음표 하나. m=마디, b=마디 내 시작 박(4분음표=1.0), d=길이, p=MIDI 음높이 */
type Note = { m: number; b: number; d: number; p: number };

/** 쉼표. 재생에는 쓰이지 않지만 박 위치 계산과 검증에 필요하다 */
type Rest = { m: number; b: number; d: number };

type Severity = "info" | "warn" | "error";

type WarningCode =
  | "STAFF_COUNT_UNEXPECTED" | "VOICE_MISSING" | "DIVISI_SUSPECTED"
  | "UNISON_AMBIGUOUS" | "RANGE_VIOLATION" | "VOICE_CROSSING"
  | "MEASURE_DURATION_MISMATCH" | "TIME_SIGNATURE_GUESSED"
  | "UNKNOWN_GLYPH" | "CLEF_UNRECOGNIZED" | "REPEAT_STRUCTURE"
  | "MULTI_PAGE" | "LYRICS_UNREADABLE" | "LOW_GLYPH_COUNT"
  | "TIE_UNSUPPORTED" | "KEY_CHANGE_UNSUPPORTED"
  | "POLYRHYTHM_SUSPECTED";   // 성부마다 다른 리듬. docs/OMR.md 5.4

type Warning = {
  code: WarningCode;
  severity: Severity;
  message: string;           // 존대체 완성 문장
  measures?: number[];       // 관련 마디 (최대 20개)
  part?: Part;
  detail?: Record<string, unknown>;
  resolved?: boolean;        // 사용자가 확인했거나 교정함
};

/** 마디의 화면상 위치. 악보 뷰의 커서와 자동 스크롤에 쓴다 */
type MeasureBox = {
  page: number;      // 1부터
  measure: number;
  system: number;    // 그 쪽 안에서의 시스템 순번 (0부터)
  x: number; y: number; w: number; h: number;  // 페이지 이미지 좌표계(px)
};

type ParseResult = {
  parts: Record<Part, Note[]>;
  rests: Record<Part, Rest[]>;
  layout: LayoutType;
  keyFifths: number;                                   // -7..+7
  timeSignature: { numerator: number; denominator: number };
  tempoBpm: number | null;                             // 악보에 적힌 값
  measureCount: number;
  lyrics: { m: number; b: number; text: string }[];
  measureBoxes: MeasureBox[];
  warnings: Warning[];
  confidence: number;                                  // 0..100
  source: "vector" | "image";
  elapsedMs: number;
  pageCount: number;
};
```

**이전 버전에서 바뀐 점 4가지** — 새로 만들 때 반드시 반영하십시오.

| 항목 | 이전 | 지금 | 이유 |
|---|---|---|---|
| `rests` | 없음 | 추가 | 쉼표를 버려 박 위치가 밀렸다. `docs/OMR.md` 5.1 |
| `measureBoxes` | 없음 | 추가 | 악보 뷰 자동 스크롤에 필수 |
| `tempoBpm` | 없음 | 추가 | 악보의 빠르기를 기본값으로 |
| `timeSignature` | 단일 | 단일 유지 | 중간 박자 변경은 1차 미지원. 경고로 알린다 |

### 4.2 데이터베이스 스키마 (Postgres)

```sql
-- 곡 한 건
CREATE TABLE songs (
  id              serial PRIMARY KEY,
  title           varchar(200) NOT NULL,
  composer        varchar(200),
  arranger        varchar(200),
  file_name       varchar(300) NOT NULL,
  file_key        varchar(500) NOT NULL,       -- R2 키 (원본)
  file_size       integer NOT NULL DEFAULT 0,
  file_kind       varchar(16) NOT NULL,        -- pdf | zip | image
  source          varchar(16) NOT NULL,        -- vector | image
  status          varchar(16) NOT NULL,        -- pending | processing | ready | failed
  page_count      integer NOT NULL DEFAULT 0,
  layout          varchar(24),
  key_fifths      integer,
  time_num        integer,
  time_den        integer,
  tempo_bpm       integer,
  measure_count   integer NOT NULL DEFAULT 0,
  confidence      integer NOT NULL DEFAULT 0,
  elapsed_ms      integer NOT NULL DEFAULT 0,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX songs_created_idx ON songs (created_at DESC);

-- 쪽별 이미지 (악보 뷰가 보여주는 실체)
CREATE TABLE song_pages (
  id          serial PRIMARY KEY,
  song_id     integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  page_no     integer NOT NULL,
  image_key   varchar(500) NOT NULL,   -- R2 키 (정규화된 PNG)
  width       integer NOT NULL,
  height      integer NOT NULL,
  UNIQUE (song_id, page_no)
);

-- 파트별 음표. 항상 파트 전체를 한 번에 읽으므로 정규화하지 않는다
CREATE TABLE song_parts (
  id          serial PRIMARY KEY,
  song_id     integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  part        varchar(10) NOT NULL,    -- Soprano | Alto | Tenor | Bass
  notes       jsonb NOT NULL,          -- Note[]
  rests       jsonb NOT NULL DEFAULT '[]',
  note_count  integer NOT NULL DEFAULT 0,
  pitch_min   integer,                 -- 음역 띠 표시용
  pitch_max   integer,
  UNIQUE (song_id, part)
);

-- 마디 좌표 (자동 스크롤·마디 클릭·마디 칩 이동)
CREATE TABLE song_measures (
  song_id     integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  measure     integer NOT NULL,
  page_no     integer NOT NULL,
  system_idx  integer NOT NULL,
  x           integer NOT NULL,
  y           integer NOT NULL,
  w           integer NOT NULL,
  h           integer NOT NULL,
  PRIMARY KEY (song_id, measure)
);

-- 가사
CREATE TABLE song_lyrics (
  song_id     integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  measure     integer NOT NULL,
  beat        numeric(6,3) NOT NULL,
  text        varchar(40) NOT NULL,
  PRIMARY KEY (song_id, measure, beat)
);

-- 경고
CREATE TABLE song_warnings (
  id          serial PRIMARY KEY,
  song_id     integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  code        varchar(40) NOT NULL,
  severity    varchar(10) NOT NULL,
  message     text NOT NULL,
  measures    jsonb,
  part        varchar(10),
  detail      jsonb,
  resolved    boolean NOT NULL DEFAULT false
);
CREATE INDEX song_warnings_song_idx ON song_warnings (song_id);

-- 교정 이력 (되돌리기용)
CREATE TABLE song_edits (
  id          serial PRIMARY KEY,
  song_id     integer NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  kind        varchar(30) NOT NULL,   -- octaveShift | voiceSwap | timeSignature | includeStaff | resolveWarning
  payload     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

**users 테이블은 만들지 않습니다.** 1차에는 회원 개념이 없습니다. 2차에서 `songs.owner_id`를 추가하는 마이그레이션으로 확장합니다. 지금부터 그 자리를 비워 두려고 nullable 컬럼을 만들지는 마십시오. 쓰지 않는 컬럼은 혼란만 부릅니다.

**연습 설정은 DB에 넣지 않습니다.** 브라우저 localStorage에 다음 형태로 둡니다.

```ts
// key: "hc:practice:<songId>"
{ part: "Alto", measure: 42, tempo: 62, mode: "focus", muted: ["Bass"] }
```

### 4.3 마디 좌표(measureBoxes) 산출

자동 스크롤의 전제 조건이며, **경로마다 방법이 다릅니다.**

| 경로 | 방법 |
|---|---|
| 벡터 | `staffDetect`가 이미 시스템과 마디선 X좌표를 안다. 그 값을 PDF 좌표계에서 렌더 이미지 좌표계로 변환한다 (렌더 배율만 곱하고 Y축을 뒤집는다) |
| 이미지 | Audiveris `.omr` 파일 안에 시스템·마디 기하가 들어 있다. 다만 파싱이 번거로우므로 1차에는 **오선 검출 결과 + 마디선 검출**로 자체 산출한다. 이미 전처리 단계에서 수평 투영으로 오선을 찾고 있으므로, 수직 투영으로 마디선을 더 찾으면 된다 |

**두 경로 모두 페이지 이미지 좌표계(px)로 통일합니다.** 클라이언트는 `song_pages.width/height`와 실제 표시 크기의 비율만 곱해 씁니다.

산출에 실패하면 마디 좌표 없이 진행하고, 자동 스크롤은 **경과 시간 비례 스크롤**로 대체합니다. 정확하지 않지만 없는 것보다 낫습니다. 이때 `MEASURE_BOX_MISSING` 경고를 남기지는 않습니다. 사용자가 할 수 있는 일이 없기 때문입니다.

---

## 5. API

tRPC 라우터로 정의합니다. 모든 프로시저는 세션 쿠키를 요구합니다(통행 암호 통과).

### 5.1 auth

| 프로시저 | 입력 | 출력 | 설명 |
|---|---|---|---|
| `auth.enter` | `{ passkey: string }` | `{ ok: true }` | 맞으면 세션 쿠키 발급 |
| `auth.check` | — | `{ ok: boolean }` | 쿠키 유효성 |

- 암호는 환경변수 `ACCESS_PASSKEY`로 둡니다. 코드에 박지 마십시오.
- 쿠키는 `HttpOnly`, `Secure`, `SameSite=Lax`, 30일.
- 값은 HMAC 서명된 토큰. 세션 저장소를 두지 않습니다.
- 같은 IP에서 3회 실패하면 10초 대기.

### 5.2 song

| 프로시저 | 입력 | 출력 |
|---|---|---|
| `song.list` | — | `SongSummary[]` |
| `song.get` | `{ id }` | `SongDetail` (ParseResult + pages + measures) |
| `song.createUploadUrl` | `{ fileName, fileSize, contentType }` | `{ uploadUrl, fileKey }` (R2 presigned PUT) |
| `song.ingest` | `{ fileKey, fileName }` | `{ songId, immediate: boolean, jobId? }` |
| `song.status` | `{ id }` | `{ status, progress, message }` |
| `song.rename` | `{ id, title }` | `{ ok }` |
| `song.delete` | `{ id }` | `{ ok }` |
| `song.applyEdit` | `{ id, edit: Edit }` | `SongDetail` |
| `song.undoEdit` | `{ id }` | `SongDetail` |

```ts
type Edit =
  | { kind: "octaveShift"; part: Part; semitones: 12 | -12 | 24 | -24 }
  | { kind: "voiceSwap"; a: Part; b: Part }
  | { kind: "timeSignature"; numerator: number; denominator: number }
  | { kind: "includeStaff"; staffIndex: number; part: Part }
  | { kind: "resolveWarning"; warningId: number };
```

### 5.3 업로드 흐름

```
클라이언트                        web                       R2         큐/워커
   │  createUploadUrl              │                        │
   ├──────────────────────────────▶│                        │
   │  { uploadUrl, fileKey }       │                        │
   ◀──────────────────────────────┤                        │
   │  PUT 파일                                              │
   ├───────────────────────────────────────────────────────▶│
   │  ingest({ fileKey })          │                        │
   ├──────────────────────────────▶│  머리글 판별 · 벡터 여부  │
   │                               │                        │
   │  (벡터) { immediate: true }    │  즉시 파싱 · 저장        │
   ◀──────────────────────────────┤                        │
   │                               │                        │
   │  (이미지) { jobId }            │  작업 등록 ─────────────────────▶│
   ◀──────────────────────────────┤                        │      전처리
   │  status 폴링 (2초 간격)         │                        │      Audiveris
   ├──────────────────────────────▶│◀─────────────────────────────────┤ 결과 저장
```

**R2 직접 업로드를 쓰는 이유** — 40MB 파일이 web 서비스를 거치지 않게 합니다. Railway 인스턴스 메모리와 대역폭을 아낍니다.

**진행 상태 폴링** — 1차에는 2초 간격 폴링으로 충분합니다. WebSocket이나 SSE를 쓰지 마십시오. 복잡도에 비해 이득이 없습니다.

---

## 6. 재생 (클라이언트)

**서버는 오디오를 만들지 않습니다.** 음표 데이터를 받아 브라우저에서 소리를 냅니다.

```ts
// 개요
const sampler = new Tone.Sampler({ urls: pianoSamples, baseUrl: "/audio/piano/" });
const channels: Record<Part, Tone.Channel> = {
  Soprano: new Tone.Channel({ pan: -0.5 }).toDestination(),
  Alto:    new Tone.Channel({ pan: -0.2 }).toDestination(),
  Tenor:   new Tone.Channel({ pan:  0.2 }).toDestination(),
  Bass:    new Tone.Channel({ pan:  0.5 }).toDestination(),
};
```

| 항목 | 규칙 |
|---|---|
| 음 예약 | `Tone.Transport`에 파트별 Part로 등록 |
| 시간 환산 | `초 = (마디시작박 + b) × (60 / bpm)` |
| 빠르기 변경 | `Tone.Transport.bpm.value` 변경. 재예약하지 않는다 |
| 파트 음량 | `channels[p].volume.value = gainToDb(v/100)` |
| 구간 반복 | `Transport.setLoopPoints` + `Transport.loop = true` |
| 현재 마디 | `Transport.seconds`를 마디 시작 시각 배열과 이진 탐색으로 대조 |

**사운드폰트** — 2MB 이하 압축본을 `apps/web/client/public/audio/piano/`에 둡니다. 옥타브마다 한 샘플씩(C1~C7, 7개)이면 충분합니다. 연습 화면 진입 시 내려받고, 진행률을 재생 버튼에 표시합니다.

**1.5차 확장 자리** — 가창 합성이 들어가면 서버가 파트별 오디오를 만들어 R2에 두고, 클라이언트는 `<audio>` 4개를 동기 재생하는 경로가 추가됩니다. 지금 만드는 재생기는 **음원 종류를 갈아 끼울 수 있게** 인터페이스를 나눠 두십시오.

```ts
interface PartPlayer {
  load(song: SongDetail): Promise<void>;
  play(): void; pause(): void; seekToMeasure(m: number): void;
  setPartGain(p: Part, v: number): void;
  setTempo(bpm: number): void;
  onMeasureChange(cb: (m: number) => void): void;
}
// v1: MidiPartPlayer   v1.5: AudioPartPlayer
```

---

## 7. 배포

### 7.1 Railway

| 서비스 | 빌드 | 자원 | 환경변수 |
|---|---|---|---|
| web | Nixpacks 또는 Dockerfile | 1 vCPU / 1GB | `DATABASE_URL`, `ACCESS_PASSKEY`, `SESSION_SECRET`, `R2_*` |
| omr-worker | Dockerfile (3.5절) | 1 vCPU / 4GB | `DATABASE_URL`, `R2_*` |
| Postgres | Railway 제공 | — | — |

`omr-worker`는 메모리 4GB가 필요합니다. 실측에서 Audiveris가 1.4GB를 썼고, 여유가 필요합니다.

### 7.2 Cloudflare

| 항목 | 설정 |
|---|---|
| DNS | Railway 도메인으로 CNAME, 프록시 켬 |
| R2 버킷 | `healing-choir` 비공개. 공개 접근 끔 |
| R2 접근 | S3 API 토큰. web과 worker가 각각 보유 |
| 캐시 | 정적 자산만. API 경로는 우회 |
| WAF | 기본 규칙 + 속도 제한 (분당 60요청) |

**R2 페이지 이미지는 서명 URL로 내려줍니다.** 유효기간 1시간. 곡 상세를 요청할 때 함께 발급합니다.

### 7.3 환경변수 목록

```
DATABASE_URL=postgres://...
ACCESS_PASSKEY=healing
SESSION_SECRET=<32바이트 랜덤>
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=healing-choir
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
PUBLIC_BASE_URL=https://...
```

`.env.example`을 저장소에 두고, 실제 값은 Railway 변수로만 관리합니다.

---

## 8. 관측과 오류 처리

| 항목 | 방법 |
|---|---|
| 로그 | 구조화 JSON. `songId`를 모든 로그에 붙인다 |
| 인식 실패 | `songs.status = failed`, `error_message`에 사용자용 존대체 문구 저장 |
| 워커 재시도 | pg-boss 재시도 2회, 지수 백오프 |
| 작업 시간 초과 | 쪽당 300초. 초과 시 실패 처리 |
| 인식 지표 | 곡마다 `elapsed_ms`, `confidence`, 경고 수를 남긴다. 나중에 엔진 개선의 근거가 된다 |

**실패 메시지는 사용자가 할 수 있는 일을 말해야 합니다.**

| 내부 원인 | 사용자에게 보이는 문구 |
|---|---|
| 벡터 판정 실패 + 이미지 경로도 실패 | "악보를 찾지 못했습니다. 악보 전체가 나오도록 다시 찍어 주세요." |
| Audiveris 오선 간격 미달 | "해상도가 낮아 읽지 못했습니다. 300DPI로 다시 스캔해 주세요." |
| 시간 초과 | "인식에 너무 오래 걸려 중단했습니다. 쪽 수를 나눠 올려 보세요." |
| 파트 0개 | "4성부를 찾지 못했습니다. 합창 악보가 맞는지 확인해 주세요." |
