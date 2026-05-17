# Lumimax 单镜像（`lumimax:latest`）

> 把 **4 个 Nest 后端（目标含 iot-service）+ admin/www 静态 + nginx** 打成 **一个镜像**，由 supervisord **多进程** 守护，对外只暴露 80。
> **逻辑上**为四服务（见 [`docs/项目架构总览与开发约束.md`](../docs/项目架构总览与开发约束.md) §2.4、§3）；**物理上**同容器、loopback gRPC，降低初期运维成本。
> 适用：单机 VPS / 私有化 / Demo / 早期生产。上 K8s 时可同一镜像多 Deployment，或迁 `api/Dockerfile` 多镜像，**事件契约无需改**。

---

## 一、产物组成

```
镜像内：
  /app/api/dist/apps/gateway/src/main.js          → node 4000 (loopback)
  /app/api/dist/apps/base-service/src/main.js     → node 4020 (loopback)
  /app/api/dist/apps/biz-service/src/main.js      → node 4030 (loopback)
  /app/api/dist/apps/iot-service/src/main.js      → node 4040 (loopback)
  /var/www/admin/                                  → admin SPA (VITE_BASE=/admin/)
  /var/www/www/                                    → www SPA (VITE_BASE=/)
  /etc/nginx/nginx.conf                            → nginx 80 (唯一对外)
  /etc/supervisord.conf                            → 守护 nginx + gateway + base + biz + iot
```

对外路由：

| 路径                 | 去向                       |
| -------------------- | -------------------------- |
| `xxx:80/`            | `/var/www/www` 静态        |
| `xxx:80/admin/`      | `/var/www/admin` 静态      |
| `xxx:80/api/`        | `127.0.0.1:4000` (gateway) |
| `xxx:80/api/docs` 等 | gateway 文档聚合 + Swagger |
| `xxx:80/health`      | gateway 健康检查           |

---

## 二、构建

```bash
# 在仓库根目录执行
docker build -f docker/Dockerfile -t lumimax:latest .

# 或：
make docker-build
```

构建过程（3 个构建 stage + `runner`）：

1. `api-builder`：装依赖 + `pnpm build:platform` + 删除 `dist/**/*.map`；运行 **`assert-runtime-resolve`**；随后删除 `node_modules` 内 `*.md` / `*.map`、删除 **`apps/*/src`** 与 **`packages/**/src`、`internal/**/src`**（跳过各包下 `node_modules`）、执行 **`pnpm store prune`**，再进入 `runner`。
2. `web-builder`：**一次** `pnpm install`（`admin` + `www` + `vite-config` 过滤）+ **`VITE_BASE=/admin/`** 构建 admin + **`VITE_BASE=/`** 构建 www；`pnpm` store 使用 BuildKit **`cache` mount**（仅加速构建，**不**进入最终镜像）。
3. `runner`：alpine + nginx + supervisor + node；拷贝 `api` 的 `dist`、`node_modules`、`apps`（无 `src`）、`packages`、`internal`、`data`、`package.json`、**`pnpm-workspace.yaml`**、**`i18n`**，以及 **`/pnpm/store`**（见下文）。

镜像体积仍主要来自 **`node_modules` + pnpm store**；上述步骤在**不破坏 pnpm 链接**的前提下尽量压缩可 COPY 的源码与 store 冗余。

**Dockerfile 前置**：`docker/Dockerfile` 首行 `# syntax=docker.m.daocloud.io/docker/dockerfile:1.8`（减轻直连 Docker Hub 拉 Dockerfile 前端超时）。**api-builder** 阶段对各子包 `package.json` 使用 **显式 `COPY`**（与旧版 `COPY --parents` 等价），以便在 **未启用 Dockerfile labs 解析器** 的 `docker build`（如部分 Drone `plugins/docker`）上也能解析；**新增** `api/apps|internal|packages` 下的一级子包时，请在本 Dockerfile 中 **补一行** `COPY api/.../package.json ...`。

**`RUN --mount=type=cache`**（web-builder）仍需要 **BuildKit**；若 runner 关闭 BuildKit，需开启 `DOCKER_BUILDKIT=1` 或 daemon 启用 BuildKit。

---

## 三、运行

### 方式 1：单容器（依赖外部 PG/Redis/RabbitMQ）

```bash
cp docker/.env.example .env
vim .env    # 填 DB_URL / JWT_SECRET / RABBITMQ_URL / REDIS_URL ...

docker run --rm -p 8080:80 --env-file .env --name lumimax lumimax:latest
```

### 方式 2：compose 一键带依赖

```bash
make compose-up      # docker compose -f compose.stack.yml up -d --build
make compose-logs
make compose-down
```

若要直接使用仓库镜像而不是本地构建，可额外传入 `LUMIMAX_IMAGE`：

```bash
echo "LUMIMAX_IMAGE=hub.vlb.cn/work/lumimax:latest" > .image.env
docker compose -f compose.stack.yml --env-file .env --env-file .image.env pull lumimax
docker compose -f compose.stack.yml --env-file .env --env-file .image.env up -d
```

---

## 四、设计要点 / 取舍

### 为什么是一个镜像、多个进程？

- 单镜像 = 部署/回滚单位变成 1，符合小团队节奏
- 多进程 = 保持 **gateway / base / biz / iot-service** 各自独立 `main.js` 与 gRPC 地址，**禁止**合并成一个 Node 进程
- 与目标四服务一致：先 Compose 单机，后 K8s 按服务拆 Pod 或拆镜像，**业务与 RabbitMQ routing key 不必推倒重来**

