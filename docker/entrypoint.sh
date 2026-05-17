#!/bin/sh
# Lumimax 单镜像容器入口
# - 校验关键环境变量
# - 准备运行目录
# - 拉起 supervisord 守护 4 个进程
set -eu

echo "[lumimax] starting at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[lumimax] node=$(node --version)  nginx=$(nginx -v 2>&1)  supervisor=$(supervisord --version 2>&1)"

# ---------- 必填环境变量 ----------
REQUIRED_VARS="DB_URL JWT_SECRET RABBITMQ_URL REDIS_URL"
missing=""
for v in $REQUIRED_VARS; do
  eval val=\${$v:-}
  if [ -z "${val}" ]; then
    missing="$missing $v"
  fi
done
if [ -n "$missing" ]; then
  echo "[lumimax][FATAL] 缺少必填环境变量:$missing" >&2
  echo "[lumimax][HINT] 参考 docker/.env.example，把变量传入 docker run --env-file 或 docker compose environment。" >&2
  exit 78
fi

# ---------- 软性默认 ----------
export DEFAULT_TENANT_ID="${DEFAULT_TENANT_ID:-tenant000000000000000}"
export STORAGE_VENDOR="${STORAGE_VENDOR:-aws}"
export STORAGE_REGION="${STORAGE_REGION:-us-west-2}"
export STORAGE_UPLOAD_TTL_SECONDS="${STORAGE_UPLOAD_TTL_SECONDS:-900}"
export RABBITMQ_EVENTS_EXCHANGE="${RABBITMQ_EVENTS_EXCHANGE:-lumimax.bus}"
export RABBITMQ_EVENTS_EXCHANGE_TYPE="${RABBITMQ_EVENTS_EXCHANGE_TYPE:-topic}"

# ---------- 运行目录 ----------
mkdir -p /app/run /app/logs /tmp/nginx /tmp/nginx/client_body /tmp/nginx/proxy /tmp/nginx/fastcgi /tmp/nginx/uwsgi /tmp/nginx/scgi
chown -R app:app /app/logs /app/run /tmp/nginx 2>/dev/null || true

# ---------- 启动 supervisord ----------
echo "[lumimax] launching supervisord..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
