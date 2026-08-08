# @healing/schema

두 인식 경로(벡터 · 이미지)와 서버 · 클라이언트가 공유하는 자료형입니다.
정본은 `docs/ARCHITECTURE.md` 4.1절이며, 이 패키지가 그것을 코드로 옮긴 것입니다.

## 이 패키지가 지키는 규칙

**벡터 경로와 이미지 경로는 같은 `ParseResult` 를 만든다.**
뒤쪽(저장 · 재생 · 화면)은 어느 경로로 왔는지 알 필요가 없습니다.

## 여기에 두는 것 / 두지 않는 것

| 두는 것                                                | 두지 않는 것                                |
| ------------------------------------------------------ | ------------------------------------------- |
| `ParseResult`, `Note`, `Rest`, `Warning`, `MeasureBox` | 경로별 중간 표현 (`Glyph`, `Staff`, `Line`) |
| 파트 · 경고 코드 · 악보 형태의 목록 상수               | DB 행 자료형 (→ `@healing/db`)              |
|                                                        | 화면 상태 (→ `apps/web/client`)             |

## 문서와 다른 점 한 가지

`WARNING_CODES` 에 **`POLYRHYTHM_SUSPECTED`** 를 추가했습니다.
`docs/ARCHITECTURE.md` 4.1절의 목록에는 빠져 있으나, 아래 세 곳이 이 코드를 요구합니다.

- `docs/OMR.md` 5.4 — "`POLYRHYTHM_SUSPECTED` 경고(warn)를 남긴다"
- `docs/OMR.md` 9장 — 알려진 한계 표
- `docs/TASKS.md` P1 완료 기준 — `closed_hard.pdf` 에서 이 경고가 발생해야 함

문서 쪽 누락으로 판단해 코드에 넣었습니다. **다르게 보신다면 알려 주십시오.**

## `packages/omr-vector` 와의 관계

현재 `omr-vector/src/types.ts` 에도 `ParseResult` 가 있습니다. P0 에서는
이식된 소스를 그대로 두라는 지시(`docs/TASKS.md` P0)에 따라 손대지 않았습니다.

**P1 에서 `omr-vector` 의 `ParseResult` 를 이 패키지의 정의로 대체합니다.**
`rests` · `measureBoxes` · `tempoBpm` 를 더하는 작업이 곧 P1 이므로, 그때 한 번에
정리하는 편이 중간 상태를 줄입니다.
