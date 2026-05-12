# syntax=docker/dockerfile:1.7
#
# Multi-app static build: pass APP_NAME=admin | www (matches apps/<name>).
# API_UPSTREAM is rendered explicitly at container startup.

ARG NODE_IMAGE=registry.cn-shenzhen.aliyuncs.com/ovlb/node:22-alpine
ARG NGINX_IMAGE=registry.cn-shenzhen.aliyuncs.com/ovlb/nginx:1.23.3-alpine

FROM ${NODE_IMAGE} AS builder

ARG APP_NAME=admin

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_OPTIONS=--max-old-space-size=8192
ENV TZ=UTC
ENV CI=true
ENV VITE_ARCHIVER=false

RUN corepack enable
RUN pnpm config set registry https://registry.npmmirror.com

WORKDIR /app

COPY . /app

RUN if [ "$APP_NAME" = "admin" ]; then \
      pnpm install --filter @lumimax/${APP_NAME}... --filter @lumimax/vite-config... --frozen-lockfile --ignore-scripts; \
    else \
      pnpm install --filter @lumimax/${APP_NAME}... --frozen-lockfile --ignore-scripts; \
    fi
RUN if [ "$APP_NAME" = "admin" ]; then \
      pnpm --filter @lumimax/node-utils stub && \
      pnpm --filter @lumimax/vite-config stub; \
    fi
RUN pnpm --filter @lumimax/${APP_NAME} build

FROM ${NGINX_IMAGE} AS production

ARG APP_NAME=admin

ENV API_UPSTREAM=http://gateway:4000

RUN rm -rf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/apps/${APP_NAME}/dist /usr/share/nginx/html
COPY scripts/deploy/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080

CMD ["/bin/sh", "-c", "envsubst '${API_UPSTREAM}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
