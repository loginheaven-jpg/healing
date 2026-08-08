# web 서비스. API + 클라이언트 정적 파일을 한 프로세스가 제공합니다.
FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

# 매니페스트만 먼저 복사해 레이어 캐시를 씁니다.
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

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY --from=build /app /app
RUN pnpm install --frozen-lockfile --prod --filter @healing/web...

WORKDIR /app/apps/web
EXPOSE 8080
CMD ["node", "dist/server/index.js"]
