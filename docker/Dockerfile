# syntax=docker.m.daocloud.io/docker/dockerfile:1.18-labs
#
# Lumimax 单镜像（nginx + 3 个 NestJS + admin/www 静态）
# - 把 gateway / base-service / biz-service + admin SPA + www SPA + nginx 打进同一镜像，由 supervisord 守护。
# - 适合：小规模 / 单机 / 私有化 / Demo。
#
# 路由（compose 默认把宿主机 8080 映射到容器 80 / nginx）：
#   /              → www 静态
#   /admin/        → admin 静态（构建时 VITE_BASE=/admin/）
#   /api/          → gateway REST
#   /api/docs      → gateway 文档聚合 + Swagger
#   /health        → gateway 健康检查
#
# Build:
#   docker build -f docker/Dockerfile -t lumimax:latest .
#
# Run:
#   docker run --rm -p 8080:80 --env-file .env lumimax:latest

ARG NODE_IMAGE=node:22-alpine

# ============================================================================
# Stage 1: API builder
# 编译 3 个 NestJS 服务（gateway / base-service / biz-service）
# 输出：/workspace/api/{apps,packages,internal,data,dist,node_modules}
# ============================================================================
FROM ${NODE_IMAGE} AS api-builder

# 构建阶段不要用 NODE_ENV=production：会触发部分工具链走「生产裁剪」路径；
# 依赖安装与编译完成后只做 dist 去 map，不再对 node_modules 做 prune / 批量删文件
# （pnpm prune --prod + 删 node_modules 内 *.ts 会破坏 symlink，运行时出现 Cannot find module 'reflect-metadata'）。
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true

RUN corepack enable \
 && pnpm config set store-dir /pnpm/store

