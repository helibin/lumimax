# syntax=docker.m.daocloud.io/docker/dockerfile:1.7
#
# Dockerfile 前端经 DaoCloud 拉取，避免 Drone/内网直连 registry-1.docker.io 超时（与 FROM 使用 ovlb 镜像无关）。
# Matches workspace paths expected at runtime: cwd = /app/apps/<app-dir> so
# ../../internal/contracts/proto resolves under /app/internal/...
#
# Example:
#   docker build -f Dockerfile --build-arg APP_PKG=@lumimax/gateway \
#     --build-arg APP_DIR=gateway --build-arg APP_PORT=4000 \
#     --build-arg APP_ENTRY=/app/dist/apps/gateway/src/main.js \
#     --build-arg APP_WORKDIR=/app/apps/gateway -t lumimax-gateway:local .

ARG NODE_IMAGE=ccr.ccs.tencentyun.com/ovlb/node:22-alpine

FROM ${NODE_IMAGE} AS api-deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
RUN pnpm config set registry https://registry.npmmirror.com \
  && pnpm config set store-dir /pnpm/store

WORKDIR /workspace
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json .npmrc ./

COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/base-service/package.json apps/base-service/package.json
COPY apps/biz-service/package.json apps/biz-service/package.json
COPY apps/iot-service/package.json apps/iot-service/package.json

COPY internal/auth/package.json internal/auth/package.json
COPY internal/config/package.json internal/config/package.json
COPY internal/contracts/package.json internal/contracts/package.json
COPY internal/integration/package.json internal/integration/package.json
COPY internal/security/package.json internal/security/package.json

COPY packages/crypto-utils/package.json packages/crypto-utils/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/health/package.json packages/health/package.json
COPY packages/http-kit/package.json packages/http-kit/package.json
COPY packages/logger/package.json packages/logger/package.json
COPY packages/mq/package.json packages/mq/package.json
COPY packages/redis/package.json packages/redis/package.json
COPY packages/runtime/package.json packages/runtime/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/validation/package.json packages/validation/package.json

RUN pnpm install --frozen-lockfile

FROM api-deps AS builder
ARG APP_PKG=@lumimax/gateway
ARG APP_DIR=gateway
WORKDIR /workspace
COPY apps ./apps
COPY packages ./packages
COPY internal ./internal
COPY data ./data
COPY scripts ./scripts
RUN pnpm --filter ${APP_PKG}... build
RUN set -eu \
  && pnpm deploy --filter ${APP_PKG} --prod /opt/app \
  && node scripts/docker/hoist-runtime-deps.mjs /opt/app/node_modules \
  && rm -rf /opt/app/dist \
  && mkdir -p /opt/app/apps/${APP_DIR} /opt/app/dist/apps /opt/app/internal/contracts /opt/app/data/db \
  && cp apps/${APP_DIR}/package.json /opt/app/apps/${APP_DIR}/package.json \
  && cp -R "dist/apps/${APP_DIR}" /opt/app/dist/apps/ \
  && cp -R dist/packages /opt/app/dist/ \
  && cp -R dist/internal /opt/app/dist/ \
  && cp -R internal/contracts/proto /opt/app/internal/contracts/ \
  && cp -R data/db/migrations /opt/app/data/db/ \
  && cp -R data/db/seeds /opt/app/data/db/ \
  && test -f "/opt/app/dist/apps/${APP_DIR}/src/main.js" \
  && test -d /opt/app/dist/packages/http-kit/src

FROM ${NODE_IMAGE} AS packager
WORKDIR /app
COPY --from=builder /opt/app ./
RUN find /app/dist -type f -name '*.map' -delete \
  && rm -rf /app/node_modules/typescript /app/node_modules/ts-node /app/node_modules/@types \
  && find /app/node_modules/.pnpm -maxdepth 1 \( -name 'typescript@*' -o -name 'ts-node@*' -o -name '@types+*' \) -exec rm -rf {} + \
  && find /app/node_modules -type f \( -name '*.map' -o -name '*.md' -o -name '*.markdown' -o -name '*.ts' \) -delete \
  && find /app/node_modules -type d \( -name test -o -name tests -o -name testing -o -name __tests__ -o -name docs -o -name doc -o -name example -o -name examples \) -prune -exec rm -rf {} +

FROM ${NODE_IMAGE} AS runner
ARG APP_PORT=4000
ARG APP_ENTRY=/app/dist/apps/gateway/src/main.js
ARG APP_WORKDIR=/app/apps/gateway
WORKDIR /app
USER root
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV APP_ENTRY=${APP_ENTRY}
COPY --chown=node:node --from=packager /app ./
RUN mkdir -p /app/logs && chown node:node /app/logs
WORKDIR ${APP_WORKDIR}
USER node
EXPOSE ${APP_PORT}
CMD ["sh", "-lc", "node \"$APP_ENTRY\""]
