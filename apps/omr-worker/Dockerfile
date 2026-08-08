# 이미지 인식 워커.
#
# **P0 판입니다.** 빈 워커가 배포되는지만 확인합니다.
# P3 에서 아래를 더합니다 — 규격은 docs/ARCHITECTURE.md 3.5절에 그대로 있습니다.
#   · openjdk-21-jre-headless, tesseract-ocr, python3-opencv, poppler-utils
#   · Audiveris 5.9.0 deb  (dpkg -i ... || true — 후처리 스크립트가 종료 코드 3으로 죽지만 본체는 정상 설치됩니다)
#   · 레거시 포함 tessdata (kor 약 15MB / eng 약 23MB. apt 판 1.7MB 는 쓸 수 없습니다)
#
# 지금 그것들을 넣으면 이미지가 수 GB가 되어 P0 의 배포 확인이 느려집니다.

FROM node:22-bookworm-slim AS build

ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/omr-worker/package.json apps/omr-worker/
COPY apps/web/package.json apps/web/
COPY packages/schema/package.json packages/schema/
COPY packages/db/package.json packages/db/
COPY packages/omr-vector/package.json packages/omr-vector/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @healing/omr-worker... build


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/omr-worker/package.json apps/omr-worker/
COPY apps/web/package.json apps/web/
COPY packages/schema/package.json packages/schema/
COPY packages/db/package.json packages/db/
COPY packages/omr-vector/package.json packages/omr-vector/

RUN pnpm install --frozen-lockfile --prod --filter @healing/omr-worker...

COPY --from=build /app/apps/omr-worker/dist apps/omr-worker/dist

CMD ["node", "apps/omr-worker/dist/index.js"]