### 为什么不用 PM2？

- supervisord 在 Alpine 包小，对 PID 1、stdout 转发、子进程退出处理更稳
- Node 进程的真实日志由 NestJS pino 自己处理；supervisord 只负责 stdout/stderr 转到容器日志

### 端口策略

- nginx 是唯一对外端口 80
- 四个 Node 服务**只监听 127.0.0.1**（loopback），不暴露到容器网络
- gRPC 端口（4120/4130/4140）也只在 loopback 内通信，避免误暴露
- **biz-service** 仅消费 `lumimax.q.biz.events`；**iot-service** 消费 upstream/downstream bridge 队列

### 配置注入

| 来源                                       | 用途            |
| ------------------------------------------ | --------------- |
| `--env-file .env` / compose `environment:` | 业务配置        |
| `/app/api/configs/` (镜像内置)             | 默认值 / schema |
| 不挂载本地 `node_modules` / 源码           | 生产保证可复现  |

### pnpm store 与 `COPY node_modules`（避免 `reflect-metadata` / `@lumimax/*` 找不到）

pnpm 使用全局 content store（构建阶段目录 **`/pnpm/store`**）。`node_modules` 里大量文件是**指向 store 的硬链**，若 runner 镜像里只复制 `api/node_modules` 而不复制 **`/pnpm/store`**，运行时就会出现 **`Cannot find module`**（包括 `reflect-metadata`、`@lumimax/config` 等 workspace 包）。

本镜像在 runner 阶段同时执行：

```dockerfile
COPY --from=api-builder /workspace/api/node_modules  /app/api/node_modules
COPY --from=api-builder /pnpm/store                  /pnpm/store
```

路径必须与构建阶段一致（均为 `/pnpm/store`）。**不要用 `node-linker=hoisted` 代替复制 store**：hoisted 下 workspace 注入更易丢链，仍会出现仅缺 `@lumimax/*` 的情况。

单镜像换取「拷过来就能跑」时，体积会随 store 增大。

### `NODE_PATH`（supervisord）

入口脚本是 **`/app/api/dist/apps/<app>/src/main.js`**，业务代码还会从 **`/app/api/dist/packages/<pkg>/src/*.js`** 执行（例如 `@lumimax/storage`）。从这些路径向上解析 **不会** 经过 **`packages/storage/node_modules`**，而 **`@aws-sdk/client-s3`** 等依赖只挂在 **`storage` 子包** 或 pnpm 虚拟树的 **`node_modules/.pnpm/node_modules`** 下。

因此每个进程设置（顺序有意义）：

`NODE_PATH=/app/api/node_modules/.pnpm/node_modules:/app/api/apps/<app>/node_modules:/app/api/node_modules`

前者覆盖 pnpm 扁平可见依赖（含 `@aws-sdk/*`），中间为当前应用直连依赖，`/app/api/node_modules` 兜底。

---

## 五、何时拆部署（K8s / 多镜像）

下列任意一条命中，可从本单镜像演进到 **多 Deployment 或** [`api/Dockerfile`](../api/Dockerfile) 多镜像：

- `iot-service` 与 `biz-service` 需要 **独立扩缩容**（设备高峰 vs 食物分析/LLM 高峰）
- `biz-service` 或 `gateway` 需要按服务灰度
- FE 进了 CDN（admin/www 不再由 nginx 直出）
- 日活 > 10k 或持续 QPS > 100
- 多区域部署要拆服务做 GTM / 边缘路由

**两种 K8s 演进（均可行）**：

1. **同镜像、多 Deployment**：例如 `lumimax-api`（gateway+base+biz 仍可用 supervisord 或拆 command）、`lumimax-iot`（只起 `iot-service` 的 `main.js`）；环境变量 `BIZ_SERVICE_GRPC_URL` 等指向 Service DNS。
2. **多镜像**：`api/Dockerfile` 按 `APP_DIR` 构建；Ingress 指 gateway；iot-service 无公网 Ingress。

**业务代码不需要为「拆 Pod」而大改**：把 supervisord 里某一 `program:` 换成独立 Deployment 即可；nginx 中 `127.0.0.1:4000` 改为 `gateway:4000`（或集群内 Service 名）。

---

## 六、调试速查

```bash
# 进入容器
make compose-shell

# 查看进程
supervisorctl status

# 重启某个进程
supervisorctl restart gateway

# 查 nginx 配置
nginx -t

# 看后端日志（pino 写盘）
ls /app/api/logs/

# 看 supervisor 转发的日志
docker logs lumimax -f
```

---

## 七、安全清单（生产前必看）

- [ ] `JWT_SECRET` 替换为 ≥ 32 字符强随机
- [ ] `RABBITMQ_URL` 用户名密码替换
- [ ] `DB_URL` 用 IAM / Secret Manager 注入，不写明文
- [ ] HTTPS：本镜像**不内置 TLS**，前置 ALB / Cloudflare / Nginx Reverse Proxy 终结 TLS
- [ ] `STORAGE_PUBLIC_BASE_URL` 必须配 CDN 或独立桶域
- [ ] 容器以 non-root 运行（已在 supervisord 中设为 `user=app`）
- [ ] 数据库 migration 由外部流水线执行：`pnpm --dir api infra:setup`；RabbitMQ exchange / 主队列 / 消费者绑定由 API 启动时自动 assert
