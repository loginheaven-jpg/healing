# omr-vector

벡터 PDF(악보 소프트웨어 출력)를 직접 해석하는 파서입니다.

## 출처

이전 버전 `loginheaven-jpg/chorus`의 `apps/web/server/omr/`에서 옮겨 왔습니다.
플랫폼 의존이 없는 순수 모듈이라 그대로 이식했습니다.

## 그대로 쓰면 안 됩니다

실측으로 확인된 결함 7건이 있습니다. **`docs/OMR.md` 5장을 먼저 읽으십시오.**

| 결함                     | 심각도 |
| ------------------------ | ------ |
| 쉼표 누락 → 박 위치 붕괴 | 치명   |
| 박자표 미인식            | 치명   |
| 옥타브 이조 음자리표     | 중대   |
| 성부마다 다른 리듬       | 중대   |
| 붙임줄 미처리            | 중대   |
| 가사 병합 임계값         | 보통   |
| pdfjs 5.x 비호환         | 보통   |

## 건드리지 말 것

- `pdfExtract.ts`의 CTM 추적 — LilyPond의 0.1배 축소 문제를 푸는 코드입니다
- `noteParse.ts`의 기둥/마디선 두께 판별 — 조판 관례에 기반한 판별입니다
- `voiceSplit.ts`의 넓은 음역 정책 — 좁히면 정상 악보가 망가집니다. 주석에 사고 기록이 있습니다

## 회귀 테스트

`fixtures/`에 악보와 정답이 짝지어 있습니다. LilyPond 소스가 함께 있어 재생성할 수 있습니다.

```bash
lilypond -dresolution=300 --png -o out fixtures/rest_test.ly
python3 fixtures/evaluate_omr.py --gt <정답.musicxml> --pred <결과.mxl> --label "실험명"
```

**새 결함을 발견하면 반드시 픽스처를 추가하십시오.**