# manifest 缓存层：只拷 workspace 根配置 + 各子包 package.json（不写死每个路径）。
# 使用 COPY --parents + 通配符（需 BuildKit、syntax 使用 dockerfile 前端 labs）；WORKDIR=/workspace，产物落在 /workspace/api。
# Dockerfile 首行 syntax 指向 DaoCloud 镜像代理，避免内网/国内拉 registry-1.docker.io 超时。
WORKDIR /workspace
COPY api/package.json api/pnpm-workspace.yaml api/pnpm-lock.yaml api/turbo.json api/tsconfig.base.json api/tsconfig.runtime.json api/.npmrc ./api/
COPY --parents api/apps/*/package.json api/internal/*/package.json api/packages/*/package.json .
WORKDIR /workspace/api

# pnpm 使用全局 store（/pnpm/store）；runner 必须连同 store 一起 COPY，否则硬链/符号链断开，
# 会出现 reflect-metadata、@lumimax/* workspace 包等 MODULE_NOT_FOUND。（不要用 node-linker=hoisted
# 代替 store：hoisted 下 workspace 注入更易丢链，仅拷 node_modules 仍找不到 @lumimax/config 等。）

# 装依赖（dev + prod）
RUN pnpm install --frozen-lockfile --ignore-scripts

# 拉源码并构建（COPY 无法排除子目录；宿主 node_modules 必须由仓库根 .dockerignore 拦下，否则会覆盖/污染 pnpm 树）
COPY api/apps      ./apps
COPY api/packages  ./packages
COPY api/internal  ./internal
COPY api/data      ./data
COPY api/scripts   ./scripts
COPY api/i18n      ./i18n
COPY api/eslint.config.mjs ./eslint.config.mjs

RUN pnpm build:platform

# 仅去掉编译产物 source map（不要 prune / 不要扫删 node_modules：会破坏 pnpm 链接与若干包的入口）
RUN find ./dist -type f -name '*.map' -delete

# 构建期断言：校验各 app 的 dependencies 在 apps/<app>/node_modules 下均已链接（含 package.json）；见 api/scripts/docker/assert-runtime-resolve.mjs
RUN node ./scripts/docker/assert-runtime-resolve.mjs /workspace/api

# 去掉 node_modules 内 Markdown 文档（不影响运行时解析；通常可省数十 MB）
RUN find ./node_modules -type f \( -name '*.md' -o -name '*.markdown' \) -delete 2>/dev/null || true

# 去掉 node_modules 内 source map（运行时不需要）
RUN find ./node_modules -type f -name '*.map' -delete 2>/dev/null || true

# 编译完成后删除 TS 源码：运行时只读 dist + proto + SQL；显著减小 COPY 进 runner 的体积
RUN set -eu; \
  rm -rf apps/gateway/src apps/base-service/src apps/biz-service/src; \
  find ./packages ./internal \( -name node_modules -prune \) -o \( -type d -name src -exec rm -rf {} + \)

# 剪掉 store 中未被当前 node_modules 引用的包（pnpm 官方推荐在镜像打包前执行）
RUN pnpm store prune

# ============================================================================
# Stage 2: Web builder（admin + www）
# 单次 COPY web + 单次 install，避免两套 node_modules 层；store 用 BuildKit cache（runner 不拷 web store）
# ============================================================================
FROM ${NODE_IMAGE} AS web-builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_OPTIONS=--max-old-space-size=8192 \
    CI=true \
    VITE_ARCHIVER=false

ARG ADMIN_BASE=/admin/
ARG WWW_BASE=/

RUN corepack enable \
 && pnpm config set store-dir /pnpm/store

WORKDIR /workspace/web
COPY web/ ./

RUN --mount=type=cache,id=pnpm-web-store,target=/pnpm/store \
    pnpm install --filter @lumimax/admin... --filter @lumimax/www... --filter @lumimax/vite-config... --frozen-lockfile --ignore-scripts \
 && pnpm --filter @lumimax/node-utils stub \
 && pnpm --filter @lumimax/vite-config stub \
 && VITE_BASE="${ADMIN_BASE}" pnpm --filter @lumimax/admin build \
 && VITE_BASE="${WWW_BASE}" pnpm --filter @lumimax/www build

# ============================================================================
# Stage 3: Runner
# Alpine + nginx + supervisor + node + 所有制品
# ============================================================================
FROM ${NODE_IMAGE} AS runner

RUN apk add --no-cache nginx supervisor openssl tini ca-certificates tzdata \
 && mkdir -p /var/log/supervisor /run/nginx /var/log/nginx \
 && addgroup -S app && adduser -S app -G app

ENV NODE_ENV=production \
    TZ=UTC

WORKDIR /app

# ---- 后端制品（api/） ----
COPY --from=api-builder /workspace/api/dist          /app/api/dist
COPY --from=api-builder /workspace/api/node_modules  /app/api/node_modules
# pnpm content-addressable store：必须与 node_modules 同镜像、路径保持 /pnpm/store
COPY --from=api-builder /pnpm/store                  /pnpm/store
COPY --from=api-builder /workspace/api/apps          /app/api/apps
COPY --from=api-builder /workspace/api/packages      /app/api/packages
COPY --from=api-builder /workspace/api/internal      /app/api/internal
COPY --from=api-builder /workspace/api/data          /app/api/data
COPY --from=api-builder /workspace/api/package.json  /app/api/package.json
COPY --from=api-builder /workspace/api/pnpm-workspace.yaml /app/api/pnpm-workspace.yaml
COPY --from=api-builder /workspace/api/i18n            /app/api/i18n

# ---- 前端制品 ----
COPY --from=web-builder /workspace/web/apps/admin/dist /var/www/admin
COPY --from=web-builder /workspace/web/apps/www/dist   /var/www/www

# ---- 配置 ----
COPY docker/nginx.conf        /etc/nginx/nginx.conf
COPY docker/supervisord.conf  /etc/supervisord.conf
COPY docker/entrypoint.sh     /entrypoint.sh
RUN chmod +x /entrypoint.sh \
 && mkdir -p /app/logs /app/run /tmp/nginx \
 && chown -R app:app /app/logs /app/run /tmp/nginx /var/www

# 服务端口（容器内）
# 80    -> nginx 唯一对外端口（compose 映射宿主机 8080:80）
# 4000  -> gateway (loopback only)
# 4020  -> base-service (loopback only)
# 4030  -> biz-service (loopback only)
EXPOSE 80

# 健康检查由 compose.stack.yml 的 healthcheck 定义（避免镜像内再维护脚本）
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/entrypoint.sh"]
