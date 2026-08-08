# 힐링콰이어

악보를 올리면 4파트로 나눠 파트별로 들려주는, 성가대원을 위한 연습 도구입니다.

지휘자는 PC에서 악보를 올리고 인식 결과를 확인합니다.
대원은 휴대폰으로 자기 파트를 듣습니다. **이 분업이 화면 설계를 결정합니다.**

## 문서

읽는 순서대로입니다.

| 문서                                         | 내용                                     |
| -------------------------------------------- | ---------------------------------------- |
| [docs/SPEC.md](docs/SPEC.md)                 | 제품 명세 · 화면 · 문구 규칙             |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 시스템 설계 · 자료형 · API · 배포        |
| [docs/OMR.md](docs/OMR.md)                   | 악보 인식. 실측 데이터와 확인된 결함 7건 |
| [docs/TASKS.md](docs/TASKS.md)               | 작업지시서. 단계별 완료 기준             |
| [docs/DEPLOY.md](docs/DEPLOY.md)             | Railway · Cloudflare 설정 절차           |
| [docs/decisions/](docs/decisions/)           | 결정 기록 (ADR)                          |

`ui/` 는 화면 시안입니다. **빌드 대상이 아닙니다.**

## 구성

```
healing/
├── apps/
│   ├── web/              Hono + tRPC API · React 클라이언트 · 벡터 PDF 인식(인라인)
│   │   ├── server/
│   │   └── client/
│   └── omr-worker/       이미지 인식 워커. Audiveris 를 CLI 로만 호출
├── packages/
│   ├── schema/           두 인식 경로가 공통으로 만드는 자료형 (ParseResult)
│   ├── db/               Postgres 스키마 · 접속 (Drizzle)
│   └── omr-vector/       벡터 PDF 파서 + 회귀 테스트 픽스처
├── scripts/              운영 확인용 스크립트
├── docs/
└── ui/                   시안 (빌드 제외)
```

**서비스를 셋으로 나누는 이유** — web 은 밀리초 단위 요청·응답이고, omr-worker 는
JVM 이 필요한 100초 단위 배치입니다. 자원 요구가 완전히 다릅니다.
그리고 Audiveris 가 AGPL-3.0 이라 별도 프로세스로 격리합니다.
[ADR-001](docs/decisions/001-omr-engine.md) · [ADR-003](docs/decisions/003-stack.md)

## 시작하기

필요한 것: **Node 22 이상**, **pnpm 10 이상**.

```bash
pnpm install
cp .env.example .env      # 값을 채웁니다
pnpm build
pnpm test
```

개발 중에는 서버(8080)와 Vite(5173)를 함께 띄웁니다. `/api` 와 `/health` 는 Vite 가 서버로 넘깁니다.

```bash
pnpm dev
```

## 명령

| 명령             | 하는 일                        |
| ---------------- | ------------------------------ |
| `pnpm build`     | 전 패키지 빌드 (의존 순서대로) |
| `pnpm test`      | 회귀 테스트 (Vitest)           |
| `pnpm typecheck` | 타입 검사 (`tsc -b`)           |
| `pnpm lint`      | ESLint                         |
| `pnpm format`    | Prettier                       |
| `pnpm r2:smoke`  | R2 업로드 · 서명 URL 읽기 확인 |

## 손대면 안 되는 것

`packages/omr-vector/` 의 아래 세 곳은 실측으로 어렵게 얻은 코드입니다.
자세한 이유는 [docs/OMR.md](docs/OMR.md) 4장에 있습니다.

| 위치                                    | 이유                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `pdfExtract.ts` 의 CTM 추적             | LilyPond 의 0.1배 축소 문제를 푸는 코드입니다. 무시하면 좌표가 10배 틀립니다 |
| `noteParse.ts` 의 기둥/마디선 두께 판별 | 악보 조판의 보편적 관례에 기반합니다                                         |
| `voiceSplit.ts` 의 넓은 음역 정책       | 좁히면 정상 악보가 망가집니다. 주석에 사고 기록이 있습니다                   |

`pdfjs-dist` 는 **정확히 `4.10.38`** 입니다. 캐럿(`^`)을 쓰지 마십시오.
5.x 에서 `doc.destroy()` 가 사라지고 선 그리기 연산자 노출이 달라
"벡터 PDF 가 아닙니다"로 오판합니다. [docs/OMR.md](docs/OMR.md) 5.7

## 이 프로젝트의 원칙

**모든 한계는 사용자에게 알립니다.** 조용히 틀린 결과를 내는 것보다 낫습니다.
인식이 확신하지 못한 곳은 경고로 남기고, 화면에서 고칠 수 있게 합니다.

**모든 사용자 대면 문구는 존대체입니다.** 예외는 없습니다.
사과하지 않고, 무엇이 잘못됐고 어떻게 고치는지 말합니다.
[docs/SPEC.md](docs/SPEC.md) 2장

## 진행

| 단계 | 내용                                  | 상태    |
| ---- | ------------------------------------- | ------- |
| P0   | 저장소 골격 · 배포 파이프라인         | 진행 중 |
| P1   | 벡터 파서 결함 7건 수정 · 회귀 테스트 | —       |
| P2   | DB · R2 · 업로드 · 인증               | —       |
| P3   | 이미지 인식 워커                      | —       |
| P4   | 연습 화면 (모바일)                    | —       |
| P5   | 올리기 · 인식 확인 (데스크톱)         | —       |
| P6   | 다듬기 · 배포                         | —       |

## 이전 판

`loginheaven-jpg/chorus` 가 v0 입니다. 삭제하지 않고 참조용으로 남깁니다.
`packages/omr-vector/` 는 그 저장소의 `apps/web/server/omr/` 에서 옮겨 왔습니다.
[ADR-002](docs/decisions/002-new-repository.md)
