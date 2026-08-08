# ADR-003. 배포 스택

- **상태**: 결정
- **결정일**: 2026-08-08

## 배경

운영자가 Cloudflare와 Railway 유료 이용자다. 워크로드는 성격이 완전히 다른 둘로 나뉜다.

## 결정

| 계층 | 선택 |
|---|---|
| 웹 앱 (API + 정적) | Railway |
| 이미지 인식 워커 | Railway 별도 서비스 |
| 데이터베이스 | Railway Postgres |
| 작업 큐 | pg-boss (Postgres 기반) |
| 객체 저장 | Cloudflare R2 |
| DNS · CDN · WAF | Cloudflare |

## 근거

**Cloudflare Workers를 앱 본체로 쓰지 않는다.** Audiveris가 JVM, 파일시스템, 수십 초 실행을 요구한다. Workers 실행 모델에 맞지 않는다. 벡터 경로만 Workers로 분리하는 안도 있으나, 경로가 둘로 갈리면 운영이 복잡해진다.

**Postgres를 고른 이유.** 인식 결과(음표 배열, 경고, 마디 좌표)를 JSONB로 통째 저장한다. 이전 버전은 MySQL이었으나 스키마를 어차피 새로 짜므로 전환 비용이 낮다.

**Redis 대신 pg-boss.** 서비스 하나를 덜 띄운다. 하루 수십 건 규모에서 Postgres 기반 큐로 충분하다. 부하가 늘면 Redis + BullMQ로 옮긴다.

**R2를 고른 이유.** 이그레스가 무료다. 악보 페이지 이미지는 연습할 때마다 반복 조회된다. S3 API 호환이라 표준 SDK를 쓴다.

## 결과

- `omr-worker`는 메모리 4GB가 필요하다. 실측에서 Audiveris가 1.4GB를 썼다.
- R2 이미지는 서명 URL(1시간)로 내려준다. 버킷은 비공개.
