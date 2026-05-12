# Lumimax

> 一套以 IoT 智能营养秤为核心的 **设备 + 饮食识别 + 营养分析** 平台。
> 当前阶段：MVP（北美 + 国内双部署）；详见 [`docs/项目架构总览与开发约束.md`](docs/项目架构总览与开发约束.md)。

---

## 仓库布局

这是一个 **顶层 monorepo**，下面挂两个相对独立的子工作区：

```text
lumimax/
├── api/                # 后端（NestJS / TypeScript / pnpm workspace）
│   ├── apps/{gateway,base-service,biz-service}/
│   ├── packages/* internal/* configs/*
│   └── pnpm-workspace.yaml   # 独立 workspace
│
├── web/                # 前端（Vben Admin / Vue3 / pnpm workspace）
│   ├── apps/{admin,www}/
│   ├── packages/* internal/*
│   └── pnpm-workspace.yaml   # 独立 workspace
│
├── docker/             # 单镜像 lumimax:latest 构建（Dockerfile + nginx + entrypoint）
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── supervisord.conf
│   ├── .env.example
│   └── entrypoint.sh
│
├── docs/               # 项目级架构与开发约束（先读它）
│   ├── 项目架构总览与开发约束.md
│   ├── 饮食中心模块规范.md
│   ├── 设备协议模块规范.md
│   └── IoT通讯模块规范.md
│
├── compose.stack.yml   # 单业务镜像 + postgres/redis/rabbitmq/emqx
├── package.json        # 顶层编排（不做 pnpm install 合并）
├── Makefile            # 快捷命令入口
└── README.md
```

> ⚠️ **顶层不做 `pnpm install` 合并**：`api/` 与 `web/` 的 pnpm `catalog` 在 TypeScript / ESLint / Node types 等版本上有冲突，硬合会触发大量解析问题。所以根目录只做**编排**（脚本与 Docker），子项目各自维护 `pnpm-workspace.yaml`。跨端共享契约以 **后端 `api/internal/contracts` 等为真源**；若需独立共享包，另建仓库发布 npm 等后再接入（见 [docs/项目架构总览与开发约束.md](docs/项目架构总览与开发约束.md) §2）。

---

## CI/CD（GitHub Actions + Drone）

| 系统 | 文件 | 说明 |
| --- | --- | --- |
| **GitHub Actions** | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | PR / `main` 等分支：并行跑 **api**（`arch:check` + `lint` + `build`）与 **web**（`build:admin` + `build:www`）。 |
| **GitHub Actions** | [`.github/workflows/docker.yml`](.github/workflows/docker.yml) | **checkout** 后按 **路径上下文** 构建 `docker/Dockerfile`，**仅**推 **Harbor**（`hub.vlb.cn/work/lumimax`，可改 `HARBOR_IMAGE`）。需 `HARBOR_USERNAME` / `HARBOR_PASSWORD`；可选 `FEISHU_WEBHOOK`。 |
| **自建 Drone** | [`.drone.yml`](.drone.yml) | `ci-api` / `ci-web` / `docker-lumimax`；可选飞书 `FEISHU_WEBHOOK`；镜像推送用 `plugins/docker` + 仓库 Secrets。说明见 [`docs/Drone-CI.md`](docs/Drone-CI.md)。 |

GitHub 只识别仓库根下的 `.github/workflows/`。`api/.github/`、`web/.github/` 里的 workflow 在单仓根目录 **不会自动执行**；可迁到根 `.github/` 或改为被根 workflow 复用。

**GitHub 与 Drone 同时启用**时，同一 `push` 会各触发一套流水线；可按 [`docs/Drone-CI.md`](docs/Drone-CI.md) §5 做职责拆分（例如仅 Drone 推内网镜像）。

---

## 快速开始

### 1. 一次性安装依赖

```bash
make install
# 等价于：
#   pnpm --dir api install
#   pnpm --dir web install
```

### 2. 启动基础设施（PostgreSQL / Redis / RabbitMQ）

```bash
pnpm --dir api infra:up      # docker compose 拉起依赖服务
make db-setup                # 建库 + migrate + seed
```

### 3. 启动后端（gateway / base / biz）

```bash
make dev-api
# 等价：pnpm --dir api dev
```

默认端口：

| 服务 | HTTP | gRPC |
| --- | --- | --- |
| gateway | 4000 | - |
| base-service | 4020 | 4120 |
| biz-service | 4030 | 4130 |

### 4. 启动前端

```bash
make dev-admin    # admin 管理后台
make dev-www      # 官网
```

---

## 单镜像部署（`lumimax:latest`）

适用场景：**单机 VPS / 私有化 / Demo / 小规模生产（< 100 QPS）**。

镜像内组成：

```text
nginx:80（compose 默认映射宿主机 8080:80）
├── /              → /var/www/www       (www SPA 静态)
├── /admin/        → /var/www/admin     (admin SPA 静态)
├── /api/          → 127.0.0.1:4000     (gateway REST + /api/docs 文档)
└── /health        → 127.0.0.1:4000   (gateway 健康检查)

supervisord
├── nginx
├── node gateway main.js       :4000
├── node base-service main.js  :4020
└── node biz-service main.js   :4030
```

### 构建并运行

```bash
# 构建
make docker-build
# 或: docker build -f docker/Dockerfile -t lumimax:latest .

# 单容器跑（依赖外部 postgres/redis/rabbitmq）
cp docker/.env.example .env    # 按需修改
make docker-run

# 或一键起业务镜像 + 依赖设施
make compose-up
make compose-logs
make compose-down
```

访问：

- 官网：`http://localhost:8080/`
- 后台：`http://localhost:8080/admin/`
- API：`http://localhost:8080/api/`（例如 `.../api/auth/login`）
- 健康：`http://localhost:8080/health`
- Swagger 聚合：`http://localhost:8080/api/docs`

### 何时不应使用单镜像栈

- FE 需要走 CDN
- BE 需要按服务独立扩缩容（`biz-service` 单独扩多副本）
- 灰度发布按服务进行
- 日活 > 10k 或持续 QPS > 100

这些场景请走 [`api/Dockerfile`](api/Dockerfile) + [`web/Dockerfile`](web/Dockerfile) 的多镜像方案。

---

## 文档导览

| 优先级 | 文档 | 说明 |
| --- | --- | --- |
| ⭐ 1 | [`docs/项目架构总览与开发约束.md`](docs/项目架构总览与开发约束.md) | 跨域硬约束（任何开发先读） |
| 2 | [`docs/饮食中心模块规范.md`](docs/饮食中心模块规范.md) | diet 域详细流程与选型 |
| 2 | [`docs/设备协议模块规范.md`](docs/设备协议模块规范.md) | v1.3 设备协议合同 |
| 2 | [`docs/IoT通讯模块规范.md`](docs/IoT通讯模块规范.md) | broker / 桥接 / 多 vendor |
| 3 | [`api/AGENTS.md`](api/AGENTS.md) | api 子项目 Agent 协作规则 |
| 3 | [`api/docs/分阶段路线图.md`](api/docs/分阶段路线图.md) | 阶段范围与不做清单 |

---

## 技术栈速览

- 后端：NestJS 11 + TypeScript + TypeORM + PostgreSQL 16 + Redis 7 + RabbitMQ 3.13 + gRPC + Protobuf + pino
- 前端：Vue 3 + Vite + Vben Admin 5 + Tailwind 4 + Pinia
- 编排：pnpm 10 workspace + Turbo
- 部署：Docker + 单镜像 `lumimax:latest` 或多镜像（按服务）

---

## License

私有，未开源。
