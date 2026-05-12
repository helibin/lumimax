# Web Admin Docker 部署

当前根目录 Docker 部署同时支持：

- `apps/admin`
- `apps/www`

## 构建镜像

```bash
pnpm --dir web install
docker build /Volumes/dev/workspace/@ai/lumimax/web \
  -f /Volumes/dev/workspace/@ai/lumimax/web/Dockerfile \
  --build-arg APP_NAME=admin \
  -t lumimax-admin-web

docker build /Volumes/dev/workspace/@ai/lumimax/web \
  -f /Volumes/dev/workspace/@ai/lumimax/web/Dockerfile \
  --build-arg APP_NAME=www \
  -t lumimax-www-web
```

也可以直接使用 compose：

```bash
cd /Volumes/dev/workspace/@ai/lumimax/web
docker compose up --build -d
```

## 运行容器

默认情况下，前端会将 `/api/*` 请求代理到 `API_UPSTREAM`。

默认映射：

- `admin-web` -> `8010`
- `www-web` -> `8011`

如果和后端放在同一个 Docker 网络内，可以把 `API_UPSTREAM` 改成服务名，例如：

```bash
-e API_UPSTREAM=http://gateway:4000
```

## 当前约定

- `admin` 生产环境 `VITE_GLOB_API_URL=/`
- 浏览器请求路径为 `/api/*`
- nginx 负责把 `/api/*` 转发给后端网关
- 静态资源目录为 `apps/<app>/dist`
