# web 서비스. API + 클라이언트 정적 파일을 한 프로세스가 제공합니다.
#
# 두 단계로 나눕니다. runtime 에 dev 의존성을 들이지 않기 위해서입니다.
# build 단계의 node_modules 를 복사한 뒤 지우는 방식은 쓰지 않습니다 —
# pnpm 이 모듈 디렉터리 삭제 여부를 물어보는데 컨테이너에는 TTY 가 없습니다.

FROM node:22-bookworm-slim AS build

# pnpm 을 비대화형으로 돌립니다. 물어보지 않고 진행합니다.
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app
RUN corepack enable

# 매니페스트만 먼저 복사해 레이어 캐시를 씁니다.
# 소스만 바뀌면 install 을 다시 하지 않습니다.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/omr-worker/package.json apps/omr-worker/
COPY packages/schema/package.json packages/schema/
COPY packages/db/package.json packages/db/
COPY packages/omr-vector/package.json packages/omr-vector/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @healing/web... build


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/omr-worker/package.json apps/omr-worker/
COPY packages/schema/package.json packages/schema/
COPY packages/db/package.json packages/db/
COPY packages/omr-vector/package.json packages/omr-vector/

# 빈 디렉터리에 prod 의존성만 설치합니다. 지울 것이 없으니 물어볼 일도 없습니다.
RUN pnpm install --frozen-lockfile --prod --filter @healing/web...

# 빌드 산출물만 가져옵니다. dist/server 와 dist/client 둘 다 들어 있습니다.
COPY --from=build /app/apps/web/dist apps/web/dist

WORKDIR /app/apps/web
EXPOSE 8080
CMD ["node", "dist/server/index.js"]
